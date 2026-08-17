# Runbook — production `general_ledger` balance remediation

**Status: NOT EXECUTED. Awaiting explicit production approval.**

This repairs the stale running-balance defect in `general_ledger` and installs the
permanent fix. The identical change is already applied and verified on staging.

Nothing in this document has been run against production. At the time of writing the
author had no production credentials, so even the read-only diagnostic in §B is
unexecuted — the numbers in it are placeholders to be filled by whoever runs it.

| | |
|---|---|
| **Production target** | `drdnqsjjxmqiklwfadmk` — AR studio, real business records |
| Staging (already done) | `ohgqgkraybpvnfdbgmvl` |
| Migration | `supabase/migrations/20260817140000_ledger_balance_integrity.sql` |
| Independent verifier | `scripts/verify-ledger.mjs` |

Staging result for reference — 79 rows, mismatches **79 → 0**, last stored balance
**−2,069,899 → 10,823,101**, matching true net exactly.

---

## A. Pre-flight

1. **Confirm the target.** State it aloud before connecting:
   `TARGET DATABASE: PRODUCTION - drdnqsjjxmqiklwfadmk`.
   Every other environment is out of scope for this runbook.

2. **Confirm a fresh backup/snapshot exists**, taken *after* the last business write and
   *before* step C. Record its identifier and timestamp here at execution time. Verify
   PITR is enabled and note the earliest restore point. Do not proceed without this —
   §C rewrites every `balance` value in the table.

3. **Confirm the destructive `sync-payments` route is gone from production.**
   `POST /api/general-ledger/sync-payments` deletes every `order_payment` ledger row and
   rebuilds them from `orders` + `payments`. One admin click after the backfill would
   destroy it, and it silently erases hand-entered `order_payment` entries as well.
   It is `withAdmin`, so any admin can fire it.

   It is **removed in this branch** but is **live in production until this branch ships**.
   Therefore deploy the application code *before* running §C:

   ```
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<production-host>/api/general-ledger/sync-payments
   ```

   Expect `405` (route absent, falls through to the guarded `[id]` route), matching a
   known-nonexistent sibling path. A `401` means the route still exists and is merely
   refusing an unauthenticated caller — **stop**.

4. **Order of operations.** Deploy code first, then migrate:

   | # | Action | Why this order |
   |---|---|---|
   | 1 | Snapshot | Nothing is recoverable before this |
   | 2 | Deploy application code | Closes `sync-payments` before any backfill exists to destroy |
   | 3 | §B read-only diagnostic | Measure the real damage before changing anything |
   | 4 | §C migration + backfill | The repair |
   | 5 | §E verification | Prove it |

   The code and the migration are independent — the migration is safe without the code
   and vice versa — so deploying first costs nothing and removes the one endpoint that
   can undo the repair.

5. **Capture rollback material before touching anything** — see §F.1. The migration drops
   the old functions, so their definitions must be saved first or they cannot be restored
   without the snapshot.

---

## B. Read-only before-state diagnostic

**No writes.** Both checks below are `SELECT`-only.

### B.1 In-database report

```sql
with ord as (
  select gl.id,
         gl.balance,
         coalesce(gl.debit,0) - coalesce(gl.credit,0) as delta,
         lag(gl.balance) over w as prev_bal,
         row_number() over w as rn,
         count(*) over () as n,
         sum(coalesce(gl.debit,0) - coalesce(gl.credit,0)) over (
           order by gl.entry_date, gl.created_at, gl.id
           rows between unbounded preceding and current row
         ) as expected
    from public.general_ledger gl
  window w as (order by gl.entry_date, gl.created_at, gl.id)
)
select json_build_object(
  'rows',          (select count(*) from public.general_ledger),
  'first_balance', (select balance from ord where rn = 1),
  'last_balance',  (select balance from ord where rn = n),
  'true_net',      (select coalesce(sum(coalesce(debit,0) - coalesce(credit,0)),0) from public.general_ledger),
  'broken_links',  (select count(*) from ord where prev_bal is not null and balance - prev_bal - delta <> 0),
  'total_links',   (select count(*) from ord where prev_bal is not null),
  'mismatches',    (select count(*) from ord where balance is distinct from expected)
) as report;
```

### B.2 Independent recomputation

```
ALLOW_MISMATCH=1 node scripts/verify-ledger.mjs
```

