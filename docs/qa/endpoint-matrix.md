# Endpoint and MCP regression matrix

Scope: every route handler under `src/app/api/**` and `src/app/.well-known/**` on branch `feat/mobile-first-pwa`
(47 method+path pairs). Written by `scripts/qa/api-matrix.check.ts` (real HTTP) plus the existing regression suites.
Nothing here was run against staging or production.

## How it was tested

| | |
|---|---|
| Target database | **LOCAL** `http://127.0.0.1:54321` (`assertWritableDb` + URL check in the script; it refuses anything else) |
| API under test | shared local dev server `http://localhost:3100` (`LEDGER_MCP_ENABLED=true`, `LEDGER_MCP_PUBLIC_URL=http://localhost:3100`, `LEDGER_MCP_ALLOWED_CLIENT_IDS=local-test-client`, `BUSINESS_TIMEZONE=Asia/Karachi`) |
| Identities | real local users via `signInWithPassword`: `qa-admin@arstudio.test` (admin), `qa-staff@arstudio.test` (staff), `qa-norole@arstudio.test` (auth user with no `public.users` row). The service role is used only for baseline, observation and cleanup, never to stand in for a user. |
| Test data | tagged `QA-API <run id>`, dated **2099** so it sorts after every real ledger row and cannot change an existing running balance. The script refuses to start if real rows already exist in 2099. |
| Cleanup | runs in a `finally` block. Verified at the end: row counts for 10 tables **and** a hash of every pre-existing row's identifying and financial columns equal the pre-test baseline. |
| Not run on purpose | `POST /api/general-ledger/sync-payments` as an authorized user: it deletes and rebuilds every `order_payment` ledger row, i.e. existing records. Only its 401/403 rejections are tested. |

Command: `npx tsx --env-file=.env.local scripts/qa/api-matrix.check.ts` (optional `QA_BASE=http://localhost:3100`).
Result of the last run: **185/186 checks passed, 39 findings, cleanup verified (baseline == final)**.
Raw per-check results: `docs/qa/api-matrix-results.json`.

Mocked vs real: the matrix is **real HTTP integration** (fetch to a running Next server, real Supabase Auth tokens, real database,
real triggers). The table in section 4 separates it from the existing suites, some of which are unit tests or run handlers in-process.

## 1. Legend

Cells: `PASS` = checks in that category ran and passed; `FAIL` = at least one failed; `OPEN` = for routes with no auth guard,
a request with **no token succeeded** (that is the evidence the route is open, not a pass); `N/A (open)` = the route ignores tokens;
`–` = no check in that category (see section 3 for what that leaves untested). Status `PASS` means every executed check on that
endpoint passed; it does not mean every category was covered. Business-invariant checks are in "persistence / invariants".

## 2. Matrix

Auth column = what the code actually enforces (read from each handler), not what the UI hides.

