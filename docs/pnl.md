# Profit & Loss

The **Profit & Loss** page (`/pnl`, sidebar item under More on a phone) shows, for the business you have selected, what came in, what went out, and the profit in between, for a period you choose. It is admin-only, like the Dashboard and the Ledger. Staff are sent to Customers, and the API (`GET /api/pnl`) answers a staff token with 403.

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
- **Vendor costs** are worked out vendor by vendor:
  - If the vendor has **any bill** in the period (a vendor-ledger entry made with "Add Bill", i.e. one not linked to a general-ledger payment, with a non-zero amount), the report counts **only those bills**. That vendor's payments in the same period are **not** counted as well. The total of payments left out this way is shown as **Vendor payments replaced by bills**, and it is never added into profit.
  - Otherwise the report counts that vendor's **payments** in the period. They are dated on the day they were paid, because the books have no bill to date them by, and the report says so under "Read this with the figures".
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
4. In accrual, a vendor with a bill in the period counts the bill and not the payment; the payment is reported separately and not added to profit. In cash, the payment counts and the bill does not.
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
- **Suppressed payments** (accrual). Payments to a vendor that has bills in the period are left out; if a bill was never entered for some of that work, that part of the cost is missing from the accrual figure.
- **Miscellaneous dated on entry date** (accrual). Miscellaneous entries are dated on the day they were entered in the ledger.

Also worth knowing:

- Costs follow each vendor's **current** category, so reclassifying a vendor changes past reports.
- A bill and a payment are matched by **vendor and period**, not one to one. A bill in March paid in April shows the bill in March (accrual) and the payment in April (cash). In an accrual report covering only April, that payment is counted, dated when paid, because the vendor has no bill in April.
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

**Staging** is the project named AR studio dummy database (`ohgqgkraybpvnfdbgmvl`). It was read, not written. It has no `public.businesses` table and no `business_id` columns. Its migration history stops at `20260818110000`, so `20261106000000_multi_business_techlink` is not applied. `scripts/pnl/reconcile.sql` cannot run there, because it filters `business_id`. Per-business and combined-versus-single were therefore not executed on staging. That migration was not applied as part of this report.

Independent SQL using the same formulas, on that single staging book, for 2026-01-01 to 2026-12-31 (PKR):

| | Cash | Accrual |
|---|---:|---:|
| Revenue | 522,000 | 400,000 |
| Staff | −30,000 | 20,000 |
| Net profit | 552,000 | 380,000 |

Cash revenue is advances 502,000 plus later payments 20,000. Accrual revenue is one Delivered order of 400,000. Accrual staff is the unlinked bill of 20,000; the same vendor's payments net to −30,000 and are reported as suppressed, not added. Payment-dated vendor costs are 0. Every one of those rows is in August 2026. The later payment of 20,000 is dated 2026-08-26, so it is inside August and outside September (September payments are 0). November 2026, which is "This Month" in Asia/Karachi on 2026-11-07, has 0 orders, 0 payments, 0 delivered revenue and 0 ledger rows. 2026 Q4 delivered revenue is 0.

Staging `order_payment` debits for 2026 are 522,001, one rupee above cash receipts, from one `order_payment` debit of 1 with no matching advance or payment. All-time cash receipts are advances 10,656,000 plus payments 904,000 = 11,560,000, against `order_payment` debits of 11,560,001. Those mirror rows are not added.

All-time staging accrual revenue (Delivered) is 4,168,000 from 19 orders. In Process totals of 12,167,000 are excluded from accrual. Unlinked bills are 150,000 (staff 50,000, other 100,000). Cash vendor-payment net is staff −20,000 and other 225,000. Accrual suppresses staff −20,000 and other 100,000 of those payments, because those vendors have bills, and keeps other 125,000 as payment-dated. Miscellaneous debits are 20,100 of other income. There are no opening-balance rows, no transfer rows, no cancelled orders, and no refund table. Two of three vendors have no category. The Uncategorized category row is not on staging. A missing category maps to Other.

The Profit & Loss screen was opened against the local Docker database, not against staging. Staging has no `business_id`, so the page's API cannot query it until the multi-business migration is applied.
