# AR Studio Dashboard — Agent Context

> Persistent notes for Warp / Oz agents working in this repo. Read this before doing anything substantive — it captures the architecture, schema, conventions, and gotchas so you don't have to re-discover them every session.

---

## 1. What this app is
A production tailoring-business dashboard for an Pakistan-based studio ("AR Studio").
It manages **customers**, **orders** (with detailed body measurements), **payments**, a **general ledger**, and **vendor relationships**. Currency is **PKR**.

- Local dev URL: `http://localhost:3000`
- Default theme: dark, violet primary (OKLCH, see `docs/THEMING.md`)
- Companion docs already in repo: `README.md`, `docs/PROJECT.md`, `docs/THEMING.md` — keep them in sync if you change architecture.

## 2. Tech stack
- **Next.js 15** (App Router, TypeScript, almost all pages are `"use client"`)
- **Supabase** (Postgres) — server routes use the **service-role key** via `createAdminSupabaseClient()`
- **Auth**: Supabase Auth (email/password) + custom `users` table for `admin` / `staff` roles
- **UI**: Tailwind v4 + shadcn/ui (new-york style, neutral base), lucide-react icons
- **Forms**: react-hook-form + Zod (`src/lib/validators.ts`, `src/types/measurements.ts`)
- **Tables**: TanStack Table (mostly client-side; orders/ledger paginate server-side via API)
- **Server state**: TanStack React Query (`src/hooks/use-api.ts`, `src/lib/query-client.ts`)
- **Charts**: Recharts (revenue area chart on dashboard)
- **Theme**: `next-themes`, default `dark`
- **Toasts**: Sonner (`<Toaster />` in root layout)

## 3. Directory map (only the parts that matter)
```
src/
├── app/
│   ├── layout.tsx                  # ThemeProvider → QueryProvider → AuthProvider → Toaster
│   ├── globals.css                 # Tailwind + OKLCH theme tokens (light/dark)
│   ├── sign-in/page.tsx            # Supabase email/password sign-in
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Sidebar + Header + RouteGuard + GLOBAL OrderDialog & PaymentDialog
│   │   ├── page.tsx                # Home (admin-only, stats + revenue chart + upcoming deliveries)
│   │   ├── customers/page.tsx      # Customer CRUD
│   │   ├── orders/page.tsx         # Order CRUD, status filter, server pagination
│   │   ├── measurements/page.tsx   # Measurement CRUD
│   │   ├── ledger/page.tsx         # General ledger (admin only)
│   │   ├── vendors/page.tsx        # Vendor list (admin only)
│   │   └── vendors/[id]/page.tsx   # Vendor sub-ledger
│   └── api/                        # Route handlers — see §6
├── components/
│   ├── auth/{route-guard,role-guard}.tsx
│   ├── dashboard/{sidebar,header}.tsx
│   ├── dialogs/                    # All modals (CRUD)
│   ├── forms/                      # react-hook-form forms
│   ├── data-table/                 # Generic DataTable + column factories
│   ├── tables/measurement-columns.tsx
│   ├── combobox/customer-combobox.tsx
│   ├── print-{measurement,receipt}.tsx
│   ├── providers/{theme,query}-provider.tsx
│   └── ui/                         # shadcn primitives (~30 components)
├── contexts/auth-context.tsx       # AuthProvider (role caching + cross-tab sync)
├── hooks/{use-api,use-debounce}.ts
├── lib/
│   ├── supabase.ts                 # Server clients: SSR (anon) + admin (service role, singleton)
│   ├── supabase-client.ts          # Browser client + ALL TS interfaces
│   ├── database.ts                 # Server DB helpers (customers/orders/order_items)
│   ├── api-auth.ts                 # requireAuth / requireAdmin / requireRole helpers
│   ├── validators.ts               # Zod schemas (Customer, Order, Payment, queries)
│   ├── query-client.ts             # React Query client + queryKeys registry
│   ├── theme-config.ts, print-utils.tsx, utils.ts (cn)
└── types/measurements.ts           # Measurement type, Zod schema, MEASUREMENT_FIELDS list
```
Other top-level dirs:
- `database/` — extra SQL (`add-payment-fields.sql`, `performance-indexes.sql`)
- `scripts/` — `seed-supabase.ts`, `create-demo-users.ts`, `setup-user-roles.ts` (run with `tsx`)
- `supabase/.temp/` — local Supabase CLI scratch (ignore)
- `docs/` — long-form documentation (PROJECT.md, THEMING.md)

