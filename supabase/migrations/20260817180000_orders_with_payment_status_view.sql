-- Capture public.orders_with_payment_status in version control.
--
-- This view already exists in local, staging and production. It is what the
-- application reads to answer "what has this customer actually paid, and what
-- do they still owe" -- and until now it existed ONLY inside those databases.
-- It was in no migration, so a developer resetting a local environment did not
-- get it, and nobody could review the studio's payment arithmetic without
-- querying a live server.
--
-- This migration changes nothing. It is a transcription of the definition
-- already running, recovered with pg_get_viewdef() and confirmed column-for-
-- column against a read-only inspection of production: the same twenty columns
-- in the same order, and the same five derived expressions.
--
-- Deliberately NOT changed, because capture must not move a single figure:
--
--   * `balance` is passed through from orders. It is the stale legacy column
--     that is being retired -- wrong on 50 of 65 staging orders -- and is NOT
--     the replacement. `current_balance` is. Dropping it from the view is part
--     of physical retirement, which is separately approved work.
--
--   * `total_amount` is not coalesced, so an order with a null total yields a
--     null current_balance rather than a spuriously confident number. That is
--     the existing behaviour and arguably the honest one: unknown total means
--     unknown balance, not "owes nothing".
--
--   * LEFT JOIN, so an order with no payments still appears, with
--     additional_payments 0 and payment_count 0. An INNER JOIN here would make
--     unpaid orders vanish from every screen that reads this view.
--
-- `create or replace view` keeps this idempotent and makes applying it to an
-- environment that already has the view a no-op. It cannot be used to change
-- the column list or order, which is exactly the safety property wanted here:
-- if this transcription disagreed with the live view's shape, this migration
-- would fail loudly rather than silently redefine production's arithmetic.
--
-- Verified by scripts/verify-order-payment-view.mjs, which recomputes every
-- derived column in JS and refuses to use the view's own SQL to check it.

create or replace view public.orders_with_payment_status as
select
  o.id,
  o.order_number,
  o.customer_id,
  o.booking_date,
  o.delivery_date,
  o.comments,
  o.fitting_preferences,
  o.created_at,
  o.updated_at,
  o.total_amount,
  o.advance_paid,
  o.balance,
  o.payment_method,
  o.measurement_id,
  o.status,
  coalesce(o.advance_paid, 0::numeric) as initial_advance,
  coalesce(sum(p.amount), 0::numeric) as additional_payments,
  coalesce(o.advance_paid, 0::numeric) + coalesce(sum(p.amount), 0::numeric) as total_paid,
  o.total_amount - (coalesce(o.advance_paid, 0::numeric) + coalesce(sum(p.amount), 0::numeric)) as current_balance,
  count(p.id) as payment_count
from public.orders o
left join public.payments p on p.order_id = o.id
group by o.id;

comment on view public.orders_with_payment_status is
  'Orders with payment state derived from the payments table. current_balance and '
  'total_paid are authoritative; the passed-through orders.balance column is a '
  'retired legacy value and must not be read. Captured from the live definition; '
  'see scripts/verify-order-payment-view.mjs.';
