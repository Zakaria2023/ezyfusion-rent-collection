-- audit_log is append-only for EVERY role, including the database owner.
--
-- A normal trigger does not fire when a session sets
-- `session_replication_role = replica` (a setting the owner may change), so
-- the owner could DELETE audit rows without any DDL. ENABLE ALWAYS makes the
-- append-only triggers fire in every replication mode. (The owner can still
-- run DDL such as DROP TRIGGER; that is a schema change, visible in
-- migrations and logs, not a silent row edit.)
alter table public.audit_log enable always trigger audit_log_no_update_delete;
alter table public.audit_log enable always trigger audit_log_no_truncate;
