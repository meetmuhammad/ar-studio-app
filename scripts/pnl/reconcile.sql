-- Profit & Loss reconciliation: the same rules as src/lib/pnl.ts, in SQL.
--
-- READ ONLY. No inserts, updates, deletes or DDL; the whole script runs inside
-- a READ ONLY transaction, so Postgres refuses any write even by mistake.
--
-- Usage (dates inclusive, YYYY-MM-DD; business is a uuid, or omit/empty for
-- every business):
--
--   psql "$DATABASE_URL" -v start=2026-05-01 -v end=2026-05-31 -f scripts/pnl/reconcile.sql
--   psql "$DATABASE_URL" -v start=2026-01-01 -v end=2026-12-31 \
--        -v business=00000000-0000-0000-0000-000000000000 -f scripts/pnl/reconcile.sql
--
-- Output: one table with columns section | mode | item | amount_pkr
--   statement  cash|accrual  revenue, cost_of_sales, gross_profit, staff,
--                            overheads, other_expense, other_income, net_profit
--   monthly    cash|accrual  YYYY-MM -> net profit for that calendar month
--   excluded   cash|accrual  opening_balance, owner_withdrawal, transfers_count,
--                            transfers_in, transfers_out,
--                            suppressed_vendor_payments (accrual),
--                            payment_dated_vendor_costs (accrual)
--
-- Amounts are PKR as exact numeric (no floats). The app shows the same figures
-- in whole rupees and returns them from /api/pnl as integer cents.
--
-- Keep the category CASE below in step with PNL_CATEGORY_MAP in src/lib/pnl.ts.

\set ON_ERROR_STOP on
\if :{?business}
\else
  \set business ''
\endif

BEGIN READ ONLY;

WITH params AS (
  SELECT :'start'::date AS s, :'end'::date AS e, nullif(:'business', '')::uuid AS b
),

-- The vendor's CURRENT category (not general_ledger.vendor_category_name).
vendor_line AS (
  SELECT v.id AS vendor_id,
         CASE lower(btrim(c.name))
           WHEN 'purchases'        THEN 'cost_of_sales'
           WHEN 'employees'        THEN 'staff'
           WHEN 'fixed expense'    THEN 'overheads'
           WHEN 'charity'          THEN 'other_expense'
           WHEN 'uncategorized'    THEN 'other_expense'
           WHEN 'owner withdrawal' THEN 'drawings'
           ELSE 'other_expense'
         END AS line
  FROM vendors v
  LEFT JOIN vendor_categories c ON c.id = v.category_id
  , params p
  WHERE p.b IS NULL OR v.business_id = p.b
),

-- General-ledger rows the report reads. order_payment is a mirror of
-- advances + payments and is never read.
gl AS (
  SELECT g.entry_date, g.entry_type, g.vendor_id,
         coalesce(g.debit, 0) AS debit, coalesce(g.credit, 0) AS credit,
         (coalesce(g.particulars, '') ~* '\mtransfer\M' OR coalesce(g.notes, '') ~* '\mtransfer\M') AS is_transfer
  FROM general_ledger g, params p
  WHERE g.entry_date BETWEEN p.s AND p.e
    AND (p.b IS NULL OR g.business_id = p.b)
    AND g.entry_type IN ('vendor_payment', 'miscellaneous', 'opening_balance')
),
gl_counted AS (
  SELECT * FROM gl WHERE entry_type <> 'opening_balance' AND NOT is_transfer
),

