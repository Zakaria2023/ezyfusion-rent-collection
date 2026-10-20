-- =============================================================================
-- 3/4 Access control for the Supabase Data API (PostgREST called with the
-- publishable key + a user's token). Two layers:
--   1. GRANTs decide which operations a role may attempt at all.
--      anon: nothing. authenticated: SELECT on the brief's tables, plus
--      UPDATE of the single column tenants.phone. No INSERT/DELETE anywhere.
--   2. RLS policies decide which rows. Every policy is `to authenticated`.
-- The app's own server code uses Prisma as the owner (bypasses RLS) and does its
-- own authorization; this migration is what protects direct Data API calls.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Grants. Revoke whatever Supabase's default privileges handed out when the
-- tables were created, then grant back the minimum.
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
-- The secret key (service_role) is for server-side Storage cleanup and Auth
-- admin only; it never writes tables (Prisma does), so it cannot either.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from service_role;

grant select on
  public.organizations,
  public.memberships,
  public.units,
  public.tenants,
  public.leases,
  public.invoices,
  public.payments,
  public.payment_allocations,
  public.gateway_bills,
  public.audit_log
to authenticated;

-- Column-level grant: "tenant updates only phone". Even with a permissive row
-- policy, UPDATE of any other column is "permission denied".
grant update (phone) on public.tenants to authenticated;

-- -----------------------------------------------------------------------------
-- RLS helpers. security definer so they can read memberships/tenants/leases
-- without recursing through those tables' own policies; stable so the planner
-- can evaluate `(select private.fn())` once per statement (initPlan) instead of
-- once per row. They only ever answer about auth.uid(), the caller.
-- -----------------------------------------------------------------------------
grant usage on schema private to authenticated;

-- Org of the caller as staff/manager (null if they are not a member).
create function private.member_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id from public.memberships m where m.user_id = (select auth.uid())
$$;

-- Org of the caller as manager (null if not a manager).
create function private.manager_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id from public.memberships m
  where m.user_id = (select auth.uid()) and m.role = 'manager'
$$;

-- Org of the caller as tenant (null if they have no tenant row).
create function private.tenant_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.org_id from public.tenants t where t.user_id = (select auth.uid())
$$;

-- Leases on which the caller is the tenant.
create function private.tenant_lease_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.leases l
  join public.tenants t on t.id = l.tenant_id
  where t.user_id = (select auth.uid())
$$;

-- Units of the leases on which the caller is the tenant.
create function private.tenant_unit_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.unit_id from public.leases l
  join public.tenants t on t.id = l.tenant_id
  where t.user_id = (select auth.uid())
$$;

-- Payments on the leases on which the caller is the tenant.
create function private.tenant_payment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.payments p
  join public.leases l on l.id = p.lease_id
  join public.tenants t on t.id = l.tenant_id
  where t.user_id = (select auth.uid())
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function
  private.member_org_id(),
  private.manager_org_id(),
  private.tenant_org_id(),
  private.tenant_lease_ids(),
  private.tenant_unit_ids(),
  private.tenant_payment_ids()
to authenticated;

-- -----------------------------------------------------------------------------
-- Policies. "member" = staff or manager of the row's organization.
-- -----------------------------------------------------------------------------

-- organizations: own organization (as member or as tenant).
create policy organizations_select on public.organizations
  for select to authenticated
  using (id = (select private.member_org_id()) or id = (select private.tenant_org_id()));

-- memberships: members of the same organization. Tenants: none.
create policy memberships_select on public.memberships
  for select to authenticated
  using (org_id = (select private.member_org_id()));

-- units: members see the organization's units; tenants the units of own leases.
create policy units_select on public.units
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or id in (select private.tenant_unit_ids()));

-- tenants: members see the organization's tenants; a tenant sees own row.
create policy tenants_select on public.tenants
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or user_id = (select auth.uid()));

-- A tenant may update own row; the column grant above limits it to phone.
create policy tenants_update_own_phone on public.tenants
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- leases, invoices, payments, gateway_bills: members see the organization's
-- rows; a tenant sees the rows of own leases.
create policy leases_select on public.leases
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or id in (select private.tenant_lease_ids()));

create policy invoices_select on public.invoices
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or lease_id in (select private.tenant_lease_ids()));

create policy payments_select on public.payments
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or lease_id in (select private.tenant_lease_ids()));

create policy gateway_bills_select on public.gateway_bills
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or lease_id in (select private.tenant_lease_ids()));

-- payment_allocations: members see the organization's; a tenant sees the
-- allocations of payments on own leases.
create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (org_id = (select private.member_org_id())
         or payment_id in (select private.tenant_payment_ids()));

-- audit_log: managers of the organization only.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (org_id = (select private.manager_org_id()));
