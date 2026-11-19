-- Self-contained check for 20261119000200_reporting_functions.sql and
-- 20261119000600_dashboard_single_source.sql (second block below).
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

-- ------------------------------------------------------------------------------
-- 20261119000600: dashboard_summary all_time / upcoming_orders /
-- monthly_receipts_6m and customer_order_summary, each figure against a direct
-- SQL sum over EVERY row (no 1,000-row cap), for the one business and for every
-- business the admin belongs to (the API's X-Business-Id: all). With a single
-- membership the multi-business pass covers the same one id.
do $$
declare
  c_admin_email constant text := 'refine-disposable-admin-20261119@arstudio.test';
  c_staff_email constant text := 'refine-disposable-staff-20261119@arstudio.test';
  c_business    constant text := 'Ahsan Tariq Couture';

  v_admin     uuid;
  v_staff     uuid;
  v_business  uuid;
  v_role      text := current_user;
  v_today     date := (now() at time zone 'Asia/Karachi')::date;
  v_mstart    timestamptz := date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
  v_6m_from   date := (date_trunc('month', (now() at time zone 'Asia/Karachi')::date)::date - interval '5 months')::date;
  v_ids       uuid[];
  v_label     text;
  v_summary   jsonb;
  v_all       jsonb;
  v_ok        boolean;
  v_expected  numeric;
  v_actual    numeric;
  v_count     bigint;
  v_customer  uuid;
  v_cust      jsonb;
  i           int;
begin
  select id into v_admin from public.users where email = c_admin_email;
  select id into v_staff from public.users where email = c_staff_email;
  select id into v_business from public.businesses where name = c_business;
  if v_admin is null or v_staff is null or v_business is null then
    raise exception 'fixtures missing: admin %, staff %, business %', v_admin, v_staff, v_business;
  end if;

  -- ------------------------------------------------------------- refusals
  -- Staff: 42501 (admin only).
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.dashboard_summary(array[v_business], null, null);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', v_role, true);
  if not v_ok then raise exception 'staff could read dashboard_summary (all time)'; end if;
  raise notice 'ok: staff refused (42501) by dashboard_summary';

  -- Admin, but the array holds a business they are not a member of: 42501.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.dashboard_summary(array[v_business, gen_random_uuid()], null, null);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  perform set_config('role', v_role, true);
  if not v_ok then raise exception 'admin read a multi-business array with a non-member business'; end if;
  raise notice 'ok: non-member business in the array refused (42501)';

  -- A signed-in user with no role and no membership: 42501 from both functions.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    perform public.dashboard_summary(array[v_business], null, null);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  if v_ok then
    begin
      perform public.customer_order_summary(gen_random_uuid());
      v_ok := false;
    exception when insufficient_privilege then v_ok := true;
    end;
  end if;
  perform set_config('role', v_role, true);
  if not v_ok then raise exception 'a non-member user was not refused'; end if;
  raise notice 'ok: non-member user refused (42501)';

  -- The helpers are internal.
  if has_function_privilege('authenticated', 'public.report_order_balances(uuid[], uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.report_customer_receipts(uuid[])', 'EXECUTE') then
    raise exception 'report helpers are executable by authenticated';
  end if;
  raise notice 'ok: report helpers not executable by clients';

  -- ------------------------------------------------------------- figures, per scope
  for i in 1..2 loop
    if i = 1 then
      v_ids := array[v_business]; v_label := 'one business';
    else
      select array_agg(ub.business_id order by ub.business_id) into v_ids
        from public.user_businesses ub where ub.user_id = v_admin;
      v_label := format('all %s memberships', cardinality(v_ids));
    end if;

    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_summary := public.dashboard_summary(v_ids, null, null);
    perform set_config('role', v_role, true);
    v_all := v_summary -> 'all_time';
    if v_all is null then raise exception '[%] all_time block missing', v_label; end if;

    select count(*) into v_count from public.customers where business_id = any (v_ids);
    if (v_all ->> 'customers')::bigint <> v_count or (v_summary #>> '{customers,total}')::bigint <> v_count then
      raise exception '[%] customers % / % differ from %', v_label, v_all ->> 'customers', v_summary #>> '{customers,total}', v_count;
    end if;

    select count(*) into v_count from public.orders where business_id = any (v_ids);
    if (v_all ->> 'orders')::bigint <> v_count then
      raise exception '[%] orders % differ from %', v_label, v_all ->> 'orders', v_count;
    end if;

    select coalesce(sum(total_amount), 0) into v_expected from public.orders where business_id = any (v_ids);
    if (v_all ->> 'revenue')::numeric is distinct from v_expected
       or (v_summary ->> 'revenue_all_time')::numeric is distinct from v_expected then
      raise exception '[%] revenue % differs from %', v_label, v_all ->> 'revenue', v_expected;
    end if;

    select coalesce(sum(advance_paid), 0) into v_expected from public.orders where business_id = any (v_ids);
    if (v_all #>> '{received,advances}')::numeric is distinct from v_expected then
      raise exception '[%] advances % differ from %', v_label, v_all #>> '{received,advances}', v_expected;
    end if;
    select coalesce(sum(amount), 0) into v_actual from public.payments where business_id = any (v_ids);
    if (v_all #>> '{received,payments}')::numeric is distinct from v_actual then
      raise exception '[%] payments % differ from %', v_label, v_all #>> '{received,payments}', v_actual;
    end if;
    if (v_all #>> '{received,total}')::numeric is distinct from v_expected + v_actual then
      raise exception '[%] received % differs from advances + payments %', v_label, v_all #>> '{received,total}', v_expected + v_actual;
    end if;

    -- Outstanding, written out independently of report_order_balances.
    select coalesce(sum(greatest(
             coalesce(o.total_amount, 0) - coalesce(o.advance_paid, 0)
             - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0), 0)), 0)
      into v_expected
      from public.orders o
     where o.business_id = any (v_ids) and o.status::text is distinct from 'Cancelled';
    if (v_all ->> 'outstanding')::numeric is distinct from v_expected
       or (v_summary ->> 'outstanding')::numeric is distinct from v_expected then
      raise exception '[%] outstanding % differs from %', v_label, v_all ->> 'outstanding', v_expected;
    end if;

    select count(*) into v_count from public.orders where business_id = any (v_ids) and created_at >= v_mstart;
    if (v_all ->> 'recent_orders_this_month')::bigint <> v_count then
      raise exception '[%] recent orders % differ from %', v_label, v_all ->> 'recent_orders_this_month', v_count;
    end if;

    -- upcoming_orders: min(5, qualifying), nearest first, API shape.
    select count(*) into v_count from public.orders
     where business_id = any (v_ids) and status::text is distinct from 'Cancelled' and delivery_date >= v_today;
    if jsonb_array_length(v_summary -> 'upcoming_orders') <> least(v_count, 5) then
      raise exception '[%] upcoming_orders has % rows, expected %', v_label,
        jsonb_array_length(v_summary -> 'upcoming_orders'), least(v_count, 5);
    end if;
    if v_count > 0 then
      if (v_summary #>> '{upcoming_orders,0,delivery_date}')::date is distinct from (
           select min(delivery_date) from public.orders
            where business_id = any (v_ids) and status::text is distinct from 'Cancelled' and delivery_date >= v_today) then
        raise exception '[%] upcoming_orders is not nearest first', v_label;
      end if;
      if not ((v_summary #> '{upcoming_orders,0}') ?& array['id', 'order_number', 'delivery_date', 'status', 'customers']) then
        raise exception '[%] upcoming_orders row has the wrong keys: %', v_label, v_summary #> '{upcoming_orders,0}';
      end if;
    end if;

    -- monthly_receipts_6m: 6 months ending with the current one; totals = direct sums.
    if jsonb_array_length(v_summary -> 'monthly_receipts_6m') <> 6
       or v_summary #>> '{monthly_receipts_6m,5,month}' <> to_char(v_today, 'YYYY-MM')
       or v_summary #>> '{monthly_receipts_6m,0,month}' <> to_char(v_6m_from, 'YYYY-MM') then
      raise exception '[%] monthly_receipts_6m months wrong: %', v_label, v_summary -> 'monthly_receipts_6m';
    end if;
    select coalesce((select sum(advance_paid) from public.orders
                      where business_id = any (v_ids) and booking_date >= v_6m_from
                        and booking_date < (date_trunc('month', v_today) + interval '1 month')::date), 0)
         + coalesce((select sum(amount) from public.payments
                      where business_id = any (v_ids) and payment_date >= v_6m_from
                        and payment_date < (date_trunc('month', v_today) + interval '1 month')::date), 0)
      into v_expected;
    select coalesce(sum((m ->> 'total')::numeric), 0) into v_actual
      from jsonb_array_elements(v_summary -> 'monthly_receipts_6m') m;
    if v_actual is distinct from v_expected then
      raise exception '[%] 6-month receipts % differ from %', v_label, v_actual, v_expected;
    end if;
    -- The current month on its own.
    select coalesce((select sum(advance_paid) from public.orders
                      where business_id = any (v_ids) and booking_date >= date_trunc('month', v_today)::date
                        and booking_date < (date_trunc('month', v_today) + interval '1 month')::date), 0)
         + coalesce((select sum(amount) from public.payments
                      where business_id = any (v_ids) and payment_date >= date_trunc('month', v_today)::date
                        and payment_date < (date_trunc('month', v_today) + interval '1 month')::date), 0)
      into v_expected;
    if (v_summary #>> '{monthly_receipts_6m,5,total}')::numeric is distinct from v_expected then
      raise exception '[%] this month receipts % differ from %', v_label, v_summary #>> '{monthly_receipts_6m,5,total}', v_expected;
    end if;

    raise notice 'ok [%]: customers %, orders %, revenue %, received % (advances % + payments %), outstanding %, recent %, upcoming %, 6m receipts %',
      v_label, v_all ->> 'customers', v_all ->> 'orders', v_all ->> 'revenue', v_all #>> '{received,total}',
      v_all #>> '{received,advances}', v_all #>> '{received,payments}', v_all ->> 'outstanding',
      v_all ->> 'recent_orders_this_month', jsonb_array_length(v_summary -> 'upcoming_orders'), v_actual;
  end loop;

  -- ------------------------------------------------------------- customer_order_summary
  select o.customer_id into v_customer
    from public.orders o where o.business_id = v_business
   group by o.customer_id order by count(*) desc, o.customer_id limit 1;
  if v_customer is not null then
    -- Staff may read it (member of the business), and gets the same figures.
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_cust := public.customer_order_summary(v_customer);
    perform set_config('role', v_role, true);

    select count(*), coalesce(sum(total_amount), 0) into v_count, v_expected
      from public.orders where customer_id = v_customer;
    if (v_cust ->> 'orders')::bigint <> v_count or (v_cust ->> 'revenue')::numeric is distinct from v_expected then
      raise exception 'customer summary orders/revenue % differ from % / %', v_cust, v_count, v_expected;
    end if;
    select coalesce(sum(o.advance_paid), 0)
         + coalesce((select sum(p.amount) from public.payments p
                      join public.orders o2 on o2.id = p.order_id where o2.customer_id = v_customer), 0)
      into v_expected
      from public.orders o where o.customer_id = v_customer;
    if (v_cust #>> '{received,total}')::numeric is distinct from v_expected then
      raise exception 'customer summary received % differs from %', v_cust #>> '{received,total}', v_expected;
    end if;
    select coalesce(sum(greatest(
             coalesce(o.total_amount, 0) - coalesce(o.advance_paid, 0)
             - coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0), 0)), 0)
      into v_expected
      from public.orders o
     where o.customer_id = v_customer and o.status::text is distinct from 'Cancelled';
    if (v_cust ->> 'outstanding')::numeric is distinct from v_expected then
      raise exception 'customer summary outstanding % differs from %', v_cust ->> 'outstanding', v_expected;
    end if;
    raise notice 'ok: customer_order_summary (as staff) %', v_cust;

    -- Unknown customer: P0002.
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    begin
      perform public.customer_order_summary(gen_random_uuid());
      v_ok := false;
    exception when no_data_found then v_ok := true;
    end;
    perform set_config('role', v_role, true);
    if not v_ok then raise exception 'unknown customer was not refused with P0002'; end if;
    raise notice 'ok: unknown customer refused (P0002)';
  else
    raise notice 'skip: no orders, customer_order_summary not checked';
  end if;

  raise notice 'ALL DASHBOARD CHECKS PASSED (rolling back)';
end;
$$;

rollback;