-- Bills: vendor-ledger rows NOT linked to a general-ledger payment (linked
-- rows are that payment's mirror), with a non-zero amount.
bills AS (
  SELECT vl.vendor_id, vl.entry_date, coalesce(vl.credit, 0) - coalesce(vl.debit, 0) AS amount
  FROM vendor_ledger vl, params p
  WHERE vl.general_ledger_id IS NULL
    AND vl.entry_date BETWEEN p.s AND p.e
    AND (p.b IS NULL OR vl.business_id = p.b)
    AND (coalesce(vl.debit, 0) <> 0 OR coalesce(vl.credit, 0) <> 0)
),
billed_vendors AS (SELECT DISTINCT vendor_id FROM bills),

-- Every amount that lands on a line: (mode, date, line, amount).
events AS (
  -- cash revenue: advances by booking_date (every status), later payments by payment_date
  SELECT 'cash' AS mode, o.booking_date AS d, 'revenue' AS line, coalesce(o.advance_paid, 0) AS amount
  FROM orders o, params p
  WHERE o.booking_date BETWEEN p.s AND p.e AND (p.b IS NULL OR o.business_id = p.b)
  UNION ALL
  SELECT 'cash', pm.payment_date, 'revenue', pm.amount
  FROM payments pm, params p
  WHERE pm.payment_date BETWEEN p.s AND p.e AND (p.b IS NULL OR pm.business_id = p.b)
  UNION ALL
  -- accrual revenue: delivered orders at full value by delivery_date
  SELECT 'accrual', o.delivery_date, 'revenue', coalesce(o.total_amount, 0)
  FROM orders o, params p
  WHERE o.status = 'Delivered' AND o.delivery_date BETWEEN p.s AND p.e AND (p.b IS NULL OR o.business_id = p.b)
  UNION ALL
  -- miscellaneous, both modes: no vendor -> debit is other income, credit other expense
  SELECT m.mode, g.entry_date, 'other_income', g.debit
  FROM gl_counted g CROSS JOIN (VALUES ('cash'), ('accrual')) m(mode)
  WHERE g.entry_type = 'miscellaneous' AND g.vendor_id IS NULL
  UNION ALL
  SELECT m.mode, g.entry_date, 'other_expense', g.credit
  FROM gl_counted g CROSS JOIN (VALUES ('cash'), ('accrual')) m(mode)
  WHERE g.entry_type = 'miscellaneous' AND g.vendor_id IS NULL
  UNION ALL
  -- miscellaneous with a vendor, both modes: the vendor's category, credit - debit
  SELECT m.mode, g.entry_date, coalesce(vl.line, 'other_expense'), g.credit - g.debit
  FROM gl_counted g CROSS JOIN (VALUES ('cash'), ('accrual')) m(mode)
  LEFT JOIN vendor_line vl ON vl.vendor_id = g.vendor_id
  WHERE g.entry_type = 'miscellaneous' AND g.vendor_id IS NOT NULL
  UNION ALL
  -- cash vendor costs: every vendor_payment, credit - debit
  SELECT 'cash', g.entry_date, coalesce(vl.line, 'other_expense'), g.credit - g.debit
  FROM gl_counted g LEFT JOIN vendor_line vl ON vl.vendor_id = g.vendor_id
  WHERE g.entry_type = 'vendor_payment'
  UNION ALL
  -- accrual vendor costs: bills where the vendor has any in range ...
  SELECT 'accrual', b.entry_date, coalesce(vl.line, 'other_expense'), b.amount
  FROM bills b LEFT JOIN vendor_line vl ON vl.vendor_id = b.vendor_id
  UNION ALL
  -- ... otherwise that vendor's payments, dated when paid
  SELECT 'accrual', g.entry_date, coalesce(vl.line, 'other_expense'), g.credit - g.debit
  FROM gl_counted g LEFT JOIN vendor_line vl ON vl.vendor_id = g.vendor_id
  WHERE g.entry_type = 'vendor_payment'
    AND (g.vendor_id IS NULL OR NOT EXISTS (SELECT 1 FROM billed_vendors bv WHERE bv.vendor_id = g.vendor_id))
),

modes AS (SELECT * FROM (VALUES ('cash', 1), ('accrual', 2)) m(mode, ord)),

totals AS (
  SELECT m.mode, m.ord,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'revenue'), 0)       AS revenue,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'cost_of_sales'), 0) AS cost_of_sales,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'staff'), 0)         AS staff,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'overheads'), 0)     AS overheads,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'other_expense'), 0) AS other_expense,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'other_income'), 0)  AS other_income,
         coalesce(sum(e.amount) FILTER (WHERE e.line = 'drawings'), 0)      AS drawings
  FROM modes m LEFT JOIN events e ON e.mode = m.mode
  GROUP BY m.mode, m.ord
),

