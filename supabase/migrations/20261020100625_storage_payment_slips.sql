-- =============================================================================
-- 4/4 Storage: the private payment-slips bucket, its policies, and the rule
-- "a payment's slip_path must point to an existing file in its own
-- organization's folder".
-- =============================================================================

-- Private bucket (no public URLs): reads go through short-lived signed URLs.
-- Size and type limits are enforced by Storage itself, on top of the app's check.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-slips',
  'payment-slips',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do nothing;

-- Object names are '<org_id>/<anything>'. Staff and managers may upload into,
-- and read/list, their own organization's folder only. Tenants and anon have no
-- policy, so they get nothing. There are deliberately no UPDATE/DELETE policies:
-- slips are not overwritten by users, and cleanup after a failed recording is
-- done server-side with the secret key.
create policy payment_slips_insert_own_org on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-slips'
    and (storage.foldername(name))[1] = (select private.member_org_id())::text
  );

create policy payment_slips_select_own_org on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-slips'
    and (storage.foldername(name))[1] = (select private.member_org_id())::text
  );

-- -----------------------------------------------------------------------------
-- payments.slip_path must name an object that really exists in payment-slips,
-- inside the payment's own organization's folder (the CHECK on payments already
-- requires the '<org_id>/' prefix; this adds "and the file exists").
-- security definer: storage.objects is not ours to grant on, the function owner
-- (postgres) can read it.
-- -----------------------------------------------------------------------------
create function private.payments_slip_exists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if split_part(new.slip_path, '/', 1) <> new.org_id::text then
    raise exception 'slip_path must be in the organization''s own folder' using errcode = '23514';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'payment-slips' and o.name = new.slip_path
  ) then
    raise exception 'slip_path % does not exist in bucket payment-slips', new.slip_path
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function private.payments_slip_exists() from public, anon, authenticated;

create trigger payments_slip_exists
  before insert on public.payments
  for each row
  when (new.slip_path is not null)
  execute function private.payments_slip_exists();
