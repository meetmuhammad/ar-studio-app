# Profit & Loss

The **Profit & Loss** page (`/pnl`, sidebar item under More on a phone) shows, for the business you have selected, what came in, what went out, and the profit in between, for a period you choose. It is admin-only, like the Dashboard and the Ledger. Staff are sent to Customers, and the API (`GET /api/pnl`) answers a staff token with 403.

Staff cannot open Profit & Loss. The ledger, vendors, and dashboard are already admin-only. Staff membership is ATC only, which limits which shop they belong to, not a grant to read the books. This page uses that same admin gate and does not add a staff view.

You choose a basis (cash or accrual) and a period. The page writes nothing.

With **All businesses** selected in the switcher, the report adds together every business your login belongs to. That view is read-only, like the rest of the combined view.

All money is PKR. The books have no currency column. Every figure is added up in whole paisa (integer cents), so no rounding happens until the screen shows whole rupees.

## Periods

All dates are calendar days in **Asia/Karachi**. "Today" is today's date in Karachi, not in UTC, so between midnight and 5 am Karachi time the report has already moved on to the new day.

| Period | Covers |
|---|---|
| This Month | 1st to the last day of the month containing today |
| This Quarter | The whole calendar quarter containing today: Jan–Mar, Apr–Jun, Jul–Sep or Oct–Dec |
| This Year | 1 January to 31 December of this year |
| Custom | The start and end you pick, both included. Both are required, the start must not be after the end, and each must be a real date (`2026-02-30` is refused) |

Each preset covers the **whole** period, including the days still to come, the same way This Month and This Year work on the Ledger. They do not stop at today ("to date").

The monthly chart has a point for every calendar month the period touches, including months with nothing in them.

## Cash basis

Cash basis counts money when it actually moved.

- **Revenue** is customer money received in the period:
  - each order's **advance** (`orders.advance_paid`), dated on the order's **booking date**, whatever the order's status is now. That includes cancelled orders, because the cash was received and the books have no refund record to take it back out.
  - each later **payment** (`payments.amount`), dated on its **payment date**.
- **Costs** are general-ledger **vendor payments** and **miscellaneous** entries dated in the period, sorted into lines by category (see below).
- An order's total (`orders.total_amount`) is never counted in cash basis.

## Accrual basis

Accrual basis counts a sale when it is delivered, and a cost when it is billed.

- **Revenue** is the full **total** (`orders.total_amount`) of every order whose status is **Delivered** and whose **delivery date** is in the period. In Process and Cancelled orders count nothing. Advances and payments are never counted in accrual basis.
- **Vendor costs** are worked out vendor by vendor, by amount:
  - A **bill** is a vendor-ledger entry made with "Add Bill", i.e. one not linked to a general-ledger payment, with a non-zero amount. The report counts every bill in the period at its `credit − debit`.
  - The vendor's **payment credits** in the period (money paid out) are left out **up to the total of that vendor's bill credits** in the same period, because the bills already count that money. The amount left out is shown as **Vendor payments replaced by bills**, and it is never added into profit.
  - Payment credits **above** the bill credits still count. They are dated on the day they were paid, and the report says so under "Read this with the figures".
  - Payment **debits** (money that came back from the vendor) are never covered by a bill. They always count, dated on the day they were entered.
  - A vendor with **no bill** in the period has nothing to cover, so all of its payments count, dated on the day they were paid.

  As a formula, per vendor in the period: `bills (credit − debit) + (payment credits − covered) − payment debits`, where `covered` is the smaller of the payment credits and the bill credits. For example, a bill of 10,000 and a payment of 4,000 in the same month is a cost of 10,000 (4,000 replaced by the bill), not 14,000. A bill of 25,000 and a payment of 40,000 is a cost of 40,000: the bill, plus the 15,000 paid above it.
- Cash basis does not change: it counts the vendor's payments (`credit − debit`) and never adds bills.
- **Each month is worked out on its own.** The monthly chart applies the same rule inside each calendar month, using only that month's bills and payments. The period total applies it once over the whole period. So a bill on 1 March and a payment of the same amount on 1 April show as a cost in March **and** in April on the chart (in April there is no bill to cover the payment), while the year total counts the cost once. In that case the months do not add up to the total, and the report says so.
- **Miscellaneous** general-ledger entries are counted the same way as in cash basis, dated on their entry date, because nothing else in the books records when they were incurred.