## 4. Database schema (Supabase Postgres)
### Core
- **customers**(id uuid, name, phone UNIQUE, address, timestamps)
- **orders**(id, order_number `AR-XXXXX`, customer_id FK, booking_date, **delivery_date (mandatory)**, status `'In Process' | 'Delivered' | 'Cancelled'`, total_amount, advance_paid, balance, payment_method `'cash'|'bank'|'other'`, measurement_id FK, fitting_preferences, comments, timestamps)
- **order_items**(id, order_id FK, order_type `'nikkah'|'mehndi'|'barat'|'wallima'|'other'`, description, timestamps) — max 4 per order, types must be unique
- **measurements**(id, customer_id FK, name, **21 body fields** in inches: chest, waist, hip, sleeves, biceps, wrist, neck, shoulder, cross_back, open_coat_length, coat_length, sherwani_length, kameez_length, three_piece_waistcoat_length, waistcoat_length, pent_waist, pent_length, thigh, knee, bottom, shoe_size, turban_size, is_default, notes, timestamps)
- **payments**(id, order_id FK, customer_id FK, amount, payment_method, payment_date, notes, timestamps)
- **users**(id, email, name, role `'admin'|'staff'`, timestamps) — `id` matches `auth.users.id`

### Financial
- **general_ledger**(id, entry_date, particulars, debit, credit, balance, entry_type `'opening_balance'|'order_payment'|'vendor_payment'|'miscellaneous'`, notes, order_id FK, vendor_id FK, tag_id FK, timestamps)
- **vendors**(id, name, contact_person, phone, email, address, notes, timestamps)
- **vendor_tags**(id, vendor_id FK, tag_name, timestamps)
- **vendor_ledger**(id, vendor_id FK, general_ledger_id FK, entry_date, particulars, debit, credit, balance, notes, timestamps)

### DB-side automation (important!)
- `order_number` is generated app-side in `nextOrderNumber()` (`src/lib/database.ts`) — `AR-` + zero-padded counter derived from latest row.
- DB trigger **`trg_create_vendor_sub_ledger_entry`** mirrors any `general_ledger` insert with `vendor_id` into `vendor_ledger`. **Don't double-insert vendor ledger rows from app code.**
- Order creation with `advance_paid > 0` inserts a `general_ledger` row with `entry_type='order_payment'` (see `POST /api/orders`).
- Subsequent payments via `/api/payments` also insert ledger rows.
- "Sync Order Payments" (admin button on ledger page) wipes all `entry_type='order_payment'` rows and re-creates them from `orders.advance_paid` + `payments.*`.

## 5. Auth & authorization
**Flow**: Visit dashboard → `RouteGuard` checks `useAuth()` → if no session → `/sign-in` → on success Supabase Auth → fetch role from `public.users` → cache in `localStorage` (24h) → broadcast via `BroadcastChannel('ar_auth_channel')` for cross-tab sync.

**Roles**:
- **admin**: Dashboard, Customers, Orders, Measurements, Ledger, Vendors
- **staff**: Customers, Orders, Measurements only

**Where it's enforced**:
- Client: `RouteGuard` (auth gate, in `(dashboard)/layout.tsx`), `RoleGuard` (per-page admin gate on Dashboard/Ledger/Vendors), sidebar nav filtered by `user.role`.
- Server: `src/lib/api-auth.ts` exports `requireAuth`, `requireAdmin`, `requireRole(roles[])`. **Note**: many existing API routes don't actually call these yet — they just use the admin Supabase client. Treat unauthenticated API access as a known gap; add `requireAuth(...)` if you're hardening a route.

## 6. API surface (`src/app/api/**`)
All routes return JSON, use `createAdminSupabaseClient()` (service role), and follow Next 15 App Router conventions.

