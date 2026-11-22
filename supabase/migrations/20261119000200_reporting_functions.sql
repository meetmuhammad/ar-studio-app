-- Read-only reporting functions for the admin Dashboard, Ledger and P&L screens.
--
-- WHY
-- ---
-- general_ledger and vendor_ledger have no client grants by design
-- (20261024000000_close_role_escalation_and_ledger_direct_access.sql), and the
-- reports need exact totals over every row (no PostgREST 1,000-row cap). These
-- SECURITY DEFINER functions compute them in SQL for admins only, so the books
-- stay closed to staff and to direct table access.
--
-- Every function:
--   - is STABLE and read-only (no writes, no locks);
--   - requires an admin (public.current_user_is_admin()) and that every
--     requested business is one of the caller's (current_user_business_ids()),
--     raising SQLSTATE 42501 otherwise;
--   - works on one business or several (the admin "All businesses" view).
--
-- Dates are inclusive YYYY-MM-DD; null means unbounded. "Today" and created_at
-- dates are taken in Asia/Karachi, the business time zone (src/lib/date-range.ts).
--
-- WHAT EACH FUNCTION MIRRORS
-- --------------------------
--   ledger_entries   src/lib/ledger-service.ts listLedgerEntries (filters and
--                    newest-first order), getRangeRunningBalances (range_balance:
--                    starts at 0 on the first entry of the date range, debit -
--                    credit in (entry_date, created_at, id) order over every row
--                    of the range whatever the other filters; one business only,
--                    null in the combined view, like GET /api/general-ledger) and
--                    getLedgerTotals (totals over the date range only, as GET
--                    /api/general-ledger/stats; combined = sum of each book).
--                    Adds opening_balance: debit - credit before the range start.
--   pnl_input        src/app/api/pnl/route.ts fetchRows, for both bases at once:
--                    orders booked in range OR delivered (status Delivered) in
--                    range, payments in range, general_ledger rows of type
--                    vendor_payment / miscellaneous / opening_balance in range,
--                    vendor_ledger bills (general_ledger_id null) in range, and
--                    every vendor with its CURRENT category name. computePnl
--                    (src/lib/pnl.ts) filters by basis itself, so the result is
--                    the same as the API's for either basis.
--   dashboard_summary  src/app/api/dashboard-stats/route.ts where a figure exists
--                    there; see DIFFERENCES below.
--
-- DASHBOARD DIFFERENCES FROM /api/dashboard-stats
-- -----------------------------------------------
--   - Cash received = orders.advance_paid (by booking_date) + payments.amount
--     (by payment_date), the money definition of src/lib/pnl.ts. The API's
--     "totalReceived" is ledger debit - credit over every entry (vendor
--     payments included); it is returned as ledger_net for comparison.
--   - Outstanding = sum over orders that are not Cancelled of
--     max(total_amount - advance_paid - payments, 0). The API reports
--     totalRevenue - ledger_net; returned as outstanding_api.
--   - Revenue in range = sum of total_amount of orders booked in the range
--     (the API reports all-time; returned as revenue_all_time).
--   - Upcoming deliveries: In Process, due today .. today + 14, nearest first,
--     10 rows, with the balance due. (The API listed the next 5 not Cancelled.)
--   - Monthly series: the last 12 months to the end of the range (the API
--     charted 6 months of ledger order_payment debits).
--   - Exact counts and sums in SQL, no row cap.
--
-- The API routes, the mobile app and the MCP server are not affected.
-- Idempotent (CREATE OR REPLACE; grants repeatable). One transaction.

begin;

-- ---------------------------------------------------------------- guard
-- Internal: not executable by clients.
create or replace function public.reporting_require_admin(p_business_ids uuid[])
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Unauthorized - Please sign in' using errcode = '42501';
  end if;
  if not coalesce(public.current_user_is_admin(), false) then
    raise exception 'Forbidden - Admin only' using errcode = '42501';
  end if;
  if p_business_ids is null or cardinality(p_business_ids) = 0 then
    raise exception 'Select a business' using errcode = '42501';
  end if;
  if exists (
    select unnest(p_business_ids)
    except
    select public.current_user_business_ids()
  ) then
    raise exception 'Forbidden - No access to this business' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------- dashboard_summary