This deliberately does **not** use a SQL window function — it pulls every row over
PostgREST, sorts in JS by `(entry_date, created_at, id)` and accumulates in integer paisa.
If B.1 and B.2 disagree, stop and investigate: one of them is wrong, and you do not yet
know which.

### B.3 Record before executing §C

| Metric | Value |
|---|---|
| total `general_ledger` rows | _____ |
| mismatch count | _____ |
| stored first balance | _____ |
| stored final balance | _____ |
| independently recomputed final balance | _____ |
| true net (`sum(debit) − sum(credit)`) | _____ |

Also record `count(*) where created_at is null` — it drives the §D lock estimate.

Expect a worse ratio than staging's 48/78 broken links: production has real back-dated
entries and more rows.

---

## C. Migration / fix

Apply `supabase/migrations/20260817140000_ledger_balance_integrity.sql`.

**What it changes:** only the derived `balance` column, plus the trigger/function
machinery that maintains it. It installs deterministic total ordering
`(entry_date, created_at, id)`, statement-level AFTER INSERT/UPDATE/DELETE triggers with
transition tables, a transaction-local re-entrancy guard, and runs a one-time backfill.

**What it must NOT modify — verify none of these appear in the diff:**
`debit`, `credit`, `entry_date`, `particulars`, `order_id`, `vendor_id`, any `payments`
row, or any historical transaction amount. The migration only recomputes `balance` from
the `debit`/`credit` already stored; it never inserts or deletes a ledger row.

Guard assertion — run alongside §E and require `0`:

```sql
select count(*) as amounts_changed
  from public.general_ledger gl
  join <pre_migration_snapshot_copy> old using (id)
 where gl.debit      is distinct from old.debit
    or gl.credit     is distinct from old.credit
    or gl.entry_date is distinct from old.entry_date
    or gl.order_id   is distinct from old.order_id
    or gl.vendor_id  is distinct from old.vendor_id;
```

(Create the comparison copy in §F.1.)

The migration ends with a `DO` block that RAISES and aborts the transaction if any link
is still broken, so a failed repair rolls itself back rather than committing a half-fixed
ledger. Apply it inside a single transaction, with the exception noted in §D.

Do **not** use a bare `supabase db push` — production's migration history may not mirror
this branch. Apply this one migration, then record its version in
`supabase_migrations.schema_migrations` with `on conflict do nothing`.

---

## D. Lock / downtime assessment

| Statement | Lock | Blocks | Duration driver |
|---|---|---|---|
| `update … set created_at = now() where created_at is null` | ROW EXCLUSIVE | nothing (row locks only) | count of NULL rows (from §B.3) |
| **`alter table … alter column created_at set not null`** | **ACCESS EXCLUSIVE** | **reads AND writes** | **full table scan** |
| `alter column created_at set default now()` | ACCESS EXCLUSIVE | reads and writes | catalog-only, effectively instant |
| **`create index idx_general_ledger_chrono`** | **SHARE** | **writes** (reads OK) | full index build |
| `drop trigger` ×5 / `create trigger` ×3 | ACCESS EXCLUSIVE | reads and writes | catalog-only, brief |
| backfill `rebuild_general_ledger_balances()` | ROW EXCLUSIVE | nothing directly | rewrites every row; row locks + table bloat |
| `drop function` ×3 | ACCESS EXCLUSIVE on the function | callers | brief |

**The two that matter are `SET NOT NULL` and `CREATE INDEX`.** Everything else is either
catalog-only or takes row locks that concurrent readers tolerate.

**Estimated duration.** Locally, 2,660 rows rebuilt in well under a second; a full-row
UPDATE of 2,661 rows took 409 ms. This ledger is small — the app has produced roughly
1,500 ledger rows historically. At a few thousand rows the whole migration should be
**sub-second to a few seconds**. Do not treat that as a guarantee: substitute the real
row count from §B.3, and if production is materially larger than ~50k rows, re-time the
migration against a restored copy of the production snapshot before scheduling.

**Safest window.** Outside business hours. The blocking portion is brief at this table
size, but `ACCESS EXCLUSIVE` also has to *wait* for in-flight transactions to finish, and
while it waits it queues every subsequent query behind it. Set a short
`lock_timeout` (e.g. `SET lock_timeout = '5s'`) so the migration fails fast and retries
rather than stalling the application behind a lock queue.

**Statements separable into a later migration to reduce risk** — recommended if you want
the blocking portion near zero:

