-- =============================================================================
-- 2/4 Integrity triggers: defence in depth. The app (Prisma, connected as the
-- table owner, which bypasses RLS) is the first line; these make the important
-- money invariants hold even if app code has a bug.
--
-- All functions live in `private` (not exposed by PostgREST) with an empty
-- search_path, so every name is schema-qualified and cannot be hijacked.
-- Errors use SQLSTATE 23514 (check_violation) or 55000 for illegal state
-- transitions, so the app can map them.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_log is append-only for EVERY role (service_role and the owner too):
-- row triggers stop UPDATE/DELETE, a statement trigger stops TRUNCATE.
-- -----------------------------------------------------------------------------
create function private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only (% refused)', tg_op
    using errcode = '42501';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.audit_log_append_only();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.audit_log_append_only();

-- -----------------------------------------------------------------------------
-- payments
--   INSERT: starts as pending_verification or approved (online: approved only);
--           an online payment must match its bill's lease and amount.
--   UPDATE: identity and money fields are immutable; status only moves forward:
--             pending_verification -> approved | rejected
--             approved             -> voided
--             rejected, voided     -> (terminal)
--           unapplied_sen + allocations may never exceed amount_sen.
--   DELETE: never. Payments are append-only; a void is a status change.
-- -----------------------------------------------------------------------------
create function private.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bill public.gateway_bills%rowtype;
  v_allocated bigint;
begin
  if tg_op = 'DELETE' then
    raise exception 'payments are never deleted (void instead)' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('pending_verification', 'approved') then
      raise exception 'a new payment must be pending_verification or approved, not %', new.status
        using errcode = '23514';
    end if;
    if new.method = 'online' then
      if new.status <> 'approved' then
        raise exception 'an online payment is created approved (by the webhook)' using errcode = '23514';
      end if;
      select * into v_bill from public.gateway_bills where id = new.gateway_bill_id;
      if v_bill.lease_id is distinct from new.lease_id or v_bill.amount_sen <> new.amount_sen then
        raise exception 'online payment must match its gateway bill (lease and amount)'
          using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.org_id <> old.org_id
     or new.lease_id <> old.lease_id
     or new.amount_sen <> old.amount_sen
     or new.method <> old.method
     or new.received_at <> old.received_at
     or new.gateway_bill_id is distinct from old.gateway_bill_id
     or new.slip_path is distinct from old.slip_path
     or new.recorded_by is distinct from old.recorded_by
     or new.created_at <> old.created_at then
    raise exception 'payment % : only status, decision fields and unapplied_sen may change', old.id
      using errcode = '55000';
  end if;

  if new.status <> old.status and not (
       (old.status = 'pending_verification' and new.status in ('approved', 'rejected'))
    or (old.status = 'approved' and new.status = 'voided')
  ) then
    raise exception 'payment % : illegal status change % -> %', old.id, old.status, new.status
      using errcode = '55000';
  end if;

  if new.unapplied_sen <> old.unapplied_sen then
    select coalesce(sum(amount_sen), 0) into v_allocated
      from public.payment_allocations where payment_id = new.id;
    if v_allocated + new.unapplied_sen > new.amount_sen then
      raise exception 'payment % : allocated % + unapplied % exceeds amount %',
        new.id, v_allocated, new.unapplied_sen, new.amount_sen using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger payments_guard
  before insert or update or delete on public.payments
  for each row execute function private.payments_guard();

-- -----------------------------------------------------------------------------
-- gateway_bills: pending -> paid | failed, failed -> paid; paid is terminal
-- (a late paid=false never un-pays a bill). lease and amount are immutable.
-- Also keeps updated_at current.
-- -----------------------------------------------------------------------------
create function private.gateway_bills_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.org_id <> old.org_id
     or new.lease_id <> old.lease_id
     or new.amount_sen <> old.amount_sen then
    raise exception 'gateway bill % : id, org, lease and amount are immutable', old.id
      using errcode = '55000';
  end if;

  if new.status <> old.status and not (
       (old.status = 'pending' and new.status in ('paid', 'failed'))
    or (old.status = 'failed' and new.status = 'paid')
  ) then
    raise exception 'gateway bill % : illegal status change % -> %', old.id, old.status, new.status
      using errcode = '55000';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger gateway_bills_guard
  before update on public.gateway_bills
  for each row execute function private.gateway_bills_guard();

-- -----------------------------------------------------------------------------
-- payment_allocations
--   INSERT/UPDATE: the payment must be approved; invoice and payment must be on
--     the same lease; sum per invoice <= invoice amount; sum per payment <=
--     payment amount. The invoice and payment rows are locked first
--     (FOR NO KEY UPDATE: does not conflict with the FK's KEY SHARE locks, so no
--     deadlock), so two concurrent transactions allocating to the same invoice
--     are serialized and the second one's sum sees the first one's rows
--     (READ COMMITTED takes a fresh snapshot per statement).
--   DELETE: only when the payment is voided (void = set status, then delete its
--     allocations, in one transaction).
-- -----------------------------------------------------------------------------
create function private.payment_allocations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_invoice public.invoices%rowtype;
  v_sum bigint;
begin
  if tg_op = 'DELETE' then
    select * into v_payment from public.payments where id = old.payment_id;
    if v_payment.status <> 'voided' then
      raise exception 'allocations of payment % can only be removed after it is voided', old.payment_id
        using errcode = '55000';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and (new.payment_id <> old.payment_id
                           or new.invoice_id <> old.invoice_id
                           or new.org_id <> old.org_id) then
    raise exception 'allocation % : payment, invoice and org are immutable', old.id
      using errcode = '55000';
  end if;

  select * into v_invoice from public.invoices where id = new.invoice_id for no key update;
  select * into v_payment from public.payments where id = new.payment_id for no key update;

  if v_payment.status <> 'approved' then
    raise exception 'only approved payments can be allocated (payment % is %)', v_payment.id, v_payment.status
      using errcode = '55000';
  end if;
  if v_invoice.lease_id <> v_payment.lease_id then
    raise exception 'payment and invoice belong to different leases' using errcode = '23514';
  end if;

  select coalesce(sum(amount_sen), 0) into v_sum
    from public.payment_allocations where invoice_id = new.invoice_id;
  if v_sum > v_invoice.amount_sen then
    raise exception 'invoice % over-allocated: % > %', v_invoice.id, v_sum, v_invoice.amount_sen
      using errcode = '23514';
  end if;

  select coalesce(sum(amount_sen), 0) into v_sum
    from public.payment_allocations where payment_id = new.payment_id;
  if v_sum > v_payment.amount_sen then
    raise exception 'payment % over-allocated: % > %', v_payment.id, v_sum, v_payment.amount_sen
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- AFTER: the sums must include the row just written.
create trigger payment_allocations_guard
  after insert or update or delete on public.payment_allocations
  for each row execute function private.payment_allocations_guard();

-- -----------------------------------------------------------------------------
-- memberships.user_id / tenants.user_id must name a real auth user. This stands
-- in for a FK to auth.users, which Prisma introspection cannot handle (it
-- refuses cross-schema FKs). Trade-off: deleting an auth user does not cascade;
-- users are not deleted in this app.
-- -----------------------------------------------------------------------------
create function private.require_auth_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is not null
     and not exists (select 1 from auth.users u where u.id = new.user_id) then
    raise exception '%.user_id % is not an auth user', tg_table_name, new.user_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger memberships_require_auth_user
  before insert or update of user_id on public.memberships
  for each row execute function private.require_auth_user();

create trigger tenants_require_auth_user
  before insert or update of user_id on public.tenants
  for each row execute function private.require_auth_user();