| Endpoint | Module | Auth enforced by code | unauth | staff | admin | no-role row | invalid input | missing record | persistence / invariants | Status | Note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `GET /.well-known/oauth-protected-resource/api/mcp` | MCP | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | – | PASS | public discovery document; 404 unless LEDGER_MCP_ENABLED=true |
| `GET /api/mcp` | MCP | OAuth bearer (ledger MCP) | PASS | – | – | – | – | – | – | PASS |  |
| `POST /api/mcp` | MCP | OAuth bearer (ledger MCP) | PASS | PASS | PASS | – | – | – | – | PASS |  |
| `DELETE /api/mcp` | MCP | OAuth bearer (ledger MCP) | PASS | – | – | – | – | – | – | PASS |  |
| `GET /api/customers` | Customers | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | – | PASS | 2 finding(s) |
| `POST /api/customers` | Customers | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | PASS | PASS | 2 finding(s) |
| `GET /api/customers/[id]` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | – | PASS | 2 finding(s) |
| `PATCH /api/customers/[id]` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | PASS | PASS | 2 finding(s) |
| `DELETE /api/customers/[id]` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | – | PASS | PASS | 1 finding(s) |
| `GET /api/customers/[id]/measurements` | Customers | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
| `GET /api/dashboard-stats` | Dashboard | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | – | – | – | PASS | 1 finding(s) |
| `GET /api/measurements` | Measurements | NONE (open) | FAIL | N/A (open) | PASS | N/A (open) | FAIL | – | – | FAIL | 2 finding(s) |
| `POST /api/measurements` | Measurements | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | PASS | PASS | 1 finding(s) |
| `GET /api/measurements/[id]` | Measurements | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS |  |
| `PUT /api/measurements/[id]` | Measurements | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
| `DELETE /api/measurements/[id]` | Measurements | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |
| `GET /api/orders` | Orders | admin or staff | PASS | PASS | PASS | PASS | – | – | – | PASS | 1 finding(s) |
| `POST /api/orders` | Orders | admin or staff | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | 2 finding(s) |
| `GET /api/orders/all` | Orders | admin or staff | PASS | PASS | PASS | PASS | – | – | – | PASS |  |
| `GET /api/orders/[id]` | Orders | admin or staff | PASS | PASS | – | PASS | – | PASS | PASS | PASS |  |
| `PATCH /api/orders/[id]` | Orders | admin or staff | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | 3 finding(s) |
| `DELETE /api/orders/[id]` | Orders | admin or staff | PASS | PASS | – | PASS | – | – | PASS | PASS | 2 finding(s) |
| `GET /api/payments` | Payments | admin or staff | PASS | PASS | PASS | PASS | – | – | – | PASS |  |
| `POST /api/payments` | Payments | admin or staff | PASS | PASS | – | PASS | PASS | – | PASS | PASS | 2 finding(s) |
| `PATCH /api/payments/[id]` | Payments | admin or staff | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | 1 finding(s) |
| `DELETE /api/payments/[id]` | Payments | admin or staff | PASS | PASS | – | PASS | – | – | PASS | PASS | 1 finding(s) |
| `GET /api/general-ledger` | Ledger | admin only | PASS | PASS | PASS | PASS | – | – | PASS | PASS |  |
| `POST /api/general-ledger` | Ledger | admin only | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | 3 finding(s) |
| `GET /api/general-ledger/[id]` | Ledger | admin only | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | 1 finding(s) |
| `PUT /api/general-ledger/[id]` | Ledger | admin only | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS |  |
| `DELETE /api/general-ledger/[id]` | Ledger | admin only | PASS | PASS | – | PASS | – | PASS | PASS | PASS | 1 finding(s) |
| `GET /api/general-ledger/stats` | Ledger | admin only | PASS | PASS | PASS | PASS | – | – | PASS | PASS |  |
| `POST /api/general-ledger/sync-payments` | Ledger | admin only | PASS | PASS | – | PASS | – | – | – | PASS (rejections) / BLOCKED (admin path) | destructive: deletes and rebuilds all order_payment rows; admin success path deliberately NOT run |
| `GET /api/vendor-ledger` | Vendor ledger | admin only | PASS | PASS | – | PASS | PASS | PASS | – | PASS |  |
| `POST /api/vendor-ledger` | Vendor ledger | admin only | PASS | PASS | PASS | PASS | PASS | – | – | PASS |  |
| `GET /api/vendors` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS | 1 finding(s) |
| `POST /api/vendors` | Vendors | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | – | PASS | 1 finding(s) |
| `GET /api/vendors/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | PASS | PASS | 1 finding(s) |
| `PUT /api/vendors/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS |  |
| `DELETE /api/vendors/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS | 1 finding(s) |
| `GET /api/vendor-categories` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS | 1 finding(s) |
| `POST /api/vendor-categories` | Vendors | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | PASS | – | – | PASS |  |
| `PATCH /api/vendor-categories/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | PASS | PASS | PASS |  |
| `DELETE /api/vendor-categories/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | PASS | – | PASS | PASS |  |
| `GET /api/vendor-tags` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | – | PASS | PASS |  |
| `POST /api/vendor-tags` | Vendors | NONE (open) | OPEN | N/A (open) | PASS | N/A (open) | – | – | – | PASS |  |
| `DELETE /api/vendor-tags/[id]` | Vendors | NONE (open) | OPEN | N/A (open) | – | N/A (open) | – | PASS | PASS | PASS | 1 finding(s) |

Summary of the Status column: **45 PASS, 1 FAIL, 1 PASS (rejections) / BLOCKED (admin path)** = 47 endpoints. The one FAIL is
`GET /api/measurements` (search, see finding D1). Nothing is marked PASS on the strength of a build or a read of the code.

## 3. What is NOT covered (do not read the table as more than this)

- **Cross-user / tenant isolation: N/A.** The data model has no tenant or per-user ownership. Every authorized user sees all rows. Only the
  ledger MCP proposals are per-user (covered by `protocol.check`, not by this matrix).
- `POST /api/general-ledger/sync-payments` admin success path: **BLOCKED by design** (destructive to existing ledger rows).
- `GET/POST/DELETE /api/mcp` with a *valid* OAuth token: covered only by `protocol.check` (31 checks), not re-run here.
- Order line-item replacement via `PATCH /api/orders/[id]` with `orderItems`, `sortBy`/`sortDir` params of list endpoints, and the
  `measurementId` link on orders: NOT TESTED.
- Concurrency beyond two parallel identical submits (payments, orders): NOT TESTED.
- Expired-session behaviour of the API: the API only sees a bearer token; token expiry/refresh is covered by `auth-fetch.check` (client side).
- `staff` / `no-role` columns on open routes are `N/A (open)`: those routes never look at the token.

## 4. Existing regression suites (run in this session)

| Suite | Command (all with `--env-file=.env.local`) | Result | Kind |
|---|---|---|---|
| `scripts/ledger-mcp/normalize.check.ts` | `npx tsx scripts/ledger-mcp/normalize.check.ts` | **14/14 PASS** | unit, pure functions, no DB/network |
| `scripts/ledger-mcp/auth.check.ts` | `npx tsx scripts/ledger-mcp/auth.check.ts` | **13/13 PASS** | unit: verifier policy with a throwaway in-memory key |
| `scripts/check-order-validators.ts` | `npx tsx scripts/check-order-validators.ts` | **13/13 PASS** | unit: zod schemas |
| `scripts/security/auth-fetch.check.ts` | `npx tsx --env-file=.env.local scripts/security/auth-fetch.check.ts` | **11/11 PASS** | mixed: real helper + real local GoTrue; `window.location` and `fetch` are stubbed |
| `scripts/security/db-privileges.check.ts` | `npx tsx --env-file=.env.local scripts/security/db-privileges.check.ts` | **14/14 PASS** | real integration: PostgREST with a user's own JWT + anon key against the local DB |
| `scripts/security/api-auth.check.ts` | `npx tsx --env-file=.env.local scripts/security/api-auth.check.ts` | **95/95 PASS** | integration, **in-process**: real route handlers, real DB and tokens, no HTTP |
| `scripts/ledger-mcp/protocol.check.ts` | `LEDGER_MCP_ALLOWED_CLIENT_IDS=local-test-client MCP_TEST_BASE=http://localhost:3100 npx tsx --env-file=.env.local scripts/ledger-mcp/protocol.check.ts` | **31/31 PASS** | real HTTP integration with the official MCP SDK client; synthetic local data, removed afterwards, ledger compared byte-for-byte |
| `scripts/ledger-mcp/timezone.check.ts` | needs a server started **without** `BUSINESS_TIMEZONE` on another port | **BLOCKED** | needs a differently configured server; the shared server must not be reconfigured |
| `scripts/qa/api-matrix.check.ts` (new) | `npx tsx --env-file=.env.local scripts/qa/api-matrix.check.ts` | **185/186** (1 FAIL = finding D1) | real HTTP integration |