1. **`CREATE INDEX CONCURRENTLY`** in its own migration. It cannot run inside a
   transaction block, so it must be split out; it takes only SHARE UPDATE EXCLUSIVE and
   does not block writes. The index is a performance aid for the ordering key, not a
   correctness requirement — the fix is correct without it.

2. **`SET NOT NULL` via a validated CHECK constraint** (PostgreSQL 12+), which avoids the
   long `ACCESS EXCLUSIVE` scan:

   ```sql
   alter table public.general_ledger
     add constraint general_ledger_created_at_not_null
     check (created_at is not null) not valid;              -- brief lock, no scan
   alter table public.general_ledger
     validate constraint general_ledger_created_at_not_null; -- SHARE UPDATE EXCLUSIVE, no write block
   alter table public.general_ledger
     alter column created_at set not null;                   -- now skips the scan
   ```

   `created_at` **must** end up `NOT NULL`: a NULL member makes the row-wise comparison
   `(entry_date, created_at, id) < (…)` return NULL rather than true/false, which silently
   breaks the ordering the whole fix depends on. Deferring is acceptable; skipping is not.

---

## E. Post-fix verification

Run immediately after §C, in the same maintenance window.

1. Re-run **B.1** and **B.2**.
2. **`mismatches` must be `0`.** Any other value → roll back per §F.
3. **stored final balance must equal true net.**
4. Confirm no transaction amounts moved — the `amounts_changed` query in §C must return `0`.
5. Record before/after side by side:

   | Metric | Before | After |
   |---|---|---|
   | rows | _____ | _____ |
   | mismatches | _____ | **0** |
   | first stored balance | _____ | _____ |
   | final stored balance | _____ | _____ |
   | independently recomputed final | _____ | _____ |
   | true net | _____ | _____ (unchanged) |

   `true net` must be **identical** before and after. It is derived purely from `debit`
   and `credit`, which this migration does not touch — if it moved, transaction data
   changed and you must roll back immediately.

6. Smoke-test the live behaviour: create a back-dated ledger entry through the app, confirm
   the whole tail updates and `mismatches` stays `0`, then delete it and confirm the ledger
   returns to its exact prior values. On staging this produced 80 rows / 0 mismatches with
   the last balance moving by exactly the inserted amount, then a bit-for-bit restore to
   79 rows on delete.

---

## F. Rollback

1. **Prepare before applying** (§A.5). Capture, and store outside the database:

   ```sql
   select pg_get_functiondef(oid) from pg_proc
    where proname in ('calculate_general_ledger_balance',
                      'recalculate_balances_after_date',
                      'recalc_balance_after_update',
                      'recalc_balance_after_delete');
   select tgname, pg_get_triggerdef(oid) from pg_trigger
    where tgrelid = 'public.general_ledger'::regclass and not tgisinternal;
   create table general_ledger_pre_remediation as select * from public.general_ledger;
   ```

   That last table is both the rollback source and the §C comparison copy. Drop it only
   after §E passes and a settling period has elapsed.

2. **Migration fails mid-flight** — no action. It runs in one transaction and its closing
   `DO` block aborts on a broken chain, so the database is left untouched.

3. **Migration commits but §E fails.** Restore balances from the copy:

   ```sql
   update public.general_ledger gl
      set balance = old.balance
     from general_ledger_pre_remediation old
    where gl.id = old.id and gl.balance is distinct from old.balance;
   ```

   Then restore the prior triggers/functions from the definitions captured in F.1.
   **Be clear about what this achieves:** it restores the *previous, wrong* balances. It is
   a return to a known state, not a repair. Only do it if the new state is worse than the
   old one — and note the old state on staging had 100% of rows wrong.

4. **Anything worse — data loss, unexpected amount changes, corruption.** Do not attempt a
   logical repair. Restore the §A.2 snapshot / PITR to the timestamp immediately before
   step 4 of the §A.4 order. This is the reason the snapshot is mandatory.

5. **Application rollback is independent.** Redeploying the previous build restores
   `sync-payments`. Do **not** do that after a successful backfill: one admin click on that
   endpoint deletes and rebuilds every `order_payment` row and would undo the repair.

---

## Still pending approval

- Applying anything in this runbook to `drdnqsjjxmqiklwfadmk`.
- Whether to split `CREATE INDEX CONCURRENTLY` and the `SET NOT NULL` path (§D) into a
  follow-up migration.
- `vendor_ledger` carries the same class of defect and is **not** covered here.
- Physically dropping the retired `orders.balance` column — logical retirement only for now.
