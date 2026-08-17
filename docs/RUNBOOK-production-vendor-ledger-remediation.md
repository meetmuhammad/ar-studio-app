# Runbook — production `vendor_ledger` balance remediation

**Status: NOT EXECUTED. Awaiting explicit production approval.**

Companion to [RUNBOOK-production-general-ledger-remediation.md](./RUNBOOK-production-general-ledger-remediation.md).
Same defect class, different table, one structural difference that changes every query below:
**`vendor_ledger` holds an independent running balance per vendor.** Every diagnostic and every
recalculation is scoped by `vendor_id`. A single global chain would be wrong.

Nothing here has been run against production. No production credentials were used to write it.

| | |
|---|---|
| **Production target** | `drdnqsjjxmqiklwfadmk` — AR studio, real business records |
| Staging (already done) | `ohgqgkraybpvnfdbgmvl` |
| Migration | `supabase/migrations/20260817160000_vendor_ledger_balance_integrity.sql` |
| Independent verifier | `scripts/verify-vendor-ledger.mjs` |

**Staging outcome, for reference.** Staging was already corrupt, not merely at risk: 7 of 7
links broken across 3 vendors, 6 mismatches. After: **0**, with per-vendor stored finals
matching an independent recomputation exactly.

---

## A. Pre-flight

1. State the target aloud: `TARGET DATABASE: PRODUCTION - drdnqsjjxmqiklwfadmk`.
2. **Fresh backup/snapshot**, taken after the last business write. Record its identifier and
   timestamp. §C rewrites every `vendor_ledger.balance` on real supplier records.
3. **Apply the `general_ledger` remediation first.** `20260817140000` is a practical
   prerequisite: vendor sub-ledger rows are written by a trigger firing on `general_ledger`
   inserts, so repairing the vendor chain while the parent chain is still broken fixes the
   downstream table under an upstream that is still producing bad rows.
4. **Confirm `sync-payments` is gone** (see the general ledger runbook §A.3). It rebuilds
   `order_payment` rows wholesale, which re-fires the vendor sub-ledger trigger.
5. **Capture rollback material** before applying — §F.1.

---

## B. Read-only before-state diagnostic

**No writes.**

### B.1 Per-vendor report

```sql
with ord as (
  select vl.vendor_id,
         vl.id,
         vl.balance,
         coalesce(vl.debit,0) - coalesce(vl.credit,0) as delta,
         lag(vl.balance) over w  as prev_bal,
         row_number()   over w   as rn,
         count(*)       over (partition by vl.vendor_id) as n,
         sum(coalesce(vl.debit,0) - coalesce(vl.credit,0)) over (
           partition by vl.vendor_id
           order by vl.entry_date, vl.created_at, vl.id
           rows between unbounded preceding and current row
         ) as expected
    from public.vendor_ledger vl
  window w as (partition by vl.vendor_id
               order by vl.entry_date, vl.created_at, vl.id)
)
select vendor_id,
       max(n)                                                        as rows,
       min(balance) filter (where rn = 1)                            as first_balance,
       min(balance) filter (where rn = n)                            as final_stored,
       sum(delta)                                                    as final_computed,
       count(*) filter (where prev_bal is not null
                          and balance - prev_bal - delta <> 0)       as broken_links,
       count(*) filter (where rn = 1 and balance <> delta)           as bad_first_row,
       count(*) filter (where balance is distinct from expected)     as mismatches
  from ord
 group by vendor_id
 order by mismatches desc, vendor_id;
```

`bad_first_row` matters here in a way it does not for a single-chain table: `lag()` cannot see
the first row of a partition, so with N vendors there are N first rows a link-only check would
never inspect.

### B.2 Independent recomputation

```
ALLOW_MISMATCH=1 node scripts/verify-vendor-ledger.mjs
```

Groups by vendor, sorts in JS by `(entry_date, created_at, id)`, accumulates in integer paisa.
If B.1 and B.2 disagree, stop — one is wrong and you do not yet know which.

### B.3 Record before executing §C

| Metric | Value |
|---|---|
| total `vendor_ledger` rows | _____ |
| vendors present | _____ |
| vendors affected (mismatches > 0) | _____ |
| **per vendor:** mismatch count | _____ |
| **per vendor:** stored final balance | _____ |
| **per vendor:** independently computed final | _____ |
| aggregate mismatch count | _____ |

Per-vendor figures are required, not the aggregate alone: one healthy vendor can mask another's
broken chain in a total.

---

## C. Migration / fix

Apply `20260817160000_vendor_ledger_balance_integrity.sql`.

**Changes only** the derived `balance` column and the trigger/function machinery. Installs
per-vendor total ordering `(entry_date, created_at, id)` partitioned by `vendor_id`,
statement-level AFTER INSERT/UPDATE/DELETE triggers anchored at each affected vendor's own
minimum position, a transaction-local re-entrancy guard, and a one-time backfill.

