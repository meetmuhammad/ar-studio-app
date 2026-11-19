# Row-cap and client-side summing audit (2026-11-19)

PostgREST returns at most 1,000 rows per request (Supabase default `max_rows`). Any read that
expects "every row" from one request silently loses the rest, and any total added up from such a
read is wrong. This audit lists every place in the app that reads lists or adds up money, what
was wrong, and what was done.

**Rules applied**

- Totals and counts are summed in SQL, in a security-checked function (`reporting_require_admin`
  or the order functions' role + membership check), never by adding rows in JS.
- Where a full row list is genuinely needed (legacy "return everything" API responses, exports),
  it is read in 1,000-row pages with a total order (`src/lib/read-all.ts`), or returned whole by
  a function (one jsonb value is not row-capped).
- Not changed when the fix would alter MCP behaviour (`src/lib/ledger-mcp/**`), running-balance
  semantics, or a mobile response shape.

The money definitions now live once, in `supabase/migrations/20261119000600_dashboard_single_source.sql`:
`report_order_balances` (per order: received = advance + payments; balance due = max(total −
advance − payments, 0), 0 when Cancelled) and `report_customer_receipts` (advances by booking date
+ payments by payment date).

## API routes (`src/app/api/**`, used by the mobile app)

| Place | Capped? | Summing in JS? | What was done |
| --- | --- | --- | --- |
| `GET /api/dashboard-stats` | **Yes**: orders and general_ledger read in one request each (2,452 ledger rows on the dummy) | **Yes**: revenue, received, outstanding and the chart | **Fixed.** Calls `dashboard_summary` as the caller and only renames keys. Same JSON keys and types. Definitions of `totalReceived` / `outstandingBalance` / `chartData` changed (owner-approved; listed in [API-ROLES.md](../API-ROLES.md)). The JS helpers (`getFirstDayOfMonth`, `getSixMonthsAgo`, `buildChartData`) are removed. |
| `GET /api/general-ledger/stats` | No (paged via `getLedgerTotals`) | Yes (cents, over every row) | **Fixed.** Reads `ledger_entries` totals (`p_limit` 0) as the caller: the same SQL sums the web Ledger page shows. Same JSON (`byBusiness` too). `getLedgerTotals` stays for MCP. |
| `GET /api/general-ledger` (no `page`, legacy flat array) | **Yes**: one request | No | **Fixed** in `listLedgerEntries` (`src/lib/ledger-service.ts`): the `page = 0` branch now reads every row in 1,000-row pages (fresh builder per page, order `entry_date, created_at, id` desc, total). Same JSON. |
| `GET /api/general-ledger?page=n` | No (one page; `range_balance` via `getRangeRunningBalances`, paged) | Running balance in JS (cents) | **Left.** Not capped. Moving the running balance would change running-balance semantics and `ledger-service.ts`, which MCP shares; the web Ledger already uses `ledger_entries`. |
| `GET /api/vendor-ledger?vendor_id=` | **Yes**: one vendor's rows in one request | No | **Fixed.** Read in pages; order `entry_date, created_at` desc + `id` desc tie-break. Same JSON. |
| `POST /api/vendor-ledger` | No (last row only) | Running balance from the last row | **Left.** Not a cap issue; changing it is running-balance semantics (the web app uses `record_vendor_bill`). |
| `GET /api/pnl` | No: already paged (`readAll`, now shared in `src/lib/read-all.ts`) | Yes, `computePnl` over complete rows | **Left (helper moved).** Not capped. `computePnl` (`src/lib/pnl.ts`) is the one P&L definition, shared with the web page; moving it to SQL is a rewrite of the P&L rules, out of scope. `pnl.ts` unchanged. |
| `GET /api/orders/all` (`getAllOrdersSimple`) | **Yes**: `.limit(1000)` | No | **Fixed.** Read in pages (`created_at` desc, `id`). Same JSON. |
| `GET /api/payments` | **Yes**: unfiltered list in one request | No | **Fixed.** Read in pages (`payment_date` desc, `id`). Same JSON (`{payments}`). |
| `GET /api/vendors` | **Yes**: one request | No | **Fixed.** Read in pages (`name`, `id`). Same JSON. |
| `GET /api/orders` | No (server-side pages, exact count) | No | No change. |
| `GET /api/orders` search (`getOrders`, `src/lib/database.ts`) | Customer matches for `q` resolved with `.limit(1000)` | No | **Left.** Caps the customers a search term matches, not a total; the ids go into an `in (...)` URL filter, so more than ~1,000 would exceed URL limits anyway. Needs a search function if a term ever matches that many. |
| `GET /api/customers` | No (pages; per-row order counts are head-only counts) | No | No change. |
| `GET /api/measurements` | No (pages) | No | No change. |
| `GET /api/customers/[id]/measurements` | One customer's sets in one request | No | **Left.** Bounded per customer (a handful of sets). |
| `GET /api/vendor-tags?vendor_id=` | One vendor's tags in one request | No | **Left.** Bounded per vendor. |
| `GET /api/vendor-categories` | One request | No | **Left.** The shared category chart (tens of rows). |
| `/api/mcp` and `src/lib/ledger-mcp/**` | No (`getLedgerTotals` and `getRangeRunningBalances` page; `list_ledger_entries` always asks for a page ≤ 50) | Yes, in cents, over every row | **Left by rule** (MCP behaviour must not change). Its figures are the same definitions as `ledger_entries`; not capped. |

## Web app (Refine)

| Place | Capped? | Summing in JS? | What was done |
| --- | --- | --- | --- |
| Dashboard `/` (`src/app/(dashboard)/page.tsx`) | No (`dashboard_summary`) | No | **Updated.** All-time figures (revenue, total received, outstanding, customers) now come from the new `all_time` block, the same numbers as the API; adds "Total received, all time". Range cards unchanged. |
| Customer page `/customers/show/:id` | **Yes**: orders list `pageSize: 100` | **Yes**: revenue, "Paid" (advances only) and "Balance" (stored `orders.balance`, never updated by payments) over the loaded rows | **Fixed.** Cards read `customer_order_summary` (every order, same definitions as the dashboard; staff allowed as members). The list still shows the latest 100 and says so when there are more; each order's "pending" = total − advance − payments (not for Cancelled). |
| Ledger `/ledger` table, totals, stat cards | No (`ledger_entries`, server pages, SQL totals) | No | No change. |
| Ledger CSV export | No (`ledger_entries` with `p_limit` null: every row in one jsonb value) | No | No change. |
| P&L `/pnl` | No (`pnl_input` returns every row as one jsonb value) | `computePnl` over complete rows | **Left**, same reason as `/api/pnl`. |
| Vendor ledger card (vendor page) | No (`vendor_ledger_entries` function, totals in SQL) | No (client-side filtering only) | No change. |
| Orders list | No (server pages) | Per row: `paymentSummary` over that order's embedded payments | **Left.** Per-order and bounded; the same formula as the receipt and order page. |
| Order page payments (`pagination: { mode: 'off' }`) | One order's payments | Per order | **Left.** Bounded per order. |
| Payment modal (payments of the chosen order, `mode: 'off'`) | One order's payments | Per order | **Left.** Bounded. |
| Print receipt (`src/components/print-receipt.tsx`) | — | One order's payments | **Left.** Bounded per order. |
| Measurement picker in the order form (`mode: 'off'`) | One customer's sets | No | **Left.** Bounded. |
| Vendor categories (drawer, select; `mode: 'off'`) | Category chart | No | **Left.** Tens of rows. |
| Tag suggestions (`useTagSuggestions`, `mode: 'off'`) | **Could** stop at 1,000 tags | No | **Left.** Suggestions only (a missing suggestion has no effect on data); far below 1,000. |
| Data provider virtual filters (`customerSearch`, `orderSearch`, `vendorTagSearch`: `.limit(1000)`) | Caps matches of a search term | No | **Left**, as `getOrders` search (URL `in (...)` limit). The vendor and measurement cases are also listed under Deferred in REFINE.md. |
| Pickers with `pageSize` 20/50 and server search (customers, vendors, orders) | Paged by design | No | No change. |

## Files changed for this audit

- `supabase/migrations/20261119000600_dashboard_single_source.sql` (new): helpers,
  `dashboard_summary` (rebuilt), `customer_order_summary`, `payments(order_id)` index if missing.
- `supabase/tests/reporting_functions_check.sql`: second block for the new figures.
- `src/lib/read-all.ts` (new): the shared pager (moved from `src/app/api/pnl/route.ts`).
- `src/app/api/dashboard-stats/route.ts`, `src/app/api/general-ledger/stats/route.ts`,
  `src/app/api/payments/route.ts`, `src/app/api/vendor-ledger/route.ts`,
  `src/app/api/vendors/route.ts`, `src/app/api/pnl/route.ts` (import only),
  `src/app/api/general-ledger/route.ts` (comment).
- `src/lib/database.ts` (`getAllOrdersSimple`), `src/lib/ledger-service.ts` (`listLedgerEntries`
  page 0 only; `getLedgerTotals` and `getRangeRunningBalances` unchanged).
- `src/lib/refine/reporting.ts` (types, `useCustomerOrderSummary`), `src/app/(dashboard)/page.tsx`,
  `src/app/(dashboard)/customers/show/[id]/page.tsx`.

## How to verify

1. Apply `20261119000600_dashboard_single_source.sql` to the dummy project (it raises if a
   privilege or volatility check fails).
2. Run `supabase/tests/reporting_functions_check.sql` (rolls back). Expect `ALL CHECKS PASSED`
   and `ALL DASHBOARD CHECKS PASSED`; on the dummy the `[one business]` line should read received
   48,830,060 (26,747,500 + 22,082,560) and outstanding 5,083,000.
3. `GET /api/dashboard-stats` as an admin: `totalReceived` 48830060, `outstandingBalance`
   5083000, `totalRevenue` equal to the SQL sum of `orders.total_amount`.