months AS (
  SELECT to_char(gs, 'YYYY-MM') AS month
  FROM params p, generate_series(date_trunc('month', p.s), p.e, interval '1 month') gs
),

monthly AS (
  SELECT m.mode, m.ord, mo.month,
         coalesce(sum(CASE e.line
                        WHEN 'revenue'       THEN e.amount
                        WHEN 'other_income'  THEN e.amount
                        WHEN 'cost_of_sales' THEN -e.amount
                        WHEN 'staff'         THEN -e.amount
                        WHEN 'overheads'     THEN -e.amount
                        WHEN 'other_expense' THEN -e.amount
                        ELSE 0
                      END), 0) AS net
  FROM modes m CROSS JOIN months mo
  LEFT JOIN events e ON e.mode = m.mode AND to_char(e.d, 'YYYY-MM') = mo.month
  GROUP BY m.mode, m.ord, mo.month
),

excluded AS (
  SELECT
    (SELECT coalesce(sum(debit - credit), 0) FROM gl WHERE entry_type = 'opening_balance') AS opening_balance,
    (SELECT count(*) FROM gl WHERE entry_type <> 'opening_balance' AND is_transfer)        AS transfers_count,
    (SELECT coalesce(sum(debit), 0) FROM gl WHERE entry_type <> 'opening_balance' AND is_transfer)  AS transfers_in,
    (SELECT coalesce(sum(credit), 0) FROM gl WHERE entry_type <> 'opening_balance' AND is_transfer) AS transfers_out,
    (SELECT coalesce(sum(g.credit - g.debit), 0) FROM gl_counted g
       WHERE g.entry_type = 'vendor_payment'
         AND EXISTS (SELECT 1 FROM billed_vendors bv WHERE bv.vendor_id = g.vendor_id)) AS suppressed,
    (SELECT coalesce(sum(g.credit - g.debit), 0) FROM gl_counted g
       LEFT JOIN vendor_line vl ON vl.vendor_id = g.vendor_id
       WHERE g.entry_type = 'vendor_payment'
         AND coalesce(vl.line, 'other_expense') <> 'drawings'
         AND (g.vendor_id IS NULL OR NOT EXISTS (SELECT 1 FROM billed_vendors bv WHERE bv.vendor_id = g.vendor_id))) AS payment_dated
)

SELECT section, mode, item, amount_pkr
FROM (
  SELECT 1 AS s_ord, t.ord, x.ord AS i_ord, 'statement' AS section, t.mode, x.item, x.amount AS amount_pkr
  FROM totals t
  CROSS JOIN LATERAL (VALUES
    (1, 'revenue',       t.revenue),
    (2, 'cost_of_sales', t.cost_of_sales),
    (3, 'gross_profit',  t.revenue - t.cost_of_sales),
    (4, 'staff',         t.staff),
    (5, 'overheads',     t.overheads),
    (6, 'other_expense', t.other_expense),
    (7, 'other_income',  t.other_income),
    (8, 'net_profit',    t.revenue - t.cost_of_sales - t.staff - t.overheads - t.other_expense + t.other_income)
  ) x(ord, item, amount)

  UNION ALL
  SELECT 2, ord, row_number() OVER (PARTITION BY mode ORDER BY month), 'monthly', mode, month, net
  FROM monthly

  UNION ALL
  SELECT 3, t.ord, x.ord, 'excluded', t.mode, x.item, x.amount
  FROM totals t CROSS JOIN excluded ex
  CROSS JOIN LATERAL (VALUES
    (1, 'opening_balance',  ex.opening_balance),
    (2, 'owner_withdrawal', t.drawings),
    (3, 'transfers_count',  ex.transfers_count::numeric),
    (4, 'transfers_in',     ex.transfers_in),
    (5, 'transfers_out',    ex.transfers_out),
    (6, 'suppressed_vendor_payments', CASE WHEN t.mode = 'accrual' THEN ex.suppressed ELSE 0 END),
    (7, 'payment_dated_vendor_costs', CASE WHEN t.mode = 'accrual' THEN ex.payment_dated ELSE 0 END)
  ) x(ord, item, amount)
) out
ORDER BY s_ord, ord, i_ord;

COMMIT;