**Must NOT modify:** `debit`, `credit`, `entry_date`, `vendor_id`, `general_ledger_id`,
`particulars`, or any historical amount. Verify with the equivalent of the general ledger
runbook's `amounts_changed` assertion, extended to include `vendor_id` — a row silently
changing vendor would move money between suppliers.

The UPDATE trigger deliberately fires on `vendor_id` change as well as the amount and ordering
columns, because moving a row between vendors invalidates **both** chains.

Ends with a `DO` block that raises on broken links **or** bad first rows, aborting the
transaction rather than committing a half-fixed ledger.

---

## D. Lock / downtime assessment

Same statement classes as the general ledger migration:

| Statement | Lock | Blocks |
|---|---|---|
| `update … set created_at = now() where created_at is null` | ROW EXCLUSIVE | nothing |
| **`alter table … alter column created_at set not null`** | **ACCESS EXCLUSIVE** | **reads and writes**, full scan |
| **`create index idx_vendor_ledger_chrono`** | **SHARE** | **writes** |
| `drop`/`create trigger` | ACCESS EXCLUSIVE | brief, catalog-only |
| backfill `rebuild_vendor_ledger_balances()` | ROW EXCLUSIVE | row locks on every row |

The index leads with `vendor_id`, since every scan is vendor-scoped first and ordered second.

**Expected duration: shorter than the general ledger.** Staging holds 10 rows; the local
650-row/4-vendor set rebuilt in single-digit milliseconds. Substitute the real count from §B.3
and re-time against a restored snapshot if production is materially larger.

**Separable to reduce risk**, identically to the general ledger runbook: `CREATE INDEX
CONCURRENTLY` in its own migration (cannot run in a transaction), and `SET NOT NULL` via a
`NOT VALID` check constraint validated first. `created_at` must still end up `NOT NULL` — a
NULL member makes the row comparison return NULL rather than true/false, silently breaking the
ordering the fix depends on.

Set a short `lock_timeout` so the migration fails fast rather than queueing traffic behind it.

---

## E. Post-fix verification

1. Re-run **B.1** and **B.2**.
2. **Mismatch count must be `0` for every vendor** — not zero in aggregate, zero per vendor.
3. Each vendor's stored final balance must equal its independently computed final.
4. No amounts moved: the `amounts_changed` assertion returns `0`.
5. Record before/after per vendor:

   | Vendor | Rows | Mismatches before | Mismatches after | Final stored | Final computed |
   |---|---|---|---|---|---|
   | _____ | _____ | _____ | **0** | _____ | _____ |

6. Smoke-test: insert a back-dated entry for one vendor through the app, confirm that vendor's
   tail updates and **no other vendor's rows move**, then delete it and confirm the table
   returns to its exact prior state. On staging this showed 4 rows shifted for the target
   vendor, 0 shifted wrongly, 0 other-vendor rows moved, and a table checksum identical to the
   pre-test snapshot after cleanup.

---

## F. Rollback

1. **Prepare before applying.** Capture the prior function and trigger definitions
   (`pg_get_functiondef`, `pg_get_triggerdef` for `create_vendor_sub_ledger_entry` and any
   `vendor_ledger` triggers), and snapshot the balances:

   ```sql
   create table vendor_ledger_pre_remediation as select * from public.vendor_ledger;
   ```

   This is both the rollback source and the §C comparison copy.

2. **Fails mid-flight** — no action. Single transaction, self-aborting on a broken chain.

3. **Commits but §E fails.** Restore balances from the copy, then restore the prior
   trigger/function definitions:

   ```sql
   update public.vendor_ledger vl
      set balance = old.balance
     from vendor_ledger_pre_remediation old
    where vl.id = old.id and vl.balance is distinct from old.balance;
   ```

   As with the general ledger: this restores the **previous wrong** balances. It is a return to
   a known state, not a repair.

4. **Anything worse.** Restore the §A.2 snapshot. Do not attempt a logical repair.

5. **Application rollback is independent** — with one ordering constraint. The route change
   stops computing a balance in JavaScript and relies on the `BEFORE INSERT` trigger instead, so
   deploying it *before* the migration would insert `balance: 0` with nothing to correct it.
   Migration first, or both together; never code first.

   Note the default branch deploys to production in roughly seventy seconds, so a merge lands
   the code change almost immediately. Sequence the merge accordingly.

---

## Still pending approval

- Applying anything here to `drdnqsjjxmqiklwfadmk`.
- Whether to split the index and `NOT NULL` statements into a follow-up migration.
- The `vendor_ledger` foreign key change — see [AUDIT-financial-delete-paths.md](./AUDIT-financial-delete-paths.md).
  Note that audit's finding: the FK change alone would not prevent history loss, because the
  ledger delete route removes sub-ledger rows in application code first.