create or replace function public.dashboard_summary(p_business_ids uuid[], p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today      date := (now() at time zone 'Asia/Karachi')::date;
  v_end_month  date;
  v_result     jsonb;
begin
  perform public.reporting_require_admin(p_business_ids);
  v_end_month := date_trunc('month', coalesce(p_to, v_today))::date;

  with
  ord as (
    select o.*,
           coalesce((select sum(p.amount) from public.payments p where p.order_id = o.id), 0) as paid_later
      from public.orders o
     where o.business_id = any (p_business_ids)
  ),
  ord_range as (
    select * from ord
     where (p_from is null or booking_date >= p_from)
       and (p_to   is null or booking_date <= p_to)
  ),
  pay_range as (
    select p.* from public.payments p
     where p.business_id = any (p_business_ids)
       and (p_from is null or p.payment_date >= p_from)
       and (p_to   is null or p.payment_date <= p_to)
  ),
  months as (
    select (v_end_month - make_interval(months => g))::date as month_start
      from generate_series(11, 0, -1) as g
  ),
  series as (
    select to_char(m.month_start, 'YYYY-MM') as month,
           (select count(*) from ord o
             where o.booking_date >= m.month_start
               and o.booking_date < (m.month_start + interval '1 month')) as orders,
           (select coalesce(sum(o.total_amount), 0) from ord o
             where o.booking_date >= m.month_start
               and o.booking_date < (m.month_start + interval '1 month')) as order_value,
           (select coalesce(sum(o.advance_paid), 0) from ord o
             where o.booking_date >= m.month_start
               and o.booking_date < (m.month_start + interval '1 month')) as cash_advances,
           (select coalesce(sum(p.amount), 0) from public.payments p
             where p.business_id = any (p_business_ids)
               and p.payment_date >= m.month_start
               and p.payment_date < (m.month_start + interval '1 month')) as cash_payments
      from months m
  ),
  ledger_all as (
    select coalesce(sum(gl.debit), 0) as debit, coalesce(sum(gl.credit), 0) as credit
      from public.general_ledger gl
     where gl.business_id = any (p_business_ids)
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today),
    'customers', jsonb_build_object(
      'total', (select count(*) from public.customers c where c.business_id = any (p_business_ids)),
      'new_in_range', (select count(*) from public.customers c
                        where c.business_id = any (p_business_ids)
                          and (p_from is null or (c.created_at at time zone 'Asia/Karachi')::date >= p_from)
                          and (p_to   is null or (c.created_at at time zone 'Asia/Karachi')::date <= p_to))
    ),
    'orders', jsonb_build_object(
      'total', (select count(*) from ord),
      'in_range', (select count(*) from ord_range),
      'by_status', coalesce((select jsonb_object_agg(s.status, s.n)
                               from (select status::text as status, count(*) as n from ord_range group by status) s),
                            '{}'::jsonb)
    ),
    'revenue_in_range', (select coalesce(sum(total_amount), 0) from ord_range),
    'revenue_all_time', (select coalesce(sum(total_amount), 0) from ord),
    'cash_received', jsonb_build_object(
      'advances', (select coalesce(sum(advance_paid), 0) from ord_range),
      'payments', (select coalesce(sum(amount), 0) from pay_range),
      'total', (select coalesce(sum(advance_paid), 0) from ord_range)
             + (select coalesce(sum(amount), 0) from pay_range)
    ),
    'outstanding', (select coalesce(sum(greatest(coalesce(total_amount, 0) - coalesce(advance_paid, 0) - paid_later, 0)), 0)
                      from ord where status::text <> 'Cancelled'),
    'ledger_net', (select debit - credit from ledger_all),
    'outstanding_api', (select coalesce(sum(total_amount), 0) from ord) - (select debit - credit from ledger_all),
    'monthly', coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from series s), '[]'::jsonb),
    'top_customers', coalesce((
      select jsonb_agg(t order by t.order_value desc, t.name)
        from (
          select c.id, c.name, c.phone, count(*) as orders, coalesce(sum(o.total_amount), 0) as order_value
            from ord_range o
            join public.customers c on c.id = o.customer_id
           group by c.id, c.name, c.phone
           order by order_value desc, c.name
           limit 5
        ) t), '[]'::jsonb),
    'upcoming_deliveries', coalesce((
      select jsonb_agg(u order by u.delivery_date, u.order_number)
        from (
          select o.id, o.order_number, o.delivery_date, o.status::text as status,
                 c.name as customer_name, c.phone as customer_phone,
                 greatest(coalesce(o.total_amount, 0) - coalesce(o.advance_paid, 0) - o.paid_later, 0) as balance
            from ord o
            join public.customers c on c.id = o.customer_id
           where o.status::text = 'In Process'
             and o.delivery_date >= v_today
             and o.delivery_date <= v_today + 14
           order by o.delivery_date, o.order_number
           limit 10
        ) u), '[]'::jsonb),
    'overdue_deliveries', (select count(*) from ord
                            where status::text = 'In Process' and delivery_date < v_today)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- ledger_entries