## The statement

```
Revenue
− Cost of sales / production
= Gross profit
− Staff
− Overheads
− Other (expenses)
+ Other income
= Net profit
```

A vendor cost is `credit − debit` in the ledger. A debit on a vendor's entry is money that came back from the vendor, so it reduces that vendor's cost. For a bill, it is the bill's `credit − debit`.

A miscellaneous entry with **no vendor** is **other income** if it is a debit (money in) and an **other expense** if it is a credit (money out). A miscellaneous entry **with a vendor** goes to that vendor's category line, the same as a vendor payment.

## Categories

Costs go to a line by the vendor's **current** category (Vendors → the vendor's category). The category name is matched after trimming spaces and ignoring capitals.

| Vendor category | Line |
|---|---|
| Purchases | Cost of sales / production |
| Employees | Staff |
| Fixed Expense | Overheads |
| Charity | Other |
| Uncategorized | Other |
| Owner Withdrawal | **Not in profit.** Drawings, shown as "Owner withdrawals" |
| Any other name, or no category | Other. The report lists the names it did not recognise |

Because the report uses each vendor's **current** category, moving a vendor to a different category also moves its past costs to the new line, for every period. The Ledger screen works the same way: it also ignores the category name stored on each old ledger entry.

**To change the mapping**, edit `PNL_CATEGORY_MAP` in `src/lib/pnl.ts` (keys are lower-case names). Make the same change in the `CASE` near the top of `scripts/pnl/reconcile.sql` so the two stay in step. A new category added in the app goes to Other until it is added to the map.

## Not in profit

These are recorded in the period but kept out of revenue, costs and net profit. The page shows each total:

- **Opening balances**: the set-up entry for the ledger. It is a starting balance, not earnings.
- **Owner withdrawals**: anything in the Owner Withdrawal category. It is drawings, not a business cost.
- **Transfers**: a general-ledger vendor payment or miscellaneous entry whose description or notes contain the whole word **transfer** (any capitals, so "Bank Transfer" counts and "Transferred" does not). The report shows only how many there were and how much went in and out. It never returns the descriptions, because they can name people. A real expense whose description happens to say "paid by bank transfer" is also left out, so word such entries without "transfer" if they should count.
- **Vendor payments replaced by bills** (accrual only): see Accrual basis.

## Double-count rules

Each of these is locked by a test in `src/lib/pnl.test.ts`:

1. A customer's money is counted once. Advances (`orders.advance_paid`) and later payments (`payments`) are separate records and both count in cash basis. The general ledger's `order_payment` entries are a copy of those same two records, so the report never reads them. (On the local books that copy is empty while advances and payments are not, so reading it would also give the wrong answer.)
2. A delivered order counts its total in accrual and its advance plus payments in cash, never both in either.
3. Recording a vendor payment also writes a mirror line in that vendor's own ledger. The report ignores those mirror lines in both bases, so a payment of 40,000 is 40,000, not 80,000.
4. In accrual, a vendor's bills count, and its payment credits are left out only up to its bill credits in the same period (and the same month, on the monthly chart). Payment credits above the bills, and every payment debit, still count. The part left out is reported separately and not added to profit. In cash, the payments count and the bills do not. A bill for one vendor never covers another vendor's payment, and one business's bill never covers another business's payment, even in the combined view.
5. A vendor payment with no bill counts in both bases; in accrual the report says it is dated on the day it was paid.
6. Opening balances and Owner Withdrawal never reach revenue, costs or net profit.
7. Each business's rows are kept separate; the combined view is the sum of exactly the businesses you belong to.
8. Period edges: a payment on the last day of the month is in; the next day is out. Presets use the Karachi date.
9. Transfers are excluded.
10. Category mapping, including unknown names going to Other and being listed.

Run them with:

```
node --import tsx --test src/lib/pnl.test.ts
```

## Known limits

The page lists, under "Read this with the figures", only the ones that apply to the result on screen:

- **No refund table.** The books have no refund, credit-note or returns table, so nothing is ever subtracted for a refund. In cash basis an advance on an order later cancelled stays in revenue. (Always shown.)
- **Payment-dated vendor costs** (accrual). A vendor cost with no bill is dated on the day it was paid, which may be a different month from when the work was done.
- **Suppressed payments** (accrual). Payment credits to a vendor are left out up to that vendor's bill credits in the period. If a bill was entered for one job and a payment was for a different job with no bill, the payment is still covered by the first bill, so that part of the cost is missing from the accrual figure.
- **Months do not add up** (accrual). Shown when a bill and a payment for the same vendor fall in different months: each month counts its own, the period total counts them once.
- **Miscellaneous dated on entry date** (accrual). Miscellaneous entries are dated on the day they were entered in the ledger.

Also worth knowing:

- Costs follow each vendor's **current** category, so reclassifying a vendor changes past reports.
- A bill and a payment are not linked. The report covers payment credits only up to the bill credits in the same period. It does not decide which payment belongs to which bill. A bill in March paid in April shows the bill in March (accrual) and the payment in April (cash). In an accrual report covering only April, that payment is counted, dated when paid, because the vendor has no bill in April.
- Cost of sales is whatever is in the Purchases category. The books have no stock records, so materials bought for orders not yet delivered are still a cost in the month they are billed or paid.

## Reconciling outside the app

`scripts/pnl/reconcile.sql` applies the same rules in SQL and prints, for both bases, the statement lines, the net profit of each month, and the excluded totals. It only reads: it runs inside a `READ ONLY` transaction and has no inserts, updates, deletes or DDL.

```
psql "$DATABASE_URL" -v start=2026-05-01 -v end=2026-05-31 -f scripts/pnl/reconcile.sql
psql "$DATABASE_URL" -v start=2026-01-01 -v end=2026-12-31 -v business=<business uuid> -f scripts/pnl/reconcile.sql
```

Leave out `business` (or pass it empty) to add up every business. Amounts are PKR; the API returns the same figures as integer cents.

### What was checked, and what was not

The rules were written against the app's code and the schema of the **local Docker** database (`supabase_db_ar-studio-app`). On those local books every vendor-ledger line is a mirror of a payment, there are no unlinked bills, and the ledger's `order_payment` copy is empty while advances and payments are not. `scripts/pnl/reconcile.sql` for 2026-01-01 to 2026-12-31, with no business filter, returns these local fixture figures (PKR):

| | Cash | Accrual |
|---|---:|---:|
| Revenue | 7,747,000 | 17,724,000 |
| Cost of sales, staff, overheads | 0 | 0 |
| Other expenses | 432,500 | 432,500 |
| Other income | 345,000 | 345,000 |
| Net profit | 7,659,500 | 17,636,500 |

Opening balances of 991,000 are excluded in both. The accrual year totals are the ones on the local Profit & Loss screen for Ahsan Tariq Couture (the only local business with orders). They are fixture figures, not staging and not the live books. The screen, at desktop width and at 375px, is in `docs/pnl/screenshots/`.

**Staging** is the project named AR studio dummy database (`ohgqgkraybpvnfdbgmvl`). At the start of this check it was already `ACTIVE_HEALTHY`: it had been resumed from a pause earlier, and it was not restored from a backup. Before any migration, every public table was copied into schema `baseline_pnl_20261107` (69 customers, 70 orders, 11 payments, 86 general-ledger rows, 13 vendor-ledger rows, 3 vendors). The general-ledger money checksum was `6c2cdab67033405506cb8b961a5c05d0` and was the same after the migration, so debit, credit and balance did not move.

Reviewed migrations applied, in one transaction, after a rolled-back rehearsal: `20260827000300` (Uncategorized), `20261024000000` (close client writes to roles and the ledger), `20261024000100` and `20261024000200` (ledger MCP tables and the audience hook, which is not turned on), and `20261106000000` (two businesses). `20261101000000` was not applied again: staging already had the running-balance triggers and a consistent series (0 mismatches), and Change 4 replaces that function with the per-business one. Existing rows were backfilled to Ahsan Tariq Couture. Techlink Co started empty. The one admin belongs to both. Neither staff user belongs to Techlink.

Cash revenue for 2026 is advances 502,000 plus later payments 20,000. Accrual revenue is one Delivered order of 400,000.

Cash staff of −30,000 on the 2026 staging book is `20,000 credit − 50,000 debit` on Employees vendor payments dated 2026-08-17 and 2026-08-18. Negative staff raises net profit above revenue by that amount. The books do not say why the debit was entered, so the report does not call it a refund.

