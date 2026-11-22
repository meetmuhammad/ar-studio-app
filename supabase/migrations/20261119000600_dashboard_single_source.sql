-- Dashboard figures from one database function, for the web app AND the API.
--
-- WHY
-- ---
-- GET /api/dashboard-stats (mobile app) read general_ledger and orders rows and
-- summed them in JavaScript. PostgREST returns at most 1,000 rows per request,
-- so with more rows than that its totals were silently wrong (the dummy project
-- has 2,452 ledger rows). Its definitions were also not the dashboard's:
-- "totalReceived" was ledger debit - credit over EVERY entry (vendor payments
-- included) and "outstandingBalance" was revenue minus that.
--
-- This migration makes public.dashboard_summary the single source of truth for
-- dashboard figures. The Refine dashboard and /api/dashboard-stats both call it
-- (the API as the caller, so the same admin + membership check applies), and
-- neither sums rows itself.
--
-- ONE DEFINITION OF THE MONEY
-- ---------------------------
-- Two internal helpers hold the only copies of the formulas; every figure below
-- (and customer_order_summary) is a sum over one of them:
--
--   report_order_balances(ids, customer)  one row per order:
--       payments_total = sum(payments.amount) for that order
--       received       = advance_paid + payments_total
--       balance_due    = greatest(total_amount - advance_paid - payments_total, 0),
--                        and 0 for a Cancelled order (nothing left to collect)
--   report_customer_receipts(ids)         one row per receipt from a customer:
--       an order's advance (dated booking_date) or a payment (dated payment_date)
--
--   received (all time or in a range) = sum of receipts      (P&L cash definition)
--   outstanding                       = sum of balance_due   (orders not Cancelled)
--
-- dashboard_summary: WHAT CHANGED (same signature, every key the Refine
-- dashboard reads is kept)
-- -----------------------------------------------------------------------------
--   + all_time: { customers, orders, revenue,
--                 received: { advances, payments, total },
--                 outstanding, recent_orders_this_month }
--       recent_orders_this_month = orders CREATED since the 1st of the current
--       month in Asia/Karachi.
--   + upcoming_orders: the next 5 orders that are not Cancelled with
--       delivery_date >= today (Asia/Karachi), nearest first, each
--       { id, order_number, delivery_date, status, customers: { name, phone } }
--       (the shape /api/dashboard-stats has always returned).
--   + monthly_receipts_6m: the last 6 calendar months including the current one
--       (Asia/Karachi), oldest first, each
--       { month: 'YYYY-MM', label: 'Jun', advances, payments, total }.
--   - ledger_net, outstanding_api: removed. They only existed to compare with
--       the API's old ledger-based figures, which no longer exist.
--   = customers.total, orders.total, revenue_all_time and outstanding are kept
--       (a web build older than this migration still reads them); they are the
--       same values as the all_time block, computed once.
--   Range figures (cash_received, monthly, top_customers, upcoming_deliveries)
--   are unchanged in meaning; they are now sums over the helpers.
--
-- ALSO
-- ----
--   customer_order_summary(p_customer_id): one customer's order count, revenue,
--   received and outstanding, for the customer page (admin or staff who is a
--   member of the customer's business). The page used to sum at most 100 of the
--   customer's orders in the browser, counting advances only as "paid" and the
--   stored orders.balance (set at booking, never updated by payments) as the
--   balance.
--
--   Index: payments(order_id), used for every per-order payment sum. Created
--   only when no index on payments already starts with order_id
--   (database/performance-indexes.sql creates idx_payments_order_id by hand on
--   some projects). orders and payments already have a business_id index
--   (20261106000000); general_ledger is not read here any more.
--
-- Idempotent (CREATE OR REPLACE; index guarded; grants repeatable). One transaction.

begin;

-- ---------------------------------------------------------------- index
do $$
begin
  if not exists (
    select 1
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = 'public.payments'::regclass
       and a.attname = 'order_id'
  ) then
    create index idx_payments_order_id on public.payments (order_id);
    raise notice 'created idx_payments_order_id';
  else
    raise notice 'payments(order_id) is already indexed';
  end if;
end;
$$;

-- ---------------------------------------------------------------- helpers
-- Internal: not executable by clients. The callers check access first.

-- One row per order of the given businesses (optionally one customer's).
create or replace function public.report_order_balances(p_business_ids uuid[], p_customer_id uuid default null)
returns table (
  order_id       uuid,
  business_id    uuid,
  customer_id    uuid,
  order_number   text,
  status         text,
  booking_date   date,
  delivery_date  date,
  created_at     timestamptz,
  total_amount   numeric,
  advance_paid   numeric,
  payments_total numeric,
  received       numeric,
  balance_due    numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id,
         o.business_id,
         o.customer_id,
         o.order_number::text,
         o.status::text,
         o.booking_date,
         o.delivery_date,
         o.created_at,
         coalesce(o.total_amount, 0),
         coalesce(o.advance_paid, 0),
         p.paid,
         coalesce(o.advance_paid, 0) + p.paid,
         case when o.status::text is not distinct from 'Cancelled' then 0
              else greatest(coalesce(o.total_amount, 0) - coalesce(o.advance_paid, 0) - p.paid, 0)
         end
    from public.orders o
    cross join lateral (
      select coalesce(sum(pay.amount), 0) as paid
        from public.payments pay
       where pay.order_id = o.id
    ) p
   where o.business_id = any (p_business_ids)
     and (p_customer_id is null or o.customer_id = p_customer_id)
$$;

-- One row per receipt from a customer: advances by booking date, payments by
-- payment date (src/lib/pnl.ts cash basis uses the same two sources).
create or replace function public.report_customer_receipts(p_business_ids uuid[])
returns table (
  business_id  uuid,
  order_id     uuid,
  receipt_date date,
  kind         text,   -- 'advance' | 'payment'
  amount       numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.business_id, o.id, o.booking_date, 'advance', o.advance_paid
    from public.orders o
   where o.business_id = any (p_business_ids)
     and coalesce(o.advance_paid, 0) <> 0
  union all
  select p.business_id, p.order_id, p.payment_date, 'payment', p.amount
    from public.payments p
   where p.business_id = any (p_business_ids)
     and coalesce(p.amount, 0) <> 0
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
  v_today       date := (now() at time zone 'Asia/Karachi')::date;
  -- Start of the current month in Asia/Karachi, as an instant.
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
  v_end_month   date;
  v_result      jsonb;
begin
  perform public.reporting_require_admin(p_business_ids);
  v_end_month := date_trunc('month', coalesce(p_to, v_today))::date;

  with
  ob as materialized (
    select * from public.report_order_balances(p_business_ids)
  ),
  rc as materialized (
    select * from public.report_customer_receipts(p_business_ids)
  ),
  ob_range as (
    select * from ob
     where (p_from is null or booking_date >= p_from)
       and (p_to   is null or booking_date <= p_to)
  ),
  rc_range as (
    select * from rc
     where (p_from is null or receipt_date >= p_from)
       and (p_to   is null or receipt_date <= p_to)
  ),
  -- All-time figures, computed once (also returned under the older keys).
  totals as (
    select (select count(*) from public.customers c where c.business_id = any (p_business_ids)) as customers,
           (select count(*) from ob)                                                       as orders,
           (select coalesce(sum(total_amount), 0) from ob)                                 as revenue,
           (select coalesce(sum(amount), 0) from rc where kind = 'advance')                as advances,
           (select coalesce(sum(amount), 0) from rc where kind = 'payment')                as payments,
           (select coalesce(sum(balance_due), 0) from ob)                                  as outstanding,
           (select count(*) from ob where created_at >= v_month_start)                     as recent_orders
  ),
  months12 as (
    select (v_end_month - make_interval(months => g))::date as month_start
      from generate_series(11, 0, -1) as g
  ),
  series as (
    select to_char(m.month_start, 'YYYY-MM') as month,
           count(o.order_id)                 as orders,
           coalesce(sum(o.total_amount), 0)  as order_value,
           (select coalesce(sum(r.amount), 0) from rc r
             where r.kind = 'advance'
               and r.receipt_date >= m.month_start
               and r.receipt_date < (m.month_start + interval '1 month')) as cash_advances,
           (select coalesce(sum(r.amount), 0) from rc r
             where r.kind = 'payment'
               and r.receipt_date >= m.month_start
               and r.receipt_date < (m.month_start + interval '1 month')) as cash_payments
      from months12 m
      left join ob o
        on o.booking_date >= m.month_start
       and o.booking_date < (m.month_start + interval '1 month')
     group by m.month_start
  ),
  months6 as (
    select (date_trunc('month', v_today)::date - make_interval(months => g))::date as month_start
      from generate_series(5, 0, -1) as g
  ),
  receipts6 as (
    select to_char(m.month_start, 'YYYY-MM') as month,
           to_char(m.month_start, 'Mon')     as label,   -- English, as the API's 'en-US' short month
           coalesce(sum(r.amount) filter (where r.kind = 'advance'), 0) as advances,
           coalesce(sum(r.amount) filter (where r.kind = 'payment'), 0) as payments,
           coalesce(sum(r.amount), 0)                                   as total
      from months6 m
      left join rc r
        on r.receipt_date >= m.month_start
       and r.receipt_date < (m.month_start + interval '1 month')
     group by m.month_start
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to, 'today', v_today),
    'all_time', (select jsonb_build_object(
                   'customers', t.customers,
                   'orders', t.orders,
                   'revenue', t.revenue,
                   'received', jsonb_build_object(
                     'advances', t.advances, 'payments', t.payments, 'total', t.advances + t.payments),
                   'outstanding', t.outstanding,
                   'recent_orders_this_month', t.recent_orders)
                   from totals t),
    'customers', jsonb_build_object(
      'total', (select customers from totals),
      'new_in_range', (select count(*) from public.customers c
                        where c.business_id = any (p_business_ids)
                          and (p_from is null or (c.created_at at time zone 'Asia/Karachi')::date >= p_from)
                          and (p_to   is null or (c.created_at at time zone 'Asia/Karachi')::date <= p_to))
    ),
    'orders', jsonb_build_object(
      'total', (select orders from totals),
      'in_range', (select count(*) from ob_range),
      'by_status', coalesce((select jsonb_object_agg(s.status, s.n)
                               from (select coalesce(status, 'Unknown') as status, count(*) as n
                                       from ob_range group by 1) s),
                            '{}'::jsonb)
    ),
    'revenue_in_range', (select coalesce(sum(total_amount), 0) from ob_range),
    'revenue_all_time', (select revenue from totals),
    'cash_received', jsonb_build_object(
      'advances', (select coalesce(sum(amount), 0) from rc_range where kind = 'advance'),
      'payments', (select coalesce(sum(amount), 0) from rc_range where kind = 'payment'),
      'total',    (select coalesce(sum(amount), 0) from rc_range)
    ),
    'outstanding', (select outstanding from totals),
    'monthly', coalesce((select jsonb_agg(to_jsonb(s) order by s.month) from series s), '[]'::jsonb),
    'monthly_receipts_6m', coalesce((select jsonb_agg(to_jsonb(r) order by r.month) from receipts6 r), '[]'::jsonb),
    'top_customers', coalesce((
      select jsonb_agg(t order by t.order_value desc, t.name)
        from (
          select c.id, c.name, c.phone, count(*) as orders, coalesce(sum(o.total_amount), 0) as order_value
            from ob_range o
            join public.customers c on c.id = o.customer_id
           group by c.id, c.name, c.phone
           order by order_value desc, c.name
           limit 5
        ) t), '[]'::jsonb),
    'upcoming_deliveries', coalesce((
      select jsonb_agg(u order by u.delivery_date, u.order_number)
        from (
          select o.order_id as id, o.order_number, o.delivery_date, o.status,
                 c.name as customer_name, c.phone as customer_phone,
                 o.balance_due as balance
            from ob o
            join public.customers c on c.id = o.customer_id
           where o.status = 'In Process'
             and o.delivery_date >= v_today
             and o.delivery_date <= v_today + 14
           order by o.delivery_date, o.order_number
           limit 10
        ) u), '[]'::jsonb),
    -- /api/dashboard-stats upcomingOrders: next 5 not Cancelled, nearest first.
    'upcoming_orders', coalesce((
      select jsonb_agg(u.j order by u.delivery_date, u.order_number, u.id)
        from (
          select o.order_id as id, o.order_number, o.delivery_date,
                 jsonb_build_object(
                   'id', o.order_id,
                   'order_number', o.order_number,
                   'delivery_date', o.delivery_date,
                   'status', o.status,
                   'customers', case when c.id is null then null
                                     else jsonb_build_object('name', c.name, 'phone', c.phone) end) as j
            from ob o
            left join public.customers c on c.id = o.customer_id
           where o.status is distinct from 'Cancelled'
             and o.delivery_date >= v_today
           order by o.delivery_date, o.order_number, o.order_id
           limit 5
        ) u), '[]'::jsonb),
    'overdue_deliveries', (select count(*) from ob
                            where status = 'In Process' and delivery_date < v_today)
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- customer_order_summary
-- For the customer page: admin or staff, member of the customer's business
-- (the same people who can read that customer's orders and payments by RLS).
create or replace function public.customer_order_summary(p_customer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_business uuid;
  v_result   jsonb;
begin
  perform public.order_payment_caller_role(false);
  select c.business_id into v_business from public.customers c where c.id = p_customer_id;
  if v_business is null or not public.order_payment_is_member(v_business) then
    -- Not found and not yours look the same, like the RLS-scoped reads.
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
           'orders', count(*),
           'revenue', coalesce(sum(o.total_amount), 0),
           'received', jsonb_build_object(
             'advances', coalesce(sum(o.advance_paid), 0),
             'payments', coalesce(sum(o.payments_total), 0),
             'total',    coalesce(sum(o.received), 0)),
           'outstanding', coalesce(sum(o.balance_due), 0))
    into v_result
    from public.report_order_balances(array[v_business], p_customer_id) o;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.report_order_balances(uuid[], uuid) from public, anon, authenticated;
revoke all on function public.report_customer_receipts(uuid[]) from public, anon, authenticated;

revoke all on function public.dashboard_summary(uuid[], date, date) from public, anon;
grant execute on function public.dashboard_summary(uuid[], date, date) to authenticated;

revoke all on function public.customer_order_summary(uuid) from public, anon;
grant execute on function public.customer_order_summary(uuid) to authenticated;

-- ---------------------------------------------------------------- checks
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.dashboard_summary(uuid[], date, date)',
    'public.customer_order_summary(uuid)'
  ] loop
    if not has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '% is not executable by authenticated', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% is executable by anon', f;
    end if;
  end loop;
  foreach f in array array[
    'public.dashboard_summary(uuid[], date, date)',
    'public.customer_order_summary(uuid)',
    'public.report_order_balances(uuid[], uuid)',
    'public.report_customer_receipts(uuid[])'
  ] loop
    if not (select p.prosecdef from pg_proc p where p.oid = f::regprocedure) then
      raise exception '% is not SECURITY DEFINER', f;
    end if;
    if (select p.provolatile from pg_proc p where p.oid = f::regprocedure) <> 's' then
      raise exception '% is not STABLE', f;
    end if;
  end loop;
  foreach f in array array[
    'public.report_order_balances(uuid[], uuid)',
    'public.report_customer_receipts(uuid[])'
  ] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE') then
      raise exception '% is executable by a client role', f;
    end if;
  end loop;
  raise notice 'dashboard single source installed';
end;
$$;

commit;