Note on `protocol.check`: `.env.local` now contains `LEDGER_MCP_ALLOWED_CLIENT_IDS=<the real local Claude Code client>`, and the suite's helper reads that
variable to choose the client id it mints tokens for. Run without the explicit override it mints for the wrong client and fails with
`Unauthorized` ("Token was not issued to an allowed client"). That is a test-environment interaction, not a server defect.

### MCP read-only smoke (inside the matrix)
`GET /.well-known/oauth-protected-resource/api/mcp` -> 200, resource `http://localhost:3100/api/mcp`, Supabase issuer, scopes `openid email profile`: PASS.
`GET`/`POST`/`DELETE /api/mcp` without a token -> 401 with a `resource_metadata` challenge: PASS. Garbage bearer, an ordinary admin web-session token (`aud=authenticated`) and a
staff web-session token -> 401: PASS. No financial write was made through the MCP outside `protocol.check`'s synthetic local run.

## 5. Findings (not fixed: backend code was not changed)

### A. Authentication gaps: the API does not match the UI's role rules
These routes have **no auth guard at all**: any anonymous caller can read and write them (the matrix proved it with token-less requests, including
create, update and delete). This is the known open item "Close the remaining open API routes" in `docs/LEDGER-MCP.md`.
Customers (`/api/customers`, `/api/customers/[id]`, `/api/customers/[id]/measurements`), measurements (`/api/measurements`, `/api/measurements/[id]`),
vendors (`/api/vendors`, `/api/vendors/[id]`), vendor categories, vendor tags, and `GET /api/dashboard-stats`.
UI mismatch: the sidebar makes Dashboard and Vendors **admin-only**, but `GET /api/dashboard-stats` (revenue, ledger and order figures) and every vendors route
answer anyone without a token. Ledger, vendor-ledger, orders and payments **do** match the UI (ledger/vendor-ledger admin only; orders/payments admin or staff; a signed-in user with no `users` row is rejected with 401).

