-- Capture public.orders_with_payment_status in version control.
--
-- This view already exists in local, staging and production. It is what the
-- application reads to answer "what has this customer actually paid, and what
-- do they still owe" -- and until now it existed ONLY inside those databases.
-- It was in no migration, so a developer resetting a local environment did not
-- get it, and nobody could review the studio's payment arithmetic without
-- querying a live server.
--
-- This migration changes no data and no computed column. It is a transcription
-- of the definition already running, recovered with pg_get_viewdef() and
-- confirmed column-for-column against a read-only inspection of production: the
-- same twenty columns in the same order, and the same five derived expressions.
--
-- It makes exactly two additions beyond that transcription, both stated openly
-- rather than smuggled in: an explicit `security_invoker = true` (see the note
-- above the statement -- omitting it would be actively dangerous), and a
-- `comment on view` recording that the passed-through `balance` column is
-- retired. Neither alters a single returned value.
--
-- NOTE ON VERIFICATION: this branch lineage has no baseline schema migration
-- and no supabase/config.toml, so `supabase db reset` cannot be run here -- it
-- would produce an empty database in which this migration could not apply for
-- want of public.orders. The proof performed instead was: drop the view, show
-- the verifier fails, apply this file, show pg_get_viewdef returns a definition
-- byte-identical to the one that was running, then exercise six fixtures and
-- cross-check against staging's untouched view. That is a substitute for the
-- demanded clean-reset proof, not the thing itself. Restoring a baseline
-- migration to this lineage is tracked separately.
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

-- security_invoker = true is REQUIRED and is not cosmetic.
--
-- A Postgres view defaults to security_invoker = off, which runs it as the view
-- OWNER and therefore bypasses row-level security on orders and payments.
-- Demonstrated on the local database, where the view was created without this
-- option: with the anon key, `GET /rest/v1/orders` returns [] because RLS blocks
-- it, while `GET /rest/v1/orders_with_payment_status` returns the rows. The view
-- was a hole straight through RLS, readable with the publishable key that ships
-- in the browser bundle.
--
-- Staging returns [] on both, so the hosted view already has security_invoker on.
-- `create or replace view` does NOT preserve unspecified reloptions -- they
-- revert to default -- so capturing the local definition verbatim and applying
-- it to a hosted environment would have silently turned this OFF and exposed
-- every order and payment. Stating it explicitly is what makes this migration
-- safe to replay anywhere.
--
-- The API routes read through the service-role client, which bypasses RLS by
-- design, so enabling this changes nothing for the application.
--
-- VERIFY BEFORE APPLYING TO PRODUCTION: confirm production's view already has
-- security_invoker on, with
--   select reloptions from pg_class where oid = 'public.orders_with_payment_status'::regclass;
-- If production somehow has it OFF, applying this migration TIGHTENS access,
-- which is correct but is a behaviour change worth knowing about in advance.

create or replace view public.orders_with_payment_status
with (security_invoker = true) as
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
