-- =============================================================================
-- 1/4 Schema: tables, constraints, indexes. RLS is enabled here, on every table,
-- in the same migration that creates it; the policies themselves are in
-- 20261020100622_access_control.sql (no policy = no row is visible, so every
-- table is closed from the moment it exists).
--
-- Conventions
--   * money        : bigint, integer sen, columns named *_sen (never float/numeric)
--   * calendar day : date (lease start/end, billing periods, due dates)
--   * instant      : timestamptz (received_at, paid_at, created_at)
--   * every table carries org_id; child tables reference their parent through a
--     composite FK (parent_id, org_id) -> parent(id, org_id), so a row can never
--     point at a parent in another organization, whatever the app sends.
--   * user_id columns hold auth.users.id but have no FK: Prisma introspection
--     refuses cross-schema FKs unless the whole auth schema is pulled into the
--     client. A trigger (integrity_triggers.sql) checks the user exists instead.
-- =============================================================================

-- btree_gist lets a GiST exclusion constraint compare uuids with "=", which the
-- "no two leases on one unit overlap" constraint needs. Installed in the
-- `extensions` schema: functions in `public` would be callable as /rest/v1/rpc.
create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Privileges. Supabase's default privileges grant anon/authenticated ALL on
-- every new table, sequence and function in `public`. Undo that before creating
-- anything; access_control.sql then grants back only what the brief allows.
-- (ALTER DEFAULT PRIVILEGES affects objects created by the current role,
-- postgres, which is the role that runs these migrations.)
-- -----------------------------------------------------------------------------
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- All our functions (RLS helpers, trigger functions) live in `private`, a schema
-- PostgREST does not expose, so no /rest/v1/rpc/... endpoint exists for them.
create schema if not exists private;
-- Functions get EXECUTE for PUBLIC by default; in `private` nothing is callable
-- unless granted explicitly.
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- organizations: a property management company. The tenancy boundary.
-- -----------------------------------------------------------------------------
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;

-- -----------------------------------------------------------------------------
-- memberships: staff and managers. unique (user_id) = a staff member or manager
-- belongs to exactly one organization (the brief's rule, enforced by the DB).
-- Roles come from here, never from user_metadata.
-- -----------------------------------------------------------------------------
create table public.memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique,  -- auth.users.id (no FK: see note at top)
  org_id     uuid not null references public.organizations (id),
  role       text not null check (role in ('manager', 'staff')),
  created_at timestamptz not null default now()
);
create index memberships_org_id_idx on public.memberships (org_id);
alter table public.memberships enable row level security;

-- -----------------------------------------------------------------------------
-- units
-- -----------------------------------------------------------------------------
create table public.units (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  name       text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (org_id, name),
  -- Target of the composite FK from leases. id is first so this index also
  -- serves plain lookups by id (it is the selective column).
  unique (id, org_id)
);
alter table public.units enable row level security;

-- -----------------------------------------------------------------------------
-- tenants: a renter, scoped to one organization. user_id links the auth account
-- (nullable: a tenant record can exist before it has a login). unique (user_id)
-- means one login is one tenant row, so a tenant also sees exactly one org.
-- -----------------------------------------------------------------------------
create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  user_id    uuid unique,           -- auth.users.id (no FK: see note at top)
  full_name  text not null check (char_length(btrim(full_name)) > 0),
  email      text not null check (position('@' in email) > 1),
  -- Tenants edit this themselves through the Data API, so the format is checked
  -- here, not only in the UI: optional +, then digits, spaces or dashes.
  phone      text check (phone ~ '^\+?[0-9][0-9 -]{6,19}$'),
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index tenants_org_id_idx on public.tenants (org_id);
alter table public.tenants enable row level security;