### B. Data-integrity risks
1. **`PATCH /api/orders/[id]` with a partial body nulls the money fields it was not given.** Sending only `{"comments": "..."}` changed `total_amount` 10000 -> null
   (the route writes `value || null` for omitted fields). A client that sends partial updates loses amounts.
2. **Ledger drift on payment/order edits.** Editing a payment's amount does not update its `order_payment` ledger entry; deleting a payment or an order leaves the ledger entry in
   the books (the entry's `order_id` becomes null). The ledger only catches up when `sync-payments` is run, and that endpoint deletes and rebuilds *all* `order_payment` rows.
3. **Negative amounts are accepted by the ledger.** `POST /api/general-ledger` with `debit: -50` returns 201: only debit-XOR-credit is enforced (route and database), not amount > 0.
4. **No server-side idempotency.** Two identical concurrent `POST /api/payments` create two payments and two ledger rows. Two concurrent `POST /api/orders`: one succeeded, one returned 500 (consistent with a read-then-increment order-number race; two creates can also collide on the order number). The UI is the only protection against a double submit.

### C. Robustness: wrong status codes (the request is safely refused, but as a server error or success)
Validation failures returned as **500** instead of 400: `POST /api/customers`, `PATCH /api/customers/[id]`, `PATCH /api/orders/[id]`, invalid `status` on `GET /api/orders`,
unknown `entry_type` and non-numeric amounts on `POST /api/general-ledger`, negative payment amount, `sortDir` on `GET /api/customers`, order for a nonexistent customer (foreign-key text surfaces).
Non-uuid ids return 500 instead of 400/404 on customers, vendors and ledger `[id]` routes. Unknown id returns 500 instead of 404 on `PATCH /api/customers/[id]`, `PATCH /api/orders/[id]`, `PUT /api/measurements/[id]`.
**Deleting a nonexistent record returns 200 `success`** for customers, vendors, vendor tags, orders, measurements and ledger entries (no 404).
In every case above the matrix verified that **nothing was persisted** by the rejected request.

### D. Defect
1. **`GET /api/measurements?search=<anything>` always returns 500.** PostgREST `PGRST100 "failed to parse logic tree"`: the route puts `customer.name.ilike` inside a flat `.or()`. Same class of bug
   as the orders search fixed in commit `f9f6eab`. Measurement search cannot work in the web UI or any client until the route is fixed.

### Full finding list (generated, 39 lines)
- `DELETE /api/customers/[id]`: deleting a nonexistent customer returns 200 success instead of 404
- `DELETE /api/general-ledger/[id]`: deleting a nonexistent entry returns 200 success instead of 404
- `DELETE /api/measurements/[id]`: deleting a nonexistent measurement returns 200 success instead of 404
- `DELETE /api/orders/[id]`: deleting an order leaves its advance-payment ledger entry in the books (order_id becomes null; only sync-payments removes it)
- `DELETE /api/orders/[id]`: deleting a nonexistent order returns 200 success instead of 404
- `DELETE /api/payments/[id]`: deleting a payment leaves its order_payment ledger entry behind until sync-payments is run (books keep counting money that was deleted)
- `DELETE /api/vendor-tags/[id]`: deleting a nonexistent tag returns 200 success instead of 404
- `DELETE /api/vendors/[id]`: deleting a nonexistent vendor returns 200 success instead of 404
- `GET /api/customers`: returns customer names/phones without authentication (known open route)
- `GET /api/customers`: sortDir=sideways returns 500 instead of 400
- `GET /api/customers/[id]`: non-uuid id returns 500 instead of 400/404
- `GET /api/customers/[id]`: readable without authentication (known open route)
- `GET /api/customers/[id]/measurements`: readable without authentication (known open route)
- `GET /api/dashboard-stats`: returns revenue, ledger and order figures without authentication (known open route; the page itself is admin-only in the UI)
- `GET /api/general-ledger/[id]`: non-uuid id returns 500 instead of 400/404
- `GET /api/measurements`: ANY ?search= returns 500 (PostgREST PGRST100 "failed to parse logic tree": the route puts `customer.name.ilike` inside a flat .or()); same class of defect as the orders search fixed in f9f6eab. Measurement search in the UI cannot work.
- `GET /api/measurements`: readable without authentication (known open route)
- `GET /api/orders`: invalid status filter returns 500 instead of 400
- `GET /api/vendor-categories`: readable without authentication (known open route)
- `GET /api/vendors`: readable without authentication (known open route)
- `GET /api/vendors/[id]`: non-uuid id returns 500 instead of 400/404
- `PATCH /api/customers/[id]`: validation failure returns 500 instead of 400
- `PATCH /api/customers/[id]`: unknown id returns 500 instead of 404
- `PATCH /api/orders/[id]`: validation failure returns 500 "Failed to update order" instead of 400
- `PATCH /api/orders/[id]`: unknown id returns 500 instead of 404
- `PATCH /api/orders/[id]`: a PATCH that sends only "comments" changed total_amount 10000 -> null (route writes total_amount: value || null for omitted fields)
- `PATCH /api/payments/[id]`: editing a payment's amount (1500 -> 1600) does NOT update its ledger entry (still 1500); the ledger only catches up when sync-payments is run
- `POST /api/customers`: accepts an unauthenticated create (no auth guard; known open route)
- `POST /api/customers`: validation failure returns 500 "Failed to create customer" instead of 400 (zod error is not handled)
- `POST /api/general-ledger`: unknown entry_type returns 500 instead of 400 (database check constraint surfaces as a server error)
- `POST /api/general-ledger`: a NEGATIVE debit is accepted (201): the route and the database only enforce debit-XOR-credit, not amount > 0, so a negative debit lowers the balance like a credit
- `POST /api/general-ledger`: non-numeric amount returns 500 instead of 400
- `POST /api/measurements`: accepts an unauthenticated create (known open route)
- `POST /api/orders`: order for a nonexistent customer returns 500 (foreign-key error text) instead of 400/404
- `POST /api/orders`: concurrent creates: one failed (201/500), consistent with a read-then-increment order number race
- `POST /api/payments`: negative amount returns 500 instead of 400 (only the database check rejects it)
- `POST /api/payments`: two identical concurrent submits both succeed (2 payments + 2 ledger rows): there is no server-side idempotency, so the UI must prevent double submits
- `POST /api/vendors`: accepts an unauthenticated create (known open route)
- `PUT /api/measurements/[id]`: unknown id returns 500 instead of 404

## 6. Cleanup and database confirmation

Baseline (before) and final (after) row counts, taken with the service role:

`customers 20, orders 30, order_items 0, measurements 30, general_ledger 30, vendors 6, vendor_tags 1, vendor_categories 8, payments 22, vendor_ledger 17` -> identical after the run.
A hash over the identifying and financial columns of every pre-existing row in `customers, orders, measurements, general_ledger, vendors, payments, vendor_ledger, vendor_categories` is also identical, so no existing record was modified.

One earlier run (before the sweep keyed on the 2099 date window) left a single orphaned `order_payment` ledger row dated 2099-03-01 for a synthetic order. It was the only row dated 2099 or later; it was removed by id after
being identified, and the script now refuses to start if any 2099-dated rows exist. No production or staging system was contacted. No commit, push or deploy.
