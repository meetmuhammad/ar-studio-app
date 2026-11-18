-- Self-contained check for 20261119000200_reporting_functions.sql.
--
-- Read-only, and still wrapped in a transaction that ROLLS BACK. Run as a role
-- that can switch to `authenticated` (e.g. postgres). It acts as:
--   admin: refine-disposable-admin-20261119@arstudio.test
--   staff: refine-disposable-staff-20261119@arstudio.test
-- on the business named 'Ahsan Tariq Couture', and compares the functions'
-- figures with sums computed directly from the tables. Every assertion raises
-- a NOTICE; the first failure raises an exception.

begin;

do $$
declare
  c_admin_email constant text := 'refine-disposable-admin-20261119@arstudio.test';
  c_staff_email constant text := 'refine-disposable-staff-20261119@arstudio.test';
  c_business    constant text := 'Ahsan Tariq Couture';

  v_admin    uuid;
  v_staff    uuid;
  v_business uuid;
  v_ids      uuid[];
  v_from     date := date_trunc('year', (now() at time zone 'Asia/Karachi')::date)::date;
  v_to       date := (now() at time zone 'Asia/Karachi')::date;
  v_role     text := current_user;
  v_ok       boolean;
  v_summary  jsonb;
  v_ledger   jsonb;
  v_pnl      jsonb;
  v_expected numeric;
  v_actual   numeric;
  v_count    bigint;
begin
  select id into v_admin from public.users where email = c_admin_email;
  select id into v_staff from public.users where email = c_staff_email;
  select id into v_business from public.businesses where name = c_business;
  if v_admin is null or v_staff is null or v_business is null then
    raise exception 'fixtures missing: admin %, staff %, business %', v_admin, v_staff, v_business;
  end if;
  v_ids := array[v_business];
  raise notice 'fixtures: admin %, staff %, business %, range % .. %', v_admin, v_staff, v_business, v_from, v_to;

  -- ------------------------------------------------------------- staff: 42501 everywhere
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.dashboard_summary(v_ids, v_from, v_to);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then perform set_config('role', v_role, true); raise exception 'staff could read dashboard_summary'; end if;
  begin
    perform public.ledger_entries(v_ids, v_from, v_to, null, null, null, 20, 0);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  if not v_ok then perform set_config('role', v_role, true); raise exception 'staff could read ledger_entries'; end if;
  begin
    perform public.pnl_input(v_ids, v_from, v_to);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', v_role, true);
  if not v_ok then raise exception 'staff could read pnl_input'; end if;
  raise notice 'ok: staff gets 42501 from all three functions';

  -- ------------------------------------------------------------- admin: a business not theirs
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.dashboard_summary(array[gen_random_uuid()], v_from, v_to);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', v_role, true);
  if not v_ok then raise exception 'admin could read a business they are not a member of'; end if;
  raise notice 'ok: unknown business id refused with 42501';

  -- ------------------------------------------------------------- admin: results
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_summary := public.dashboard_summary(v_ids, v_from, v_to);
  v_ledger  := public.ledger_entries(v_ids, v_from, v_to, null, null, null, 20, 0);
  v_pnl     := public.pnl_input(v_ids, v_from, v_to);
  perform set_config('role', v_role, true);
  raise notice 'ok: admin got results (orders in range %, ledger rows %)',
    v_summary #>> '{orders,in_range}', v_ledger ->> 'total';

  -- Cash received = advances by booking_date + payments by payment_date.
  select coalesce((select sum(advance_paid) from public.orders
                    where business_id = v_business and booking_date between v_from and v_to), 0)
       + coalesce((select sum(amount) from public.payments
                    where business_id = v_business and payment_date between v_from and v_to), 0)
    into v_expected;
  v_actual := (v_summary #>> '{cash_received,total}')::numeric;
  if v_actual is distinct from v_expected then
    raise exception 'cash received % differs from direct sum %', v_actual, v_expected;
  end if;
  raise notice 'ok: cash received % = advances + payments', v_actual;

  select count(*) into v_count from public.orders
   where business_id = v_business and booking_date between v_from and v_to;
  if (v_summary #>> '{orders,in_range}')::bigint <> v_count then
    raise exception 'orders in range % differs from %', v_summary #>> '{orders,in_range}', v_count;
  end if;
  raise notice 'ok: orders in range %', v_count;

  if jsonb_array_length(v_summary -> 'monthly') <> 12 then
    raise exception 'monthly series has % months, expected 12', jsonb_array_length(v_summary -> 'monthly');
  end if;
  raise notice 'ok: 12-month series';

  -- Ledger totals = direct sums over the date range.
  select coalesce(sum(debit), 0) into v_expected from public.general_ledger
   where business_id = v_business and entry_date between v_from and v_to;
  if (v_ledger #>> '{totals,debit}')::numeric is distinct from v_expected then
    raise exception 'ledger debit total % differs from %', v_ledger #>> '{totals,debit}', v_expected;
  end if;
  select coalesce(sum(credit), 0) into v_expected from public.general_ledger
   where business_id = v_business and entry_date between v_from and v_to;
  if (v_ledger #>> '{totals,credit}')::numeric is distinct from v_expected then
    raise exception 'ledger credit total % differs from %', v_ledger #>> '{totals,credit}', v_expected;
  end if;
  select count(*) into v_count from public.general_ledger
   where business_id = v_business and entry_date between v_from and v_to;
  if (v_ledger ->> 'total')::bigint <> v_count then
    raise exception 'ledger total rows % differs from %', v_ledger ->> 'total', v_count;
  end if;
  raise notice 'ok: ledger totals debit %, credit %, rows %', v_ledger #>> '{totals,debit}', v_ledger #>> '{totals,credit}', v_count;

  -- The newest row's range balance equals the range net (getRangeRunningBalances).
  if jsonb_array_length(v_ledger -> 'rows') > 0 then
    if (v_ledger #>> '{rows,0,range_balance}')::numeric is distinct from (v_ledger #>> '{totals,net}')::numeric then
      raise exception 'newest range balance % differs from range net %',
        v_ledger #>> '{rows,0,range_balance}', v_ledger #>> '{totals,net}';
    end if;
    raise notice 'ok: newest range_balance equals the range net';
  end if;

  -- Opening balance = debit - credit before the range.
  select coalesce(sum(coalesce(debit, 0) - coalesce(credit, 0)), 0) into v_expected
    from public.general_ledger where business_id = v_business and entry_date < v_from;
  if (v_ledger ->> 'opening_balance')::numeric is distinct from v_expected then
    raise exception 'opening balance % differs from %', v_ledger ->> 'opening_balance', v_expected;
  end if;
  raise notice 'ok: opening balance %', v_expected;

  -- pnl_input row counts match the API's queries.
  select count(*) into v_count from public.payments
   where business_id = v_business and payment_date between v_from and v_to;
  if jsonb_array_length(v_pnl -> 'payments') <> v_count then
    raise exception 'pnl payments % differs from %', jsonb_array_length(v_pnl -> 'payments'), v_count;
  end if;
  select count(*) into v_count from public.vendor_ledger
   where business_id = v_business and general_ledger_id is null and entry_date between v_from and v_to;
  if jsonb_array_length(v_pnl -> 'vendorLedger') <> v_count then
    raise exception 'pnl vendor bills % differs from %', jsonb_array_length(v_pnl -> 'vendorLedger'), v_count;
  end if;
  raise notice 'ok: pnl_input row sets (payments %, vendor bills %)', jsonb_array_length(v_pnl -> 'payments'), v_count;

  raise notice 'ALL CHECKS PASSED (rolling back)';
end;
$$;

rollback;