Accrual staff is also −30,000: the unlinked Employees bill of 20,000 (2026-08-17), plus payment credits of 20,000 less the 20,000 the bill covers, minus the payment debit of 50,000. The 20,000 covered is reported as **Vendor payments replaced by bills**. The 50,000 debit is not covered by the bill, so it stays in, dated 2026-08-18, and payment-dated vendor costs are −50,000. Under the old rule the bill replaced every payment, which dropped that debit and gave accrual staff 20,000 and accrual net 380,000.

Every one of those rows is in August 2026, so the August column equals the year. The later payment of 20,000 is dated 2026-08-26, so it is inside August and outside September (September payments are 0). November 2026, which is "This Month" in Asia/Karachi on 2026-11-07, has 0 orders, 0 payments, 0 delivered revenue and 0 ledger rows. 2026 Q4 delivered revenue is 0.

Staging `order_payment` debits for 2026 are 522,001, one rupee above cash receipts, from one `order_payment` debit of 1 with no matching advance or payment. All-time cash receipts are advances 10,656,000 plus payments 904,000 = 11,560,000, against `order_payment` debits of 11,560,001. Those mirror rows are not added.

The same function the API uses, run on every staging row for 2025-01-01 to 2026-12-31, and an independent SQL query for the 2026 cost lines, agree. Techlink is zero in both bases, and the combined view equals Ahsan Tariq Couture, so nothing crosses between them.

| 2026-01-01 to 2026-12-31, ATC | Cash | Accrual |
|---|---:|---:|
| Revenue | 522,000 | 400,000 |
| Staff | −30,000 | −30,000 |
| Net profit | 552,000 | 430,000 |
| Payment credits replaced by bills | 0 | 20,000 |
| Payment-dated vendor costs | 0 | −50,000 |

August 2026 equals that year. November 2026 and 2026 Q4 are zero in both bases. Techlink over the same year is zero.

All-time on ATC (the whole staging book):

| | Cash | Accrual |
|---|---:|---:|
| Revenue | 11,560,000 | 4,168,000 |
| Staff | −20,000 | 0 |
| Other expenses | 225,000 | 225,000 |
| Other income | 20,100 | 20,100 |
| Net profit | 11,375,100 | 3,963,100 |

Accrual suppresses 130,000 of payment credits and keeps 75,000 as payment-dated. Delivered revenue is 19 orders. In Process totals of 12,167,000 are excluded from accrual. There are no opening-balance rows, no transfer rows, no cancelled orders, and no refund table. The two vendors that had no category are now Uncategorized, which maps to Other.

The staging screen was opened in a browser whose client bundle and network calls used only `ohgqgkraybpvnfdbgmvl.supabase.co`. A disposable admin, `pnl-disposable-admin-20261107@arstudio.test`, was created with `generateLink` type `invite` (the link was not emailed) and given Ahsan Tariq Couture and Techlink Co only. After the screenshots it was deleted: it had no payment, proposal, or audit rows. Auth users are back to the three that were already there. Those screenshots are in `docs/pnl/screenshots/staging/`. The earlier files in `docs/pnl/screenshots/` remain local Docker fixtures.

On that staging screen, This Year for Ahsan Tariq Couture shows cash revenue PKR 522,000, staff PKR -30,000, net profit PKR 552,000, and accrual revenue PKR 400,000, staff PKR -30,000, net profit PKR 430,000. This Month and This Quarter are zero. Techlink This Year is zero in both bases. All businesses matches Ahsan Tariq Couture, because Techlink has no rows. A custom range from 1 Jan 2026 through 31 Aug 2026 matches This Year, because every 2026 row is in August. The same figures appear at 375px.

`npm run lint` exits 0. The previous 33 errors and 65 warnings were removed without changing the lint rules. Staff are still refused by the existing test in `e2e/workflows.spec.ts`, which expects `GET /api/pnl` to answer 403. No second staging identity was created for that check.

The amount rule in `scripts/pnl/reconcile.sql` was checked against a throwaway Postgres with the test fixtures (the staging shape, the March bill and April payment, and a partial settlement); its statement, monthly and excluded figures match `src/lib/pnl.ts`.
