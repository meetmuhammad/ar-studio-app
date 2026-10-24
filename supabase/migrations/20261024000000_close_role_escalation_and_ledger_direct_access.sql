-- Two confirmed privilege holes, closed with the smallest change that fixes each.
--
-- Everything the web app does to these tables goes through API routes using the
-- service-role client, which bypasses grants and RLS entirely. The only thing
-- the browser itself reads is its own row in public.users (auth-context.tsx).
-- So nothing below touches a code path the app uses.
--
-- 1. ROLE ESCALATION (public.users)
--    `authenticated` had INSERT and UPDATE on every column, including `role`,
--    and the policies only checked ownership (`auth.uid() = id`):
--      UPDATE  - a signed-in user could set their own role to 'admin'. A missing
--                WITH CHECK is not the defect (PostgreSQL reuses USING); the
--                defect is that `role` was writable by the user it describes.
--      INSERT  - a signed-in user with no users row (nothing creates one at
--                signup) could insert themselves as an admin.
--    Fix: no client-side writes to users at all. Provisioning is unaffected: it
--    runs through the service role (scripts/setup-user-roles.ts, create-demo-users.ts).
--    SELECT of the user's own row stays, because the dashboard reads its role.
--
-- 2. LEDGER REACHABLE WITHOUT THE API (general_ledger, vendor_ledger)
--    Both had a role-blind `ALL` policy for any `authenticated` user, so a
--    staff user (or anyone who signed up) could read and write the books
--    straight through PostgREST with the public anon key, bypassing any
--    admin check in the API routes. The ledger is admin-only in the web app;
--    this makes the database agree.
--
-- Reversible, but NOT with a generic GRANT: capture the current grants and
-- policies first (scripts/security/capture-grants.sql) and replay that.

-- ---------------------------------------------------------------- users
revoke all on table public.users from anon, authenticated;
grant select on table public.users to authenticated;

drop policy if exists "Allow authenticated insert" on public.users;
drop policy if exists "Users can update own data" on public.users;
-- "Users can read own data" (SELECT, auth.uid() = id) is kept on purpose.

-- ---------------------------------------------------------------- ledger
revoke all on table public.general_ledger from anon, authenticated;
revoke all on table public.vendor_ledger  from anon, authenticated;

-- ---------------------------------------------------------------- assert
do $$
begin
  if has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'role', 'INSERT') then
    raise exception 'authenticated can still write users.role';
  end if;

  if has_column_privilege('anon', 'public.users', 'role', 'UPDATE')
     or has_column_privilege('anon', 'public.users', 'role', 'INSERT') then
    raise exception 'anon can still write users.role';
  end if;

  if not has_table_privilege('authenticated', 'public.users', 'SELECT') then
    raise exception 'authenticated lost SELECT on users; the dashboard reads its role from it';
  end if;

  if has_table_privilege('authenticated', 'public.general_ledger', 'SELECT')
     or has_table_privilege('authenticated', 'public.vendor_ledger', 'SELECT')
     or has_table_privilege('anon', 'public.general_ledger', 'SELECT') then
    raise exception 'ledger tables are still readable by client roles';
  end if;

  if not has_table_privilege('service_role', 'public.general_ledger', 'INSERT') then
    raise exception 'service_role lost access to the ledger; the API would stop working';
  end if;

  raise notice 'role escalation and direct ledger access closed';
end $$;
