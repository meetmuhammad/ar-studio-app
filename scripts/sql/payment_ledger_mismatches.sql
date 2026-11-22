-- Payment <-> general_ledger mismatches, per order. READ-ONLY.
--
-- For checking a database (dummy, staging or production) after
-- supabase/migrations/20261119000500_payment_ledger_link.sql. It changes
-- nothing: it runs in a READ ONLY transaction that is rolled back, so any
-- write would be refused by Postgres itself. Paste it into the SQL editor or:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/sql/payment_ledger_mismatches.sql
--
-- One result set, one row per finding, ordered by business, order, issue:
--
--   issue                         meaning
--   ----------------------------  ---------------------------------------------
--   payment_without_ledger_row    a payment no general_ledger row is linked to
--                                 (payment_id). `detail` says whether an unlinked
--                                 row matching the old heuristic exists (then
--                                 update_payment / delete_payment would still
--                                 find and link it).
--   payment_row_without_payment   an order_payment row "Payment for Order #<n>"
--                                 with payment_id null: no payment owns it.
--   linked_row_differs            a linked row whose order, amount or date no
--                                 longer equals its payment's.
--   unexpected_order_payment_row  an order_payment row that is neither an
--                                 advance nor a payment row, or has no order.
--   advance_row_mismatch          the order's advance rows do not equal
--                                 orders.advance_paid (missing, extra or wrong
--                                 amount).
--   order_total_mismatch          per order: expected (advance_paid + sum of
--                                 payments) vs the order's order_payment ledger
--                                 net (debit - credit).
--
-- Columns: business, order_number, order_id, issue, payment_id, ledger_id,
-- entry_date, amount, expected, ledger, detail. Unused columns are null.
-- An empty result means payments, advances and the ledger agree.

begin transaction isolation level repeatable read read only;

with
ord as (
  select o.id, o.business_id, o.order_number, coalesce(o.advance_paid, 0) as advance_paid
    from public.orders o
),
pay as (
  select p.*, o.order_number
    from public.payments p
    left join public.orders o on o.id = p.order_id
),
op as (
  select gl.*
    from public.general_ledger gl
   where gl.entry_type = 'order_payment'
),
findings as (
  -- Payments without a linked ledger row.
  select p.business_id, p.order_number, p.order_id, 'payment_without_ledger_row'::text as issue,
         p.id as payment_id, null::uuid as ledger_id, p.payment_date as entry_date, p.amount,
         null::numeric as expected, null::numeric as ledger,
         case when exists (
                select 1 from op
                 where op.payment_id is null
                   and op.business_id = p.business_id
                   and op.order_id = p.order_id
                   and op.particulars = 'Payment for Order #' || p.order_number
                   and op.debit = p.amount
                   and op.entry_date = p.payment_date)
              then 'an unlinked row matches by order, amount and date'
              else 'no matching ledger row' end as detail
    from pay p
   where not exists (select 1 from public.general_ledger gl where gl.payment_id = p.id)

  union all
  -- "Payment for Order" rows no payment owns.
  select op.business_id, o.order_number, op.order_id, 'payment_row_without_payment',
         null, op.id, op.entry_date, coalesce(op.debit, 0) - coalesce(op.credit, 0),
         null, null, op.particulars
    from op
    left join ord o on o.id = op.order_id
   where op.payment_id is null
     and op.particulars like 'Payment for Order #%'

  union all
  -- Linked rows that drifted from their payment.
  select op.business_id, p.order_number, p.order_id, 'linked_row_differs',
         p.id, op.id, op.entry_date, op.debit, p.amount, op.debit,
         concat_ws('; ',
           case when op.order_id is distinct from p.order_id then 'order differs' end,
           case when op.debit is distinct from p.amount then 'amount ' || coalesce(op.debit::text, 'null') || ' vs payment ' || p.amount end,
           case when op.entry_date is distinct from p.payment_date then 'date ' || op.entry_date || ' vs payment ' || p.payment_date end,
           case when op.credit is not null and op.credit <> 0 then 'has a credit' end)
    from op
    join pay p on p.id = op.payment_id
   where op.order_id is distinct from p.order_id
      or op.debit is distinct from p.amount
      or op.entry_date is distinct from p.payment_date
      or (op.credit is not null and op.credit <> 0)

  union all
  -- order_payment rows that are neither an advance nor a payment, or orphaned.
  select op.business_id, o.order_number, op.order_id, 'unexpected_order_payment_row',
         op.payment_id, op.id, op.entry_date, coalesce(op.debit, 0) - coalesce(op.credit, 0),
         null, null,
         case when op.order_id is null then 'no order_id: ' || op.particulars
              when o.id is null then 'order no longer exists: ' || op.particulars
              else 'particulars: ' || op.particulars end
    from op
    left join ord o on o.id = op.order_id
   where op.order_id is null
      or o.id is null
      or (op.payment_id is null
          and op.particulars is distinct from 'Advance payment for Order #' || o.order_number
          and op.particulars not like 'Payment for Order #%')

  union all
  -- Advance rows vs orders.advance_paid.
  select o.business_id, o.order_number, o.id, 'advance_row_mismatch',
         null, null, null, a.ledger_advance, o.advance_paid, a.ledger_advance,
         a.advance_rows || ' advance row(s)'
    from ord o
    cross join lateral (
      select count(*) as advance_rows,
             coalesce(sum(coalesce(op.debit, 0) - coalesce(op.credit, 0)), 0) as ledger_advance
        from op
       where op.order_id = o.id
         and op.payment_id is null
         and op.particulars = 'Advance payment for Order #' || o.order_number
    ) a
   where a.ledger_advance <> o.advance_paid
      or a.advance_rows > 1
      or (o.advance_paid > 0 and a.advance_rows = 0)

  union all
  -- Per order: what the order says was received vs what the ledger holds.
  select o.business_id, o.order_number, o.id, 'order_total_mismatch',
         null, null, null, null,
         o.advance_paid + coalesce(ps.paid, 0),
         coalesce(ls.net, 0),
         'advance ' || o.advance_paid || ' + ' || coalesce(ps.n, 0) || ' payment(s) ' || coalesce(ps.paid, 0)
           || ' vs ' || coalesce(ls.n, 0) || ' ledger row(s); difference '
           || (coalesce(ls.net, 0) - (o.advance_paid + coalesce(ps.paid, 0)))
    from ord o
    left join (select order_id, count(*) as n, sum(amount) as paid
                 from public.payments group by order_id) ps on ps.order_id = o.id
    left join (select order_id, count(*) as n, sum(coalesce(debit, 0) - coalesce(credit, 0)) as net
                 from op group by order_id) ls on ls.order_id = o.id
   where o.advance_paid + coalesce(ps.paid, 0) <> coalesce(ls.net, 0)
)
select b.name as business, f.order_number, f.order_id, f.issue, f.payment_id, f.ledger_id,
       f.entry_date, f.amount, f.expected, f.ledger, f.detail
  from findings f
  left join public.businesses b on b.id = f.business_id
 order by b.name nulls last, f.order_number nulls last, f.issue, f.entry_date, f.ledger_id;

rollback;