create or replace function public.ledger_entries(
  p_business_ids        uuid[],
  p_from                date,
  p_to                  date,
  p_search              text,
  p_entry_type          text,
  p_vendor_id           uuid,
  p_limit               int,
  p_offset              int,
  p_vendor_category_id  uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_single uuid := case when cardinality(p_business_ids) = 1 then p_business_ids[1] end;
  v_result jsonb;
begin
  perform public.reporting_require_admin(p_business_ids);

  with
  -- Every filter of listLedgerEntries.
  filtered as (
    select gl.*
      from public.general_ledger gl
      left join public.vendors v on v.id = gl.vendor_id
     where gl.business_id = any (p_business_ids)
       and (p_from is null or gl.entry_date >= p_from)
       and (p_to   is null or gl.entry_date <= p_to)
       and (nullif(p_entry_type, '') is null or gl.entry_type::text = p_entry_type)
       and (p_vendor_id is null or gl.vendor_id = p_vendor_id)
       and (p_vendor_category_id is null or v.category_id = p_vendor_category_id)
       and (nullif(p_search, '') is null or gl.particulars ilike '%' || p_search || '%')
  ),
  page as (
    select * from filtered
     order by entry_date desc, created_at desc, id desc
     limit p_limit offset coalesce(p_offset, 0)
  ),
  -- getRangeRunningBalances: one business, the date range only, from 0.
  running as (
    select gl.id,
           sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0))
             over (order by gl.entry_date, gl.created_at, gl.id
                   rows between unbounded preceding and current row) as range_balance
      from public.general_ledger gl
     where v_single is not null
       and gl.business_id = v_single
       and (p_from is null or gl.entry_date >= p_from)
       and (p_to   is null or gl.entry_date <= p_to)
  ),
  -- getLedgerTotals: the date range only (search/type/vendor do not apply).
  totals as (
    select coalesce(sum(gl.debit), 0) as debit, coalesce(sum(gl.credit), 0) as credit, count(*) as entries
      from public.general_ledger gl
     where gl.business_id = any (p_business_ids)
       and (p_from is null or gl.entry_date >= p_from)
       and (p_to   is null or gl.entry_date <= p_to)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
               to_jsonb(p)
               || jsonb_build_object(
                    'range_balance', r.range_balance,
                    'business_name', b.name,
                    'vendors', case when v.id is null then null else jsonb_build_object(
                      'id', v.id, 'name', v.name, 'category_id', v.category_id,
                      'vendor_categories', case when vc.id is null then null
                                                else jsonb_build_object('id', vc.id, 'name', vc.name) end) end,
                    'orders', case when o.id is null then null
                                   else jsonb_build_object('id', o.id, 'order_number', o.order_number) end,
                    'vendor_tags', case when t.id is null then null
                                        else jsonb_build_object('id', t.id, 'tag_name', t.tag_name) end
                  )
               order by p.entry_date desc, p.created_at desc, p.id desc)
        from page p
        left join running r on r.id = p.id
        left join public.businesses b on b.id = p.business_id
        left join public.vendors v on v.id = p.vendor_id
        left join public.vendor_categories vc on vc.id = v.category_id
        left join public.orders o on o.id = p.order_id
        left join public.vendor_tags t on t.id = p.tag_id
    ), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'combined', v_single is null,
    'opening_balance', case when p_from is null then 0 else (
      select coalesce(sum(coalesce(gl.debit, 0) - coalesce(gl.credit, 0)), 0)
        from public.general_ledger gl
       where gl.business_id = any (p_business_ids) and gl.entry_date < p_from) end,
    'totals', (select jsonb_build_object(
                 'debit', debit, 'credit', credit, 'net', debit - credit, 'entry_count', entries)
                 from totals)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- pnl_input