-- -----------------------------------------------------------------------------
-- leases. Both dates are inclusive (end_date is the tenant's last day).
-- -----------------------------------------------------------------------------
create table public.leases (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id),
  unit_id          uuid not null,
  tenant_id        uuid not null,
  start_date       date not null,
  end_date         date not null,
  monthly_rent_sen bigint not null check (monthly_rent_sen > 0),
  deposit_sen      bigint not null check (deposit_sen >= 0),
  -- auth user who created it. Deliberately no FK: it is a historical fact that
  -- must survive the user being deleted (same for recorded_by, decided_by...).
  created_by       uuid,
  created_at       timestamptz not null default now(),
  check (end_date >= start_date),
  -- The unit and the tenant must belong to the lease's own organization.
  foreign key (unit_id, org_id) references public.units (id, org_id),
  foreign key (tenant_id, org_id) references public.tenants (id, org_id),
  unique (id, org_id),
  -- No two leases on the same unit overlap. '[]' = both bounds inclusive.
  -- An exclusion constraint is checked by the index itself, so two concurrent
  -- inserts cannot both succeed (the second waits, then fails with 23P01) —
  -- a "select overlapping then insert" check in the app could not promise that.
  constraint leases_no_overlap exclude using gist (
    unit_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
);
create index leases_org_id_idx on public.leases (org_id);
create index leases_unit_id_org_id_idx on public.leases (unit_id, org_id);
create index leases_tenant_id_org_id_idx on public.leases (tenant_id, org_id);
alter table public.leases enable row level security;

-- -----------------------------------------------------------------------------
-- invoices: exactly what lib/billing.ts generateSchedule returns for the lease.
-- No status column: status is computed by invoiceStatus(), never stored.
-- No paid column: paid = sum(payment_allocations.amount_sen), never stored.
-- -----------------------------------------------------------------------------
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null,
  lease_id     uuid not null,
  kind         text not null check (kind in ('deposit', 'rent')),
  period_index integer,
  period_start date,
  period_end   date,          -- inclusive
  due_date     date not null,
  -- >= 0, not > 0: a prorated last period of one day can round to 0 sen.
  amount_sen   bigint not null check (amount_sen >= 0),
  created_at   timestamptz not null default now(),
  constraint invoices_period_shape check (
    (kind = 'deposit' and period_index is null and period_start is null and period_end is null)
    or
    (kind = 'rent' and period_index >= 0 and period_start is not null
      and period_end >= period_start and due_date = period_start)
  ),
  foreign key (lease_id, org_id) references public.leases (id, org_id),
  unique (id, org_id),
  -- One rent invoice per period AND at most one deposit per lease: the deposit
  -- is the row whose period_index is NULL, and NULLS NOT DISTINCT makes a
  -- second NULL for the same lease a duplicate. (A partial unique index
  -- `where kind = 'deposit'` would say the same, but Prisma introspects it as
  -- lease_id being unique and generates a wrong one-to-one relation.)
  constraint invoices_lease_id_period_index_key
    unique nulls not distinct (lease_id, period_index)
);
-- Allocation order: due date, then deposit before rent, then period index.
-- (Deposit rows have period_index NULL; ASC puts NULLs last, so the query must
-- order by (kind = 'deposit') desc explicitly — the index just narrows to lease.)
-- lease_id leads, so this index also covers the (lease_id, org_id) FK.
create index invoices_allocation_order_idx
  on public.invoices (lease_id, due_date, period_index);
create index invoices_org_id_idx on public.invoices (org_id);
alter table public.invoices enable row level security;

-- -----------------------------------------------------------------------------
-- gateway_bills: an online payment request. The id is what the gateway echoes
-- back and what the tenant sees, so it must be unguessable: 'bill_' + 128 bits
-- of gen_random_uuid() randomness (122 random bits) as 32 hex chars. text, not
-- uuid, because the gateway format is 'bill_...'.
-- -----------------------------------------------------------------------------
create table public.gateway_bills (
  id             text primary key
                   default 'bill_' || replace(gen_random_uuid()::text, '-', '')
                   check (id ~ '^bill_[0-9a-f]{32}$'),
  org_id         uuid not null,
  lease_id       uuid not null,
  amount_sen     bigint not null check (amount_sen > 0),
  status         text not null default 'pending'
                   check (status in ('pending', 'paid', 'failed')),
  transaction_id text,
  paid_at        timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (status <> 'paid' or paid_at is not null),
  foreign key (lease_id, org_id) references public.leases (id, org_id)
);
create index gateway_bills_lease_id_org_id_idx on public.gateway_bills (lease_id, org_id);
create index gateway_bills_org_id_idx on public.gateway_bills (org_id);
alter table public.gateway_bills enable row level security;

