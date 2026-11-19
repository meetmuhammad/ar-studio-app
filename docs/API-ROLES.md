# API roles

Who may call each route under `src/app/api/**`. The rules are the same as the database's
(RLS in `supabase/migrations/20261119000000_role_scoped_rls.sql` and the functions in
`20261119000100`, `20261119000200` and `20261119000300`), so the web app, the mobile app and
direct database access all agree.

**How "admin" is decided.** `public.current_user_is_admin()` is `public.users.role = 'admin'`
for the signed-in user: one global role, not per business. The API checks the same column
(`requireRole` in `src/lib/api-auth.ts`, used by `requireBusiness` / `requireBusinessRead` in
`src/lib/business-context.ts` through their `roles` option). Membership (`user_businesses`)
then decides which business a request may act on (`X-Business-Id`, default Ahsan Tariq
Couture for clients without the header). A user with no role is refused with 403.

**Refusals.** A caller without a valid session gets `401 {"error":"Unauthorized - Please sign in"}`.
A signed-in user with the wrong role gets `403 {"error":"Forbidden - Insufficient permissions"}`,
before the route reads the body or writes anything. A business the user is not a member of
gets `403 {"error":"Forbidden - No access to this business"}`. Writes in the admin "All
businesses" view (`X-Business-Id: all`) get `400` (`BUSINESS_REQUIRED`).

"Member" below means admin or staff, and a member of the business in scope.

| Route | GET | POST | PUT / PATCH | DELETE |
| --- | --- | --- | --- | --- |
| `/api/me/businesses` | signed in (admin or staff) | — | — | — |
| `/api/customers` | member | member | — | — |
| `/api/customers/[id]` | member | — | PATCH: member | **admin** |
| `/api/customers/[id]/measurements` | member | — | — | — |
| `/api/measurements` | member | member | — | — |
| `/api/measurements/[id]` | member | — | PUT: member | **admin** |
| `/api/orders` | member | member (`create_order`: order, items and advance ledger row in one transaction) | — | — |
| `/api/orders/all` | member | — | — | — |
| `/api/orders/[id]` | member | — | PATCH: member (order and items; direct table writes) | **admin** (`delete_order`: order, items, payments and their ledger rows) |
| `/api/payments` | member | **admin** (`record_payment`: payment + its linked ledger row, atomic) | — | — |
| `/api/payments/[id]` | — | — | PATCH: **admin** (`update_payment`: payment + its ledger row, atomic) | **admin** (`delete_payment`: payment + its ledger row, atomic) |
| `/api/vendors` | admin | admin | — | — |
| `/api/vendors/[id]` | admin | — | PUT: admin | admin |
| `/api/vendor-tags` | admin | admin | — | — |
| `/api/vendor-tags/[id]` | — | — | — | admin |
| `/api/vendor-categories` | signed in (admin or staff) | admin | — | — |
| `/api/vendor-categories/[id]` | — | — | PATCH: admin | admin |
| `/api/vendor-ledger` | admin | admin | — | — |
| `/api/general-ledger` | admin | admin | — | — |
| `/api/general-ledger/[id]` | admin | — | PUT: admin | admin |
| `/api/general-ledger/stats` | admin | — | — | — |
| `/api/dashboard-stats` | admin | — | — | — |
| `/api/pnl` | admin | — | — | — |
| `/api/mcp` (GET, POST, DELETE) | MCP transport; see below | | | |

Admin-only GET routes also accept the admin combined view (`X-Business-Id: all`) where they
did before.

## Orders, advances and payments

Creating or updating an order stays open to staff, as `create_order` / `update_order` allow
members: `POST /api/orders` may write the order's advance ledger row (`order_payment`), and
`PATCH /api/orders/[id]` changes the order and its items only. Recording, editing and deleting
a payment (`/api/payments`, `/api/payments/[id]`) is admin-only, as `record_payment`,
`update_payment` and `delete_payment` are.

**Atomic, as the caller.** `POST /api/payments`, `PATCH` / `DELETE /api/payments/[id]`,
`POST /api/orders` and `DELETE /api/orders/[id]` now call those database functions with a
Supabase client acting as the caller (anon key + the request's bearer token;
`callerSupabaseClient` in `src/lib/api-auth.ts`), so the payment or order and its ledger rows
are written in one transaction and the database checks the same role and membership as for the
web app. A payment's ledger row is linked by `general_ledger.payment_id`
(`20261119000500_payment_ledger_link.sql`): editing or deleting the payment always edits or
deletes exactly that row. The route checks (role, `X-Business-Id`), status codes and response
JSON are unchanged. One difference: input the database refuses (for example a negative amount
or an unknown payment method) is now `400` with the function's message instead of being stored
(negative amounts) or failing with `500`. `PATCH /api/orders/[id]` is unchanged and still
writes the tables directly (see [REFINE.md](REFINE.md), "API routes").

## MCP (`/api/mcp`)

Unchanged. The endpoint is off (404) unless `LEDGER_MCP_ENABLED=true`. Every request needs a
bearer token issued for the MCP audience, and the token verifier
(`src/lib/ledger-mcp/auth.ts`) refuses any user whose `public.users.role` is not `admin`
(read fresh from the database on each request). Writes are proposals that an admin commits;
`commit_ledger_proposal` checks again that the user is an admin and a member of the
proposal's business. So MCP reads and writes both require an admin today.

## Behaviour changes vs main

Staff requests that now get `403 Forbidden - Insufficient permissions` (they succeeded before):

- `DELETE /api/customers/[id]`
- `DELETE /api/measurements/[id]`
- `DELETE /api/orders/[id]`
- `POST /api/payments`
- `PATCH /api/payments/[id]`
- `DELETE /api/payments/[id]`

Staff requests that now succeed (they got 403 before):

- `GET /api/vendor-categories` (the list is readable by every signed-in user, as in RLS).

Nothing changes for admins, and no other route or method changes.

## Checking it

`e2e/staging/api-roles.mjs` checks these rules against a running app with an admin and a staff
access token, and removes everything it creates (names start with `E2E-STG`):

```
BASE_URL=http://localhost:3210 E2E_ADMIN_TOKEN=… E2E_STAFF_TOKEN=… node e2e/staging/api-roles.mjs
```

Optional: `COOKIE` (sent as the Cookie header) and `E2E_BUSINESS_ID` (sent as
`X-Business-Id`). It prints a pass/fail table, never the tokens, and exits non-zero on any
failure. Use the dummy/staging project only.
