# Schema history

Before this project adopted migrations, schema changes were applied to the production
database by hand through the Supabase SQL Editor. This file is the audit trail of what
was done. The scripts themselves have been deleted — keeping runnable copies of DDL that
was already applied is a foot-gun, and their effects are fully captured in
`supabase/migrations/20251125000000_initial_schema.sql`, the baseline snapshot of
production's schema taken when migrations were adopted (2026-08-15).

## What was applied by hand

| Script | What it did | Applied to production |
|---|---|---|
| `add-payment-fields.sql` | Added `total_amount`, `advance_paid`, `balance`, `payment_method` to `orders`; backfilled `delivery_date` from `booking_date`; set `delivery_date` `NOT NULL`; added the `check_advance_not_exceed_total` constraint | Yes, by hand, date unknown |
| `performance-indexes.sql` | 16 indexes across `orders`, `general_ledger`, `payments`, `measurements`, `vendor_ledger`, `customers`, `order_items` | Yes, by hand, date unknown |

Every column, constraint, and index listed above was verified present in the baseline
migration before the scripts were deleted.

## Why `add-payment-fields.sql` is worth remembering

It is a compact example of the failure mode the migration pipeline exists to prevent. In
one script it:

1. added four columns,
2. backfilled `delivery_date` with an `UPDATE`,
3. then flipped `delivery_date` to `NOT NULL`.

Expand, backfill, and contract in a single statement block, executed against a live
database while staff were using the app. There is no ordering of the application deploy
that makes this safe: either the running code writes rows the new constraint rejects, or
it reads columns that do not yet exist.

The replacement rule: **every migration must be safe to apply while the currently
deployed code is still running.** Destructive changes split across three deploys —
expand, backfill, contract.

## How schema changes work now

```bash
npx supabase migration new <name>   # creates a timestamped file
# edit it
npx supabase db reset               # replays everything from zero, locally
```

Then open a PR. CI replays all migrations against a throwaway Postgres. Merging to
`staging` applies them to the staging project. Merging to `main` applies them to
production, behind a manual approval gate.

`supabase/migrations/` is the only path that reaches a hosted database. Loose `.sql`
files elsewhere in the repo are not applied by any workflow, and CI fails if one is
added — see the "No loose SQL outside migrations" step in `.github/workflows/ci.yml`.

The Supabase SQL Editor is not part of this flow. The one exception is a declared
incident; the break-glass rule requires reconciling any manual change into a migration
within 24 hours, and the nightly `supabase db diff --linked` job
(`.github/workflows/schema-drift.yml`) fails until that happens.