-- -----------------------------------------------------------------------------
-- payments: append-only money received. Never deleted; status only moves
-- forward (see integrity_triggers.sql).
-- -----------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  lease_id        uuid not null,
  amount_sen      bigint not null check (amount_sen > 0),
  -- Part of an online payment left over once every invoice is fully paid.
  unapplied_sen   bigint not null default 0
                    check (unapplied_sen >= 0 and unapplied_sen <= amount_sen),
  method          text not null check (method in ('cash', 'bank_transfer', 'online')),
  status          text not null
                    check (status in ('pending_verification', 'approved', 'rejected', 'voided')),
  received_at     timestamptz not null,
  -- Storage object name in bucket payment-slips: '<org_id>/...'. unique: one
  -- uploaded slip can back one payment only.
  slip_path       text unique,
  -- unique: a gateway bill creates at most one payment, ever. This is the
  -- guarantee behind webhook idempotency — a duplicate or concurrent delivery
  -- that gets past the app's checks still dies here with 23505.
  gateway_bill_id text unique references public.gateway_bills (id),
  recorded_by     uuid,
  decided_by      uuid,
  decided_at      timestamptz,
  decision_reason text,
  created_at      timestamptz not null default now(),
  constraint payments_slip_iff_bank_transfer
    check ((method = 'bank_transfer') = (slip_path is not null)),
  constraint payments_bill_iff_online
    check ((method = 'online') = (gateway_bill_id is not null)),
  -- Manual payments are capped at the remaining balance, so only an online
  -- payment can have money left over.
  constraint payments_unapplied_only_online
    check (method = 'online' or unapplied_sen = 0),
  constraint payments_reason_required
    check (status not in ('rejected', 'voided')
           or char_length(btrim(coalesce(decision_reason, ''))) >= 5),
  constraint payments_slip_in_own_org_folder
    check (slip_path is null or starts_with(slip_path, org_id::text || '/')),
  foreign key (lease_id, org_id) references public.leases (id, org_id),
  unique (id, org_id)
);
create index payments_lease_id_org_id_idx on public.payments (lease_id, org_id);
create index payments_org_id_status_received_at_idx
  on public.payments (org_id, status, received_at);  -- collections report
alter table public.payments enable row level security;

-- -----------------------------------------------------------------------------
-- payment_allocations: how much of a payment went to which invoice.
-- invoice paid = sum(amount_sen) over its allocations.
-- -----------------------------------------------------------------------------
create table public.payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  payment_id uuid not null,
  invoice_id uuid not null,
  amount_sen bigint not null check (amount_sen > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, invoice_id),
  foreign key (payment_id, org_id) references public.payments (id, org_id),
  foreign key (invoice_id, org_id) references public.invoices (id, org_id)
);
create index payment_allocations_invoice_id_org_id_idx
  on public.payment_allocations (invoice_id, org_id);
create index payment_allocations_payment_id_org_id_idx
  on public.payment_allocations (payment_id, org_id);
create index payment_allocations_org_id_idx on public.payment_allocations (org_id);
alter table public.payment_allocations enable row level security;

-- -----------------------------------------------------------------------------
-- audit_log: append-only (enforced by triggers for every role, owner included).
-- actor_id has no FK on purpose: an audit row must outlive the user, and an
-- "on delete set null" would be an UPDATE, which the log refuses.
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id),
  actor_id   uuid,
  action     text not null check (char_length(btrim(action)) > 0),
  entity_id  uuid,
  details    jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index audit_log_org_id_created_at_idx on public.audit_log (org_id, created_at desc);
create index audit_log_entity_id_idx on public.audit_log (entity_id);
alter table public.audit_log enable row level security;
