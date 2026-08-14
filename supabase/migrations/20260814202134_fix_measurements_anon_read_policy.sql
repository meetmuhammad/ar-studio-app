-- =============================================================================
-- Close the anon read hole on public.measurements
-- =============================================================================
-- The existing policy is:
--
--   CREATE POLICY "Enable read access for all users"
--     ON public.measurements FOR SELECT USING (true);
--
-- `USING (true)` with no role predicate means the ANON role can read every row.
-- The anon key is compiled into the browser bundle by design, so anyone who
-- views source can read all measurement records — names are joined via
-- customer_id, and the rows are body measurements of identifiable people.
--
-- Every other table in this schema gates on `auth.role() = 'authenticated'`.
-- This one was the exception, almost certainly unintentionally: its sibling
-- policies on the same table (INSERT / UPDATE / DELETE) all check the role
-- correctly. Only SELECT was left open.
--
-- This migration brings SELECT in line with the rest of the table.
--
-- IMPACT: none on the application. API routes use the service-role client,
-- which bypasses RLS entirely, and no client-side code queries `measurements`
-- directly (verified: the dashboard pages import supabase-client.ts for types
-- only and make zero .from() calls). The only caller losing access is an
-- unauthenticated PostgREST request, which is the point.
--
-- EXPAND/CONTRACT: not applicable. Replacing a policy is atomic and does not
-- change table shape, so old and new application code both keep working.
-- =============================================================================

drop policy if exists "Enable read access for all users" on public.measurements;

create policy "Enable read access for authenticated users"
  on public.measurements
  for select
  using ((auth.role() = 'authenticated'::text));
