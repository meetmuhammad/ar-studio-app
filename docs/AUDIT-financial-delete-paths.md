# Audit — paths that delete financial history

**Status: audit and proposal only. No foreign key has been changed. Nothing applied to production.**

Prerequisite to moving `vendor_ledger.general_ledger_id` away from `ON DELETE CASCADE`.
The headline finding is that **changing that one foreign key would not achieve the goal**,
because the application deletes the child rows itself before the database is ever asked to.

Constraints below were read from the live schema (`information_schema`), not inferred.

---

## 1. Foreign keys touching financial data

| Foreign key | References | On delete | Effect |
|---|---|---|---|
| `vendor_ledger.general_ledger_id` | `general_ledger.id` | **CASCADE** | Sub-ledger row erased with its parent |
| `vendor_ledger.vendor_id` | `vendors.id` | **CASCADE** | Vendor's entire sub-ledger erased with the vendor |
| `vendor_tags.vendor_id` | `vendors.id` | CASCADE | Tags erased with the vendor |
| `payments.order_id` | `orders.id` | **CASCADE** | Payment records erased with the order |
| `payments.customer_id` | `customers.id` | **CASCADE** | Payment records erased with the customer |
| `general_ledger.order_id` | `orders.id` | SET NULL | Entry survives, loses its order attribution |
| `general_ledger.vendor_id` | `vendors.id` | SET NULL | Entry survives, loses its vendor attribution |
| `general_ledger.tag_id` | `vendor_tags.id` | SET NULL | Entry survives, loses its tag |

Five of eight destroy or detach financial history silently. None raises an error.

---

## 2. What each delete path actually does today

### `DELETE /api/general-ledger/[id]` — admin

Deletes matching `vendor_ledger` rows **explicitly, in application code**, before deleting
the ledger entry. If that first delete fails it logs and **continues anyway**, deleting the
parent and letting the CASCADE finish the job.

> **This is why the FK change alone is insufficient.** Switching the constraint to `RESTRICT`
> would not stop this route: it removes the children first, so by the time the parent delete
> runs there is nothing left to restrict. The route would keep working and keep erasing
> history, and the constraint would look like protection while providing none.

The balance chain itself is now repaired correctly on delete by the statement-level trigger,
so what is lost is the row, not the arithmetic.

### `DELETE /api/vendors/[id]` — admin

No guard whatsoever. Deleting a vendor cascades away **the vendor's entire sub-ledger** and
all its tags, and nulls the vendor attribution on every `general_ledger` entry that referenced
it. A vendor with years of settlement history can be removed with one call, leaving ledger
entries that describe payments to nobody. This is the most destructive path in the system.

### `DELETE /api/orders/[id]` — **staff-reachable**

No guard. Cascades away every `payments` row for the order and nulls `general_ledger.order_id`.
So a staff member can destroy payment records, and the surviving ledger entries name an order
that no longer exists. `withAuth`, not `withAdmin` — the least-privileged role can do the
second-most destructive thing here.

### `DELETE /api/customers/[id]` — **staff-reachable**

The one path with a guard: refuses with `400` if the customer has any orders. That guard is
also what prevents the `payments.customer_id` cascade in practice, since payments belong to
orders. Protection by side effect rather than by intent, but it holds.

### `DELETE /api/payments/[id]` — admin

Deletes the payment row only. The corresponding `general_ledger` entry is left behind, because
no `payment_id` link exists to find it by. Previously observed: two `order_payment` entries for
one surviving payment. Out of scope here; noted because the linkage work will interact with it.

### `vendor_ledger` — no delete route

Rows are only ever removed as collateral of the paths above.

---

## 3. Proposal

Ordered by value per unit of risk. Steps 1–2 deliver most of the protection without touching
a constraint.

**1. Stop the application deleting children.** Remove the explicit `vendor_ledger` delete from
the ledger delete route. Until this lands, no constraint change can protect anything. Lowest
risk, highest value, and it is a prerequisite for step 3 rather than an alternative to it.

**2. Guard the two unguarded routes.** Refuse to delete a vendor that has sub-ledger history,
and an order that has payments or ledger entries, returning a `409` naming what blocks it —
the shape `deleteCustomer` already uses. Move order deletion to `withAdmin`: destroying payment
records is not a staff-level action, and the sibling decision already settled that payment
*creation* is admin-only.

**3. Then change the constraints.** With the application no longer deleting children, switch
`vendor_ledger.general_ledger_id` and `vendor_ledger.vendor_id` to `RESTRICT`. The database
becomes the backstop rather than the only line, and a route that regresses fails loudly.

**4. Corrections instead of deletions.** A ledger entry recorded in error is cancelled by a
reversing entry of equal magnitude and opposite sign, dated the correction date, referencing
the original. Both remain visible, the running balance is correct at every point in time, and
the audit trail shows what happened *and* what was corrected. This is the model the owner has
approved; deletion becomes reserved for same-session typos with no downstream effect.

**5. Payment/ledger linkage** stays out of scope. When it lands the new FK should be `RESTRICT`,
consistent with the above.

### Legitimate flows this would break — reported before, not after

- **Deleting a mistyped vendor created minutes ago.** Currently one call; would become a `409`
  if any ledger entry exists. Mitigation: the guard permits deletion when the vendor has no
  sub-ledger rows, which covers the genuine typo case.
- **Deleting a test or duplicate order.** Currently silent; would become a `409` once payments
  exist. An order with no payments and no ledger entries still deletes freely.
- **Bulk cleanup.** No such flow exists in the app today. `sync-payments`, the one bulk
  destructive path, is already removed.
- **Cascade-dependent tests.** Fixture teardown that relies on deleting a parent to clean up
  children would need explicit child cleanup. Affects the verification scripts, not production.

No currently-shipping user journey is blocked by steps 1–3. Every guard is a refusal with a
reason, never a silent no-op.

---

## 4. Not done

- No constraint altered, in any environment.
- No delete route changed. Steps 1–2 are proposals, not commits.
- Not applied to production. The FK migration, when written, needs its own runbook: altering a
  constraint takes a brief `ACCESS EXCLUSIVE` lock, and `RESTRICT` will start rejecting deletes
  that previously succeeded — a behavioural change that wants a deliberate window.