| Resource | Routes |
|---|---|
| Customers | `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/[id]`, `GET /api/customers/[id]/measurements` |
| Orders | `GET/POST /api/orders`, `GET/PATCH/DELETE /api/orders/[id]`, `GET /api/orders/all` (simplified, up to 1000) |
| Measurements | `GET/POST /api/measurements`, `GET/PUT/DELETE /api/measurements/[id]` |
| Payments | `GET/POST /api/payments`, `GET/PATCH/DELETE /api/payments/[id]` |
| General Ledger | `GET/POST /api/general-ledger`, `GET/PUT/DELETE /api/general-ledger/[id]`, `GET /api/general-ledger/stats`, `POST /api/general-ledger/sync-payments` |
| Vendors | `GET/POST /api/vendors`, `GET/PUT/DELETE /api/vendors/[id]` |
| Vendor Ledger | `GET /api/vendor-ledger?vendor_id=...` |
| Vendor Tags | `GET/POST /api/vendor-tags`, `GET/PUT/DELETE /api/vendor-tags/[id]` |
| Dashboard | `GET /api/dashboard-stats` (Promise.all of 6 queries; ledger.debit/credit aggregated client-side; cached `s-maxage=60`) |

Pagination convention: `?page=&pageSize=&sortBy=&sortDir=` returning `{ data, pagination: { page, pageSize, total, pages } }`. The ledger route also supports `page=0` legacy mode that returns a flat array (used by older code paths).
### Route-specific behaviors that aren't obvious
- **`POST /api/orders`**: does the camelCase→snake_case translation inline; inserts a `general_ledger` `order_payment` row if `advance_paid > 0`.
- **`PATCH /api/orders/[id]`**: same camelCase→snake_case translation; if `orderItems` is present in the body, it wipes existing `order_items` and re-inserts.
- **`POST /api/payments`**: creates the `payments` row **and** a `general_ledger` `order_payment` row. Ledger insert is best-effort (logs and continues if it fails).
- **`PATCH /api/payments/[id]`**: updates only the `payments` row; explicitly strips `advance_paid`/`total_amount`/`balance` before writing so the `orders` row is never mutated. **Does NOT touch the ledger** — the corresponding ledger row goes stale until Sync Order Payments is run.
- **`DELETE /api/payments/[id]`**: deletes only the `payments` row. **Does NOT touch the ledger** either.
- **`POST /api/measurements`** / **`PUT /api/measurements/[id]`**: if `is_default: true`, all other measurements for the same customer are flipped to `is_default: false` first. Empty numeric fields are coerced to `null`. Search uses `name.ilike + customer.name.ilike`.
- **`PUT /api/general-ledger/[id]`**: after updating, deletes existing `vendor_ledger` rows linked via `general_ledger_id` and, if `vendor_id` is provided, re-inserts a vendor_ledger row with **debit/credit swapped** (main-ledger credit → vendor-ledger debit and vice versa). No `balance` is recomputed here.
- **`DELETE /api/general-ledger/[id]`**: explicitly deletes matching `vendor_ledger` rows first, then the main entry (defensive — doesn't rely on cascade).
- **`POST /api/vendor-ledger`**: creates a **vendor-only** entry with `general_ledger_id: null` (used by "Create Bill" on the vendor detail page). Balance is computed app-side from the previous entry — subject to race conditions and out-of-order inserts.
- **`GET /api/payments`**: no pagination; returns all payments joined with order + customer, sorted by `payment_date DESC`. Optional `?order_id=` and `?customer_id=` filters.
- **`GET /api/vendors/[id]`**: returns vendor with `vendor_tags` and `vendor_ledger` inline-joined (used by the vendor detail page as a fallback).

## 7. Data fetching patterns
Two patterns coexist — match what's already in the file you're touching:
1. **React Query** (`src/hooks/use-api.ts`) — preferred for new code. Hooks: `useDashboardStats`, `useCustomers`, `useOrders`, `useLedgerEntries`, `useLedgerStats`, `useVendors`, `useVendorLedger(id)`, plus all `useCreate*/useUpdate*/useDelete*` mutations. Mutations auto-invalidate via `queryKeys` and toast via Sonner.
2. **Direct `fetch` in `useEffect`** (vendors page, measurements page, some legacy code paths). Fine to keep, but prefer React Query when adding features.

`queryClient` defaults: `staleTime: 2min`, `gcTime: 5min`, `refetchOnWindowFocus: true`, `refetchOnMount: true`, `retry: 1`.

`window.dispatchEvent(new CustomEvent('orderCreated'))` and `'paymentAdded'` are used by the dashboard layout's global Order/Payment dialogs to nudge child pages to refresh.

## 8. Order creation flow (the most complex feature)
1. User opens **OrderDialog** (global in `(dashboard)/layout.tsx`, also reachable from Orders page).
2. Multi-step form (`order-multistep-form.tsx` → `order-steps/{general-info,measurements,payment}-step.tsx`).
3. Customer selected via `customer-combobox` (inline create supported through `customer-dialog`).
4. Up to 4 `order_items` (unique types). Optional `measurement_id`. Total + advance + payment_method. Delivery date >= booking date.
5. `POST /api/orders` validates with `CreateOrderSchema`, calls `createOrder()` which calls `nextOrderNumber()` to get `AR-XXXXX`, then `createOrderItems(orderId, items)`.
6. If `advance_paid > 0`, inserts a `general_ledger` row inline (entry_type `order_payment`). The DB trigger then mirrors it to `vendor_ledger` if applicable (won't apply here since no vendor).
7. Sonner success toast, React Query invalidates `orders` + `ledger` keys.
### Order form details
- Balance is auto-computed from `totalAmount - advancePaid` in a `useEffect` and clamped to `>= 0`; the field is read-only.
- Step 2 (measurements) lets you select any saved measurement for that customer or create a new one via `POST /api/measurements` mid-flow; the customer's `is_default` measurement (or the first) auto-selects when the customer is chosen.
- Step 1 does live cross-field validation for `bookingDate <= deliveryDate` (in `general-info-step.tsx`), and `validateCurrentStep()` in the multistep form guards each Next click.
- `orders.advance_paid` is only written at order creation. Later payments live in the `payments` table, never mutate `orders.advance_paid`, `orders.total_amount`, or `orders.balance`.

## 8a. Payment / ledger relationship (critical to understand)
Orders, payments, and the general ledger are three loosely-coupled tables. Money paid against an order lives in:
- `orders.advance_paid` — set once, at order creation, never touched afterwards.
- `payments` rows — every subsequent payment.
- `general_ledger` rows with `entry_type='order_payment'` — mirror of the above, used for reporting/ledger UI.

The UI in `OrderDetailsDialog` and `PaymentDialog` shows a merged view: advance + payments; balance = `total_amount - (advance + sum(payments))`.

**Consistency gap**: `PATCH /api/payments/[id]` and `DELETE /api/payments/[id]` update/delete the `payments` row **without** touching the linked `general_ledger` row. That means editing a payment amount inline in `OrderDetailsDialog` or deleting a payment in `PaymentDialog` silently breaks ledger totals until the admin clicks **Sync Order Payments** on `/ledger`, which wipes and rebuilds every `order_payment` entry. Keep this in mind before assuming ledger totals match payments.

## 8b. Vendor bill vs. vendor payment (two flows, easy to confuse)
- **Vendor payment** = money we pay to a vendor. Created via `LedgerEntryForm` on `/ledger` with `entry_type='vendor_payment'` (always Credit in main ledger, auto-forced). Goes into `general_ledger` with `vendor_id` set; the DB trigger mirrors it into `vendor_ledger` (so it appears in the vendor sub-ledger).
- **Vendor bill** = invoice/bill received from a vendor. Created via the **"Create Bill"** button on the vendor detail page (`vendors/[id]/page.tsx` → `VendorBillDialog` → `POST /api/vendor-ledger`). This inserts **only** into `vendor_ledger` with `general_ledger_id: null` — bills do NOT appear in the main ledger. The Type column on the vendor detail page shows `"Vendor Bill"` for these.
- Vendor sub-ledger balance direction: `Debit = money received from us` (we paid the vendor), `Credit = bill/return`. Net positive balance = "We owe vendor"; negative = "Vendor owes us".

## 8c. Printing
- `src/lib/print-utils.tsx` uses `renderToString` from `react-dom/server` **client-side** to build HTML for a new window, then loads the Tailwind CDN (`<script src="https://cdn.tailwindcss.com">`) inside that window for styling.
- Two flows per document: `printX(...)` auto-triggers `window.print()` on load, `openXPreview(...)` shows a preview with Print / Close buttons.
- Receipt = `PrintReceipt` (`src/components/print-receipt.tsx`), Measurement = `PrintMeasurement` (`src/components/print-measurement.tsx`).
- `OrderDetailsDialog` prints the receipt and, if there are multiple measurements for the customer, opens `MeasurementSelectDialog` to pick which one to print (the one linked to the order is badged "Linked to Order").
- The receipt component has its own `<style jsx>` that overrides `@page { size: letter }`, while `print-utils.tsx` sets `size: A4`. Letter wins in the child window because the component's style block ships with the rendered HTML — be aware if you ever change paper size.

## 9. Conventions to follow
- **Path alias**: `@/*` → `src/*` (configured in `tsconfig.json`).
- **Currency formatting**: `Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' })` or the `PKR ${...}` template used on the dashboard. Stay consistent with the file you're editing.
- **Dates**: store as `YYYY-MM-DD` strings (Supabase `date` columns). Convert with `.toISOString().split('T')[0]`.
- **camelCase ↔ snake_case**: forms/Zod use camelCase (`customerId`, `bookingDate`, `totalAmount`). Database/API payloads use snake_case (`customer_id`, `booking_date`, `total_amount`). The `POST /api/orders` route does the translation manually — keep that pattern when adding fields.
- **shadcn component imports**: `@/components/ui/...`. Don't reach into `node_modules`.
- **Theme tokens**: use semantic classes (`bg-primary`, `text-muted-foreground`, custom `bg-brand|success|warning|info`) — see `docs/THEMING.md`. Avoid hard-coded `bg-violet-500`, etc.
- **Toasts**: `import { toast } from 'sonner'`. Mutations in `use-api.ts` already toast on success/error — don't double-toast.
- **ESLint is intentionally non-blocking on build** (`next.config.ts: eslint.ignoreDuringBuilds = true`). Still run `npm run lint` before finishing work.

## 10. Environment variables (`.env`)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...           # required for all API routes
DATABASE_URL=postgresql://...           # only used by external tooling
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
```
The admin Supabase client (`createAdminSupabaseClient`) is a singleton — first call without `SUPABASE_SERVICE_ROLE_KEY` throws.

## 11. Scripts
```bash
npm run dev           # Next dev server
npm run build         # Production build (lint disabled)
npm run start         # Production server
npm run lint          # ESLint
npm run seed          # tsx scripts/seed-supabase.ts (faker data: 20 customers, 30 orders)
npm run create-users  # tsx scripts/create-demo-users.ts (admin@/staff@ demo accounts)
npm run setup-roles   # tsx scripts/setup-user-roles.ts
```

## 12. Known gotchas / sharp edges
- **API auth is inconsistent**: most routes skip `requireAuth(...)`. Don't assume RLS is the only line of defence — they use the service-role key.
- **`order_number` generation is racy**: `nextOrderNumber()` reads the latest order then increments app-side. Concurrent inserts can collide. There's a `counters` table referenced by `scripts/seed-supabase.ts` (`rpc('increment_counter')`) but the current app runtime doesn't use it.
- **`order_items` table is treated as optional**: `createOrderItems` swallows errors and returns `[]` if the table is missing. Don't rely on its return value being non-empty.
- **Vendor sub-ledger is trigger-driven**: never insert into `vendor_ledger` directly from app code (except via `POST /api/vendor-ledger` for bills, which sets `general_ledger_id: null` so the trigger doesn't apply).
- **Sync Order Payments wipes data**: it `DELETE`s every `entry_type='order_payment'` row, then rebuilds. Anything edited manually under that type is lost. This is the ONLY way to reconcile the ledger after PATCH/DELETE on payments — see §8a.
- **Ledger drift after payment edits/deletes**: `PATCH /api/payments/[id]` and `DELETE /api/payments/[id]` change the `payments` table but leave the linked `general_ledger` row untouched. Editing a payment amount inline in `OrderDetailsDialog` looks fine per-order but breaks ledger totals until Sync Order Payments is run.
- **`PUT /api/general-ledger/[id]` recreates vendor_ledger with swapped debit/credit**: on updates it deletes vendor_ledger rows tied to that general_ledger_id and, if `vendor_id` is set, inserts a fresh one where `debit`/`credit` are the mirror of the main ledger's values (and without a recomputed `balance`).
- **Order-payment ledger entries are unmanaged**: the ledger page hides Edit/Delete for rows where `entry_type='order_payment'`. Treat them as read-only reflections of `orders.advance_paid + payments.*`.
- **`orders.advance_paid` never changes after creation**: subsequent payments live only in `payments`. Anywhere that displays "total paid" must add `orders.advance_paid + sum(payments)` (see `OrderDetailsDialog.calculateTotalPaid()`).
- **`refetchOnMount: true` + `refetchOnWindowFocus: true`** can cause noticeable refetch flashes; this is intentional to keep ledger/orders fresh.
- **Two parallel TS interface declarations**: `src/lib/supabase.ts` (server) and `src/lib/supabase-client.ts` (client + richer types like `OrderWithCustomer`, `Vendor`, `GeneralLedger`). When adding a new field to a table, update **both** plus `src/lib/validators.ts` and any Zod schema.
- **Measurements Zod schema** in `src/types/measurements.ts` accepts `z.number().or(z.literal(""))` to be lenient with empty form inputs — preserve that pattern when adding fields.
- **Dashboard role**: `app/(dashboard)/page.tsx` is wrapped in `<RoleGuard allowedRoles={['admin']}>` — staff users land there briefly, then `RoleGuard` redirects to `/customers`.
- **Seed script is stale**: `scripts/seed-supabase.ts` writes measurements into the `orders` table (from a pre-refactor schema where measurements were inline columns) using old names (`hips`, `pant_waist`, `pant_length`, `turban_length`). The current schema has measurements in a separate `measurements` table with different field names (`hip`, `pent_waist`, `pent_length`, `turban_size`). Expect the seed to fail on those columns; it also depends on an `increment_counter` RPC. Fix or replace it before using `npm run seed` on a fresh DB.
- **`scripts/setup-user-roles.ts` is one-off**: it contains hardcoded owner emails (`ahsantariq.ar@gmail.com`, `ahsantariq1991@gmail.com`) and a default admin password. Don't run it blindly on someone else's environment.
- **`DataTable` global search vs. server search**: `DataTable` (`src/components/data-table/data-table.tsx`) has its own client-side global filter, but the customers/orders/ledger pages perform search server-side via URL params. On those pages the DataTable's built-in search box only filters already-loaded rows — don't rely on it for full-dataset search.
- **`use-debounce` hook exists but isn't universally used**: several pages (customers, ledger) implement their own inline debounce via `setTimeout` + `useRef` instead of importing `useDebounce` from `src/hooks/use-debounce.ts`.

## 13. When extending the app — checklist
- New entity field?
  1. Update DB (write SQL into `database/` if it's a schema change).
  2. Update TS interface in `src/lib/supabase.ts` **and** `src/lib/supabase-client.ts`.
  3. Update Zod schema in `src/lib/validators.ts` (or `src/types/measurements.ts` for measurements).
  4. Update API route(s) — remember camelCase ↔ snake_case mapping if applicable.
  5. Update relevant form (`components/forms/*`) and dialog.
  6. Update column definition (`components/data-table/columns/*` or `components/tables/*`).
  7. Update React Query hooks if cache shape changes.
- New page?
  1. Add to `src/app/(dashboard)/<route>/page.tsx`, mark `"use client"` unless you have a reason not to.
  2. Wrap in `<RoleGuard>` if admin-only.
  3. Add nav entry to `src/components/dashboard/sidebar.tsx` with proper `roles` array.
- New API route?
  1. Use `createAdminSupabaseClient()` (singleton).
  2. Add `requireAuth(request)` / `requireAdmin(request)` if it touches anything sensitive.
  3. Return `{ data, pagination }` shape if it lists.
  4. Add a hook in `src/hooks/use-api.ts` and a key in `src/lib/query-client.ts`.

## 14. What changes typically look like
- Most edits are scoped: one page + its form + its API route + the React Query hook.
- Avoid touching `components/ui/*` unless adding a new shadcn primitive — they should stay close to the upstream shadcn versions.
- Keep `docs/PROJECT.md` and `docs/THEMING.md` updated when architecture/visual conventions change.

---
_Last refreshed by an agent on 2026-07-05 after a full second-pass review of every source file. If the codebase has drifted significantly, refresh this file before making changes._
