-- Schema assertions for a database built from migrations alone.
--
-- Run after `supabase db reset`. Every check RAISEs on failure, so the script
-- aborts rather than printing a wall of output nobody reads to the end of.
--
--   docker exec -i supabase_db_ar-studio-app psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < scripts/verify-baseline-schema.sql
--
-- Complements scripts/verify-baseline-security.mjs, which checks the same
-- database as an untrusted caller over HTTP. This file checks that the objects
-- exist and are shaped correctly; that one checks who can reach them.

\set ON_ERROR_STOP on

do $$
declare
  v_missing text;
  v_count   integer;
  v_text    text;
begin
  -- ---- tables ----
  select string_agg(t, ', ') into v_missing
    from unnest(array[
      'counters','customers','general_ledger','measurements','order_items',
      'orders','payments','users','vendor_ledger','vendor_tags','vendors'
    ]) t
   where to_regclass('public.' || t) is null;
  if v_missing is not null then
    raise exception 'missing tables: %', v_missing;
  end if;

  -- ---- the view ----
  if to_regclass('public.orders_with_payment_status') is null then
    raise exception 'missing view: orders_with_payment_status';
  end if;

  -- security_invoker must be EXPLICIT. The Postgres default is off, which runs
  -- the view as its owner and bypasses RLS on orders and payments -- a hole
  -- straight through row-level security, reachable with the browser anon key.
  select array_to_string(reloptions, ',') into v_text
    from pg_class where oid = 'public.orders_with_payment_status'::regclass;
  if v_text is null or v_text not like '%security_invoker=true%' then
    raise exception
      'orders_with_payment_status must set security_invoker=true explicitly; reloptions = %',
      coalesce(v_text, '(none -- defaults to INVOKER OFF, which bypasses RLS)');
  end if;

  -- ---- measurements SELECT must be authenticated-only ----
  -- The original policy was USING (true), readable by anon. These are body
  -- measurements of identifiable people.
  select count(*) into v_count
    from pg_policies
   where schemaname = 'public' and tablename = 'measurements' and cmd = 'SELECT'
     and qual like '%authenticated%';
  if v_count < 1 then
    raise exception 'measurements SELECT policy is not gated on authenticated';
  end if;

  select count(*) into v_count
    from pg_policies
   where schemaname = 'public' and tablename = 'measurements' and cmd = 'SELECT'
     and qual = 'true';
  if v_count > 0 then
    raise exception 'the open measurements SELECT policy (USING true) has been reintroduced';
  end if;

  -- ---- counters: table, seed row, and a function that works from zero ----
  if to_regclass('public.counters') is null then
    raise exception 'missing table: counters';
  end if;
  select count(*) into v_count from public.counters where id = 1;
  if v_count <> 1 then
    raise exception 'counters has no row with id = 1; increment_counter() would return NULL';
  end if;

  -- ---- ledger integrity machinery ----
  select string_agg(f, ', ') into v_missing
    from unnest(array[
      'increment_counter','recalculate_ledger_balances_from','rebuild_general_ledger_balances',
      'recalculate_vendor_ledger_balances_from','rebuild_vendor_ledger_balances'
    ]) f
   where not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f);
  if v_missing is not null then
    raise exception 'missing functions: %', v_missing;
  end if;

  -- Statement-level balance triggers on both ledgers.
  select count(*) into v_count
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'general_ledger' and not t.tgisinternal
     and t.tgname like 'trg_recalc_balances_after_%';
  if v_count < 3 then
    raise exception 'general_ledger is missing balance triggers (found %, expected 3)', v_count;
  end if;

  select count(*) into v_count
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'vendor_ledger' and not t.tgisinternal
     and t.tgname like 'trg_recalc_vendor_ledger_after_%';
  if v_count < 3 then
    raise exception 'vendor_ledger is missing balance triggers (found %, expected 3)', v_count;
  end if;

  -- ---- financial functions must not be executable by anon/authenticated ----
  select string_agg(f, ', ') into v_missing
    from unnest(array['rebuild_general_ledger_balances','rebuild_vendor_ledger_balances']) f
   where has_function_privilege('anon', 'public.' || f || '()', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.' || f || '()', 'EXECUTE');
  if v_missing is not null then
    raise exception 'anon/authenticated hold EXECUTE on: %', v_missing;
  end if;

  raise notice 'schema assertions passed';
end $$;

-- increment_counter must return sequential, non-null values from a fresh
-- database. Run inside a transaction that is rolled back so the check does not
-- consume order numbers.
begin;
do $$
declare a integer; b integer;
begin
  a := public.increment_counter(1);
  b := public.increment_counter(1);
  if a is null or b is null then
    raise exception 'increment_counter returned NULL (counters row missing)';
  end if;
  if b <> a + 1 then
    raise exception 'increment_counter is not sequential: % then %', a, b;
  end if;
  raise notice 'increment_counter: % then % (sequential, non-null)', a, b;
end $$;
rollback;

select 'BASELINE SCHEMA OK' as result;
