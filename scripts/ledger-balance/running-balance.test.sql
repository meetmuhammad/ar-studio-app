-- Running-balance behaviour of public.general_ledger after
-- supabase/migrations/20261101000000_ledger_running_balance_integrity.sql and
-- 20261106000000_multi_business_techlink.sql (balances partitioned by business).
--
-- LOCAL/TEST ONLY, never staging or production. Everything runs in ONE
-- transaction that always rolls back. The synthetic rows go into a throwaway
-- business created inside that transaction, so the test also proves that a
-- write in one business never changes another business's stored balances.
--
--   docker exec -i supabase_db_ar-studio-app psql -U postgres -d <db> \
--     -v ON_ERROR_STOP=1 < scripts/ledger-balance/running-balance.test.sql

begin;

insert into public.businesses (name, slug, code) values ('Ledger test', 'zz-ledger-test', 'ZZ');
create function pg_temp.tb() returns uuid language sql stable as $$
  select id from public.businesses where slug = 'zz-ledger-test'
$$;
-- Rows below omit business_id; inside this rolled-back transaction they land in
-- the test business.
do $$ begin
  execute format('alter table public.general_ledger alter column business_id set default %L', pg_temp.tb());
end $$;

-- Every OTHER business's stored series, to compare at the end.
create temp table other_books as
  select id, balance from public.general_ledger where business_id <> pg_temp.tb();

-- Fails the test unless every stored balance equals the cumulative sum in
-- (entry_date, created_at, id) order WITHIN its business (all businesses).
create function pg_temp.assert_chain(label text) returns void language plpgsql as $$
declare
  v_bad integer;
begin
  select count(*) into v_bad from (
    select balance,
           sum(coalesce(debit, 0) - coalesce(credit, 0))
             over (partition by business_id order by entry_date, created_at, id) as expected
      from public.general_ledger
  ) t where balance is distinct from expected;
  if v_bad > 0 then
    raise exception 'FAIL %: % rows out of chain', label, v_bad;
  end if;
  raise notice 'ok  %', label;
end;
$$;

create function pg_temp.bal(p_particulars text) returns numeric language sql as $$
  select balance from public.general_ledger where particulars = p_particulars and business_id = pg_temp.tb()
$$;

create function pg_temp.eq(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAIL %: got %, want %', label, got, want;
  end if;
  raise notice 'ok  %', label;
end;
$$;

-- 1. Normal appends.
insert into public.general_ledger (entry_date, created_at, particulars, debit, entry_type)
values ('2026-10-01', '2026-10-01 10:00+05', 'opening', 100000, 'opening_balance');
insert into public.general_ledger (entry_date, created_at, particulars, credit, entry_type)
values ('2026-10-29', '2026-10-29 10:00+05', 'payment oct29', 50000, 'vendor_payment');
insert into public.general_ledger (entry_date, created_at, particulars, debit, entry_type)
values ('2026-10-31', '2026-10-31 18:03:52+05', 'receipt oct31', 23000, 'order_payment');
select pg_temp.assert_chain('normal insert');
select pg_temp.eq('latest after appends', pg_temp.bal('receipt oct31'), 73000);

-- 2. Back-dated insert entered after newer rows (the AR-00179 case).
insert into public.general_ledger (entry_date, created_at, particulars, debit, entry_type)
values ('2026-10-29', '2026-10-31 18:05:49+05', 'backdated receipt', 77000, 'order_payment');
select pg_temp.assert_chain('backdated insert');
select pg_temp.eq('backdated row itself', pg_temp.bal('backdated receipt'), 127000);
select pg_temp.eq('later row includes backdated', pg_temp.bal('receipt oct31'), 150000);

-- Multi-row insert whose rows land at different positions.
insert into public.general_ledger (entry_date, created_at, particulars, credit, entry_type) values
  ('2026-10-15', '2026-11-01 09:00+05', 'bulk a', 1000, 'miscellaneous'),
  ('2026-10-30', '2026-11-01 09:00+05', 'bulk b', 2000, 'miscellaneous');
select pg_temp.assert_chain('multi-row backdated insert');

-- 3. Tied (entry_date, created_at), as in imported rows: id breaks the tie.
insert into public.general_ledger (entry_date, created_at, particulars, debit, entry_type) values
  ('2026-10-20', '2026-10-20 00:00+05', 'tie 1', 10, 'miscellaneous'),
  ('2026-10-20', '2026-10-20 00:00+05', 'tie 2', 20, 'miscellaneous'),
  ('2026-10-20', '2026-10-20 00:00+05', 'tie 3', 30, 'miscellaneous');
select pg_temp.assert_chain('tied timestamps');
insert into public.general_ledger (entry_date, created_at, particulars, credit, entry_type)
values ('2026-10-20', '2026-10-20 00:00+05', 'tie 4', 5, 'miscellaneous');
select pg_temp.assert_chain('insert into a tie group');

-- 4. Date-only edit, both directions.
update public.general_ledger set entry_date = '2026-10-02' where particulars = 'receipt oct31' and business_id = pg_temp.tb();
select pg_temp.assert_chain('date edit moved earlier');
update public.general_ledger set entry_date = '2026-11-01' where particulars = 'receipt oct31' and business_id = pg_temp.tb();
select pg_temp.assert_chain('date edit moved later');

-- 5. Amount edit.
update public.general_ledger set debit = 70000 where particulars = 'backdated receipt' and business_id = pg_temp.tb();
select pg_temp.assert_chain('amount edit');

-- Non-ledger-affecting edit leaves balances alone and does not recurse.
update public.general_ledger set notes = 'n' where particulars = 'opening' and business_id = pg_temp.tb();
select pg_temp.assert_chain('notes-only edit');

-- 6. Deletion, including a whole tie group.
delete from public.general_ledger where particulars = 'payment oct29' and business_id = pg_temp.tb();
select pg_temp.assert_chain('single delete');
delete from public.general_ledger where particulars like 'tie %' and business_id = pg_temp.tb();
select pg_temp.assert_chain('multi-row delete');

-- Final net equals the latest balance.
select pg_temp.eq('net = latest balance',
  (select balance from public.general_ledger where business_id = pg_temp.tb()
    order by entry_date desc, created_at desc, id desc limit 1),
  (select sum(coalesce(debit, 0) - coalesce(credit, 0)) from public.general_ledger where business_id = pg_temp.tb()));

-- No other business's stored balance moved.
select pg_temp.eq('other businesses untouched',
  (select count(*) from other_books o join public.general_ledger gl on gl.id = o.id
    where gl.balance is distinct from o.balance), 0);

-- The recursion flag is released after every statement.
select pg_temp.eq('recursion flag released',
  (case when current_setting('ar.ledger_recalc', true) = 'on' then 1 else 0 end), 0);

-- Not callable by client roles over PostgREST.
select pg_temp.eq('anon cannot execute rebuild',
  (case when has_function_privilege('anon', 'public.rebuild_general_ledger_balances()', 'execute') then 1 else 0 end), 0);
select pg_temp.eq('anon cannot execute per-business rebuild',
  (case when has_function_privilege('anon', 'public.rebuild_general_ledger_balances(uuid)', 'execute') then 1 else 0 end), 0);
select pg_temp.eq('authenticated cannot execute recalc',
  (case when has_function_privilege('authenticated', 'public.recalculate_ledger_balances_from(uuid, date, timestamptz, uuid)', 'execute') then 1 else 0 end), 0);
select pg_temp.eq('old global recalc is gone',
  (select count(*) from pg_proc where proname = 'recalculate_ledger_balances_from' and pronargs = 3), 0);

rollback;
