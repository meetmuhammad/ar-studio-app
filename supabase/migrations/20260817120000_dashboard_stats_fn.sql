-- Dashboard KPI + monthly booked-revenue aggregate, computed in the database.
--
-- WHY THIS EXISTS
-- The dashboard route used to `select('id, total_amount')` over `orders` and
-- `select('id, debit, credit')` over `general_ledger` and sum the rows in
-- JavaScript. PostgREST caps a response at 1000 rows, so past 1000 orders those
-- totals were silently wrong -- not slow, wrong. PostgREST's own aggregate
-- functions (`select=total_amount.sum()`) are disabled on this project
-- (PGRST123), so the aggregation has to live in a function.
--
-- DEFINITIONS (all scoped to `booking_date` between p_start and p_end inclusive,
-- and to orders whose status is not 'Cancelled'):
--   total_orders  count of those orders
--   total_revenue SUM(total_amount)                        -- booked, not collected
--   collected     SUM(advance_paid + SUM(payments.amount)) -- money in, per order
--   outstanding   SUM(total_amount - collected_per_order)  -- current, not as-of
--   chart         SUM(total_amount) per booking month, zero-filled
--
-- `orders.balance` is deliberately NOT used: it is a snapshot taken at order
-- creation (see its column comment) and disagrees with total_amount - paid on
-- most rows. `orders_with_payment_status` computes the same `total_paid` this
-- function does, but that view has no migration in this repo, so the function
-- aggregates the base tables directly rather than depending on an object whose
-- definition is not under version control.
--
-- The advance is counted exactly once: `advance_paid` lives on `orders` and is
-- never duplicated into `payments`, so collected = advance + additional payments.

create or replace function public.dashboard_stats(p_start date, p_end date)
returns jsonb
language sql
stable
as $$
with bounds as (
  select
    p_start as start_date,
    p_end   as end_date,
    date_trunc('month', p_start::timestamp)::date as first_month,
    -- Hard cap of 121 buckets. The caller validates the span too, but a
    -- generate_series over an unbounded range is a trivial way to pin a CPU,
    -- so the SQL refuses to build one regardless of what it is handed.
    least(
      date_trunc('month', p_end::timestamp),
      date_trunc('month', p_start::timestamp) + interval '120 months'
    )::date as last_month
),
scoped as (
  select
    o.id,
    coalesce(o.total_amount, 0)::numeric as total_amount,
    coalesce(o.advance_paid, 0)::numeric as advance_paid,
    date_trunc('month', o.booking_date)::date as month_start
  from public.orders o
  cross join bounds b
  where o.status <> 'Cancelled'
    and o.booking_date >= b.start_date
    and o.booking_date <= b.end_date
),
paid as (
  select
    s.total_amount,
    s.advance_paid + coalesce(
      (select sum(p.amount) from public.payments p where p.order_id = s.id), 0
    )::numeric as total_paid
  from scoped s
),
kpis as (
  select
    count(*)::bigint                                     as total_orders,
    coalesce(sum(total_amount), 0)::numeric              as total_revenue,
    coalesce(sum(total_paid), 0)::numeric                as collected,
    coalesce(sum(total_amount - total_paid), 0)::numeric as outstanding
  from paid
),
months as (
  select generate_series(b.first_month, b.last_month, interval '1 month')::date as month_start
  from bounds b
),
booked as (
  select s.month_start, sum(s.total_amount) as revenue
  from scoped s
  group by s.month_start
),
chart as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object('month_start', m.month_start, 'revenue', coalesce(bk.revenue, 0))
      order by m.month_start
    ),
    '[]'::jsonb
  ) as data
  from months m
  left join booked bk on bk.month_start = m.month_start
)
select jsonb_build_object(
  'range_start',   b.start_date,
  'range_end',     b.end_date,
  'total_orders',  k.total_orders,
  'total_revenue', k.total_revenue,
  'collected',     k.collected,
  'outstanding',   k.outstanding,
  'chart',         c.data
)
from bounds b, kpis k, chart c;
$$;

comment on function public.dashboard_stats(date, date) is
  'Range-scoped dashboard KPIs and monthly booked revenue. service_role only -- see the revokes in 20260817120000_dashboard_stats_fn.sql; the API route calls it with the service-role key from behind withAdmin.';

-- ---------------------------------------------------------------------------
-- PRIVILEGES -- the whole point of this block
--
-- Supabase publishes every function in `public` through PostgREST at
-- /rest/v1/rpc/<name>. The `anon` key is shipped inside the browser bundle, so
-- it is effectively public. A function returning revenue, collections and
-- outstanding balances with default privileges is therefore a world-readable
-- financial endpoint that walks straight past `withAdmin` -- the same class of
-- hole the CDN cache header was, only worse, because no cache warming is needed.
--
-- Postgres grants EXECUTE to PUBLIC on new functions by default, and Supabase
-- additionally sets default privileges for anon/authenticated/service_role, so
-- all three revokes are required; none is redundant.
--
-- SECURITY INVOKER (the default -- deliberately not marked SECURITY DEFINER).
-- The only role that can execute it is service_role, which already bypasses
-- RLS, so DEFINER would buy nothing and would turn any future accidental grant
-- into a privilege escalation instead of a plain permission error.
--
-- Re-runnable: CREATE OR REPLACE preserves an existing ACL, and these
-- statements are reapplied on every run, so the end state is the same whether
-- this is the first apply or the fifth.
-- ---------------------------------------------------------------------------
revoke all on function public.dashboard_stats(date, date) from public;
revoke all on function public.dashboard_stats(date, date) from anon;
revoke all on function public.dashboard_stats(date, date) from authenticated;
grant execute on function public.dashboard_stats(date, date) to service_role;

-- Make PostgREST notice the new function (and its ACL) without a restart.
notify pgrst, 'reload schema';