create or replace function public.pnl_input(p_business_ids uuid[], p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.reporting_require_admin(p_business_ids);
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'A profit and loss range needs a start and an end, start on or before end'
      using errcode = '22023';
  end if;

  select jsonb_build_object(
    -- Cash reads booking_date; accrual reads Delivered by delivery_date.
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'business_id', o.business_id, 'booking_date', o.booking_date, 'delivery_date', o.delivery_date,
               'status', o.status::text, 'total_amount', o.total_amount, 'advance_paid', o.advance_paid)
             order by o.id)
        from public.orders o
       where o.business_id = any (p_business_ids)
         and ((o.booking_date between p_from and p_to)
              or (o.status::text = 'Delivered' and o.delivery_date between p_from and p_to))
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'business_id', p.business_id, 'payment_date', p.payment_date, 'amount', p.amount)
             order by p.id)
        from public.payments p
       where p.business_id = any (p_business_ids)
         and p.payment_date between p_from and p_to
    ), '[]'::jsonb),
    -- order_payment rows mirror advances + payments and are never read.
    'ledger', coalesce((
      select jsonb_agg(jsonb_build_object(
               'business_id', g.business_id, 'entry_date', g.entry_date, 'entry_type', g.entry_type::text,
               'debit', g.debit, 'credit', g.credit, 'vendor_id', g.vendor_id,
               'particulars', g.particulars, 'notes', g.notes)
             order by g.id)
        from public.general_ledger g
       where g.business_id = any (p_business_ids)
         and g.entry_type::text in ('vendor_payment', 'miscellaneous', 'opening_balance')
         and g.entry_date between p_from and p_to
    ), '[]'::jsonb),
    -- Bills only: rows linked to a general-ledger payment are its mirror.
    'vendorLedger', coalesce((
      select jsonb_agg(jsonb_build_object(
               'business_id', vl.business_id, 'vendor_id', vl.vendor_id, 'entry_date', vl.entry_date,
               'debit', vl.debit, 'credit', vl.credit, 'general_ledger_id', vl.general_ledger_id)
             order by vl.id)
        from public.vendor_ledger vl
       where vl.business_id = any (p_business_ids)
         and vl.general_ledger_id is null
         and vl.entry_date between p_from and p_to
    ), '[]'::jsonb),
    -- The vendor's CURRENT category.
    'vendors', coalesce((
      select jsonb_agg(jsonb_build_object('id', v.id, 'business_id', v.business_id, 'category_name', vc.name)
             order by v.id)
        from public.vendors v
        left join public.vendor_categories vc on vc.id = v.category_id
       where v.business_id = any (p_business_ids)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.reporting_require_admin(uuid[]) from public, anon, authenticated;

revoke all on function public.dashboard_summary(uuid[], date, date) from public, anon;
revoke all on function public.ledger_entries(uuid[], date, date, text, text, uuid, int, int, uuid) from public, anon;
revoke all on function public.pnl_input(uuid[], date, date) from public, anon;

grant execute on function public.dashboard_summary(uuid[], date, date) to authenticated;
grant execute on function public.ledger_entries(uuid[], date, date, text, text, uuid, int, int, uuid) to authenticated;
grant execute on function public.pnl_input(uuid[], date, date) to authenticated;

-- ---------------------------------------------------------------- checks
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.dashboard_summary(uuid[], date, date)',
    'public.ledger_entries(uuid[], date, date, text, text, uuid, int, int, uuid)',
    'public.pnl_input(uuid[], date, date)'
  ] loop
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% is not executable by authenticated', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% is executable by anon', f;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    if (select p.provolatile from pg_proc p where p.oid = f::regprocedure) <> 's' then
      raise exception '% is not STABLE', f;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.reporting_require_admin(uuid[])', 'EXECUTE') then
    raise exception 'reporting_require_admin is executable by authenticated';
  end if;
  -- Still closed: the ledgers have no client grants.
  if has_table_privilege('authenticated', 'public.general_ledger', 'SELECT')
     or has_table_privilege('authenticated', 'public.vendor_ledger', 'SELECT') then
    raise exception 'ledger tables became readable by authenticated';
  end if;
  raise notice 'reporting functions installed';
end;
$$;

commit;
