-- Role-scoped row level security for the browser (Refine) client.
--
-- WHY
-- ---
-- The Refine web app now reads and writes some tables directly through
-- PostgREST with the signed-in user's JWT (role `authenticated`). Until now
-- each business table had a single role-blind policy, business_member_all
-- (FOR ALL), so any member of a business -- admin or staff -- could do
-- anything to its rows directly, and `anon` still held ALL table privileges
-- (RLS was the only thing stopping it). This migration makes the database
-- enforce the same roles the UI and the API already apply:
--
-- ROLE MATRIX (every row is additionally limited to the caller's businesses,
-- using the existing business scoping expressions unchanged)
--
--   table                         SELECT   INSERT   UPDATE   DELETE
--   customers                     member   member   member   admin
--   measurements                  member   member   member   admin
--   orders                        member   member   member   admin
--   order_items (via orders)      member   member   member   admin
--   payments                      member   admin    admin    admin
--   vendors                       admin    admin    admin    admin
--   vendor_tags (via vendors)     admin    admin    admin    admin
--   vendor_categories (shared)    any authenticated  admin  admin  admin
--
--   member = admin or staff with a user_businesses row for the row's business.
--   vendor_categories has no business_id: it is one chart shared by every
--   business (20261106000000_multi_business_techlink.sql), so its writes are
--   admin-only without business scoping. Its existing read policy is kept.
--
-- PRIVILEGES
-- ----------
--   anon:          nothing on any table or view in public.
--   authenticated: SELECT/INSERT/UPDATE/DELETE on the eight tables above,
--                  SELECT on orders_with_payment_status (security_invoker, so
--                  the policies above apply through it). No TRUNCATE,
--                  REFERENCES or TRIGGER anywhere. Existing SELECT grants on
--                  users, businesses and user_businesses are left as they are.
--                  general_ledger, vendor_ledger and ledger_mcp_* stay closed.
--   service_role:  untouched.
--
-- UNAFFECTED
-- ----------
-- Every API route (src/app/api/**), src/lib/database.ts, the ledger service
-- and the ledger MCP server use the service-role client, which bypasses RLS
-- and these grants. The mobile app and the MCP server talk to those routes,
-- so their behaviour does not change. Only direct client access is narrowed.
--
-- Idempotent: every policy is dropped if it exists before being created, the
-- helper is CREATE OR REPLACE, and REVOKE/GRANT are repeatable. Runs as one
-- transaction; the checks at the end roll everything back on failure.
-- No data, triggers or existing functions are changed.

begin;

-- ---------------------------------------------------------------- helper
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.role = 'admin' from public.users u where u.id = (select auth.uid())),
    false
  )
$$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated;

-- ---------------------------------------------------------------- policies
-- Tables that carry business_id directly.
do $$
declare
  t text;
  scope constant text := 'business_id in (select public.current_user_business_ids())';
  admin constant text := '(select public.current_user_is_admin())';
begin
  foreach t in array array['customers', 'measurements', 'orders', 'payments', 'vendors'] loop
    execute format('drop policy if exists business_member_all on public.%I', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  end loop;

  -- Members read/insert/update; admins delete.
  foreach t in array array['customers', 'measurements', 'orders'] loop
    execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, scope);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', t || '_insert', t, scope);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', t || '_update', t, scope, scope);
    execute format('create policy %I on public.%I for delete to authenticated using (%s and %s)', t || '_delete', t, admin, scope);
  end loop;

  -- payments: members read; admins write.
  execute format('create policy payments_select on public.payments for select to authenticated using (%s)', scope);
  execute format('create policy payments_insert on public.payments for insert to authenticated with check (%s and %s)', admin, scope);
  execute format('create policy payments_update on public.payments for update to authenticated using (%s and %s) with check (%s and %s)', admin, scope, admin, scope);
  execute format('create policy payments_delete on public.payments for delete to authenticated using (%s and %s)', admin, scope);

  -- vendors: admins only.
  execute format('create policy vendors_select on public.vendors for select to authenticated using (%s and %s)', admin, scope);
  execute format('create policy vendors_insert on public.vendors for insert to authenticated with check (%s and %s)', admin, scope);
  execute format('create policy vendors_update on public.vendors for update to authenticated using (%s and %s) with check (%s and %s)', admin, scope, admin, scope);
  execute format('create policy vendors_delete on public.vendors for delete to authenticated using (%s and %s)', admin, scope);
end;
$$;

-- order_items: scoped through the parent order (expression unchanged).
drop policy if exists business_member_all on public.order_items;
drop policy if exists order_items_select on public.order_items;
drop policy if exists order_items_insert on public.order_items;
drop policy if exists order_items_update on public.order_items;
drop policy if exists order_items_delete on public.order_items;

create policy order_items_select on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_items.order_id
                    and o.business_id in (select public.current_user_business_ids())));
create policy order_items_insert on public.order_items for insert to authenticated
  with check (exists (select 1 from public.orders o
                       where o.id = order_items.order_id
                         and o.business_id in (select public.current_user_business_ids())));
create policy order_items_update on public.order_items for update to authenticated
  using (exists (select 1 from public.orders o
                  where o.id = order_items.order_id
                    and o.business_id in (select public.current_user_business_ids())))
  with check (exists (select 1 from public.orders o
                       where o.id = order_items.order_id
                         and o.business_id in (select public.current_user_business_ids())));
create policy order_items_delete on public.order_items for delete to authenticated
  using ((select public.current_user_is_admin())
         and exists (select 1 from public.orders o
                      where o.id = order_items.order_id
                        and o.business_id in (select public.current_user_business_ids())));

-- vendor_tags: scoped through the parent vendor (expression unchanged); admins only.
drop policy if exists business_member_all on public.vendor_tags;
drop policy if exists vendor_tags_select on public.vendor_tags;
drop policy if exists vendor_tags_insert on public.vendor_tags;
drop policy if exists vendor_tags_update on public.vendor_tags;
drop policy if exists vendor_tags_delete on public.vendor_tags;

create policy vendor_tags_select on public.vendor_tags for select to authenticated
  using ((select public.current_user_is_admin())
         and exists (select 1 from public.vendors v
                      where v.id = vendor_tags.vendor_id
                        and v.business_id in (select public.current_user_business_ids())));
create policy vendor_tags_insert on public.vendor_tags for insert to authenticated
  with check ((select public.current_user_is_admin())
              and exists (select 1 from public.vendors v
                           where v.id = vendor_tags.vendor_id
                             and v.business_id in (select public.current_user_business_ids())));
create policy vendor_tags_update on public.vendor_tags for update to authenticated
  using ((select public.current_user_is_admin())
         and exists (select 1 from public.vendors v
                      where v.id = vendor_tags.vendor_id
                        and v.business_id in (select public.current_user_business_ids())))
  with check ((select public.current_user_is_admin())
              and exists (select 1 from public.vendors v
                           where v.id = vendor_tags.vendor_id
                             and v.business_id in (select public.current_user_business_ids())));
create policy vendor_tags_delete on public.vendor_tags for delete to authenticated
  using ((select public.current_user_is_admin())
         and exists (select 1 from public.vendors v
                      where v.id = vendor_tags.vendor_id
                        and v.business_id in (select public.current_user_business_ids())));

-- vendor_categories: shared (no business_id). The existing read policy
-- ("Enable read access for authenticated users") is kept; writes are admin-only.
drop policy if exists vendor_categories_insert on public.vendor_categories;
drop policy if exists vendor_categories_update on public.vendor_categories;
drop policy if exists vendor_categories_delete on public.vendor_categories;

create policy vendor_categories_insert on public.vendor_categories for insert to authenticated
  with check ((select public.current_user_is_admin()));
create policy vendor_categories_update on public.vendor_categories for update to authenticated
  using ((select public.current_user_is_admin()))
  with check ((select public.current_user_is_admin()));
create policy vendor_categories_delete on public.vendor_categories for delete to authenticated
  using ((select public.current_user_is_admin()));

-- ---------------------------------------------------------------- privileges
do $$
declare
  rel record;
begin
  -- anon: nothing on any table, view or materialized view in public.
  -- authenticated: never TRUNCATE, REFERENCES or TRIGGER.
  for rel in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke all on table public.%I from anon', rel.relname);
    execute format('revoke truncate, references, trigger on table public.%I from authenticated', rel.relname);
  end loop;
end;
$$;

-- authenticated: exactly the four DML privileges on the client-facing tables.
revoke all on table
  public.customers, public.measurements, public.orders, public.order_items,
  public.payments, public.vendors, public.vendor_tags, public.vendor_categories
  from authenticated;
grant select, insert, update, delete on table
  public.customers, public.measurements, public.orders, public.order_items,
  public.payments, public.vendors, public.vendor_tags, public.vendor_categories
  to authenticated;

-- The view is security_invoker, so the table policies above apply through it.
revoke all on table public.orders_with_payment_status from authenticated;
grant select on table public.orders_with_payment_status to authenticated;

-- Ledger tables stay closed to client roles (20261024000000); restated so a
-- re-run after a manual grant closes them again.
revoke all on table public.general_ledger, public.vendor_ledger from anon, authenticated;

-- New tables created by `postgres` in public are no longer auto-granted to
-- anon (Supabase's default privileges grant ALL to anon, authenticated and
-- service_role). Grants to authenticated and service_role are not changed
-- here: each new client-facing table must still get explicit grants and RLS.
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------- checks
do $$
declare
  t text;
  missing text;
begin
  foreach t in array array['customers', 'measurements', 'orders', 'order_items', 'payments', 'vendors', 'vendor_tags', 'vendor_categories'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception 'RLS is not enabled on %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') then
      raise exception 'anon can still read %', t;
    end if;
    -- One privilege per call: a comma list is true when ANY of them is held.
    if not (has_table_privilege('authenticated', 'public.' || t, 'SELECT')
            and has_table_privilege('authenticated', 'public.' || t, 'INSERT')
            and has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
            and has_table_privilege('authenticated', 'public.' || t, 'DELETE')) then
      raise exception 'authenticated lost DML on %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE') then
      raise exception 'authenticated can still truncate %', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'business_member_all') then
      raise exception 'business_member_all still present on %', t;
    end if;
  end loop;

  select string_agg(p, ', ') into missing
    from unnest(array[
      'customers_delete', 'measurements_delete', 'orders_delete', 'order_items_delete',
      'payments_insert', 'vendors_select', 'vendor_tags_select', 'vendor_categories_insert'
    ]) as p
   where not exists (select 1 from pg_policies where schemaname = 'public' and policyname = p);
  if missing is not null then
    raise exception 'policies missing: %', missing;
  end if;

  if has_table_privilege('anon', 'public.orders_with_payment_status', 'SELECT') then
    raise exception 'anon can still read orders_with_payment_status';
  end if;
  if has_table_privilege('authenticated', 'public.general_ledger', 'SELECT')
     or has_table_privilege('authenticated', 'public.vendor_ledger', 'SELECT') then
    raise exception 'ledger tables are readable by authenticated';
  end if;
  if not has_table_privilege('service_role', 'public.customers', 'INSERT') then
    raise exception 'service_role lost access; the API would stop working';
  end if;
  if not has_function_privilege('authenticated', 'public.current_user_is_admin()', 'EXECUTE')
     or has_function_privilege('anon', 'public.current_user_is_admin()', 'EXECUTE') then
    raise exception 'current_user_is_admin() execute grants are wrong';
  end if;

  raise notice 'role-scoped RLS in place';
end;
$$;

commit;
