# Refine app shell

The root Next.js 15 App Router app is a Refine app. Refine (`@refinedev/core` 5) with the
Ant Design UI kit (`@refinedev/antd` 6, `antd` 5) provides the shell (sidebar, header, theme),
auth, access control and data access. Customers, Measurements, Vendors, Orders (with payments),
the Dashboard, Ledger, P&L and the sign-in page are on Refine + antd. Refine pages read through
the Supabase data provider (or, for the admin reports, read-only Postgres functions) and write
either to tables (RLS) or, for orders and payments, through Postgres functions. The `/api` calls
left are ledger writes (the Ledger page's add / edit / delete / sync, and the vendor ledger and
bills section), which have no direct client access by design (see Ledger and Vendors).

Nothing under `src/app/api/**`, `src/app/.well-known/**`, `src/app/oauth/**`,
`src/lib/ledger-mcp/**`, `src/lib/ledger-service.ts` or `src/lib/pnl.ts` changed. The mobile
app and the MCP server keep using the API routes exactly as before.

## Structure

```
src/app/layout.tsx                      AntdRegistry(layer) > next-themes > React Query > AuthContext
                                        > ColorModeProvider (antd ConfigProvider + App) > RefineProvider
src/app/(dashboard)/layout.tsx          <Authenticated> + BusinessProvider + ThemedLayout (sider + ShellHeader)
src/app/(dashboard)/page.tsx            Dashboard, Ant Design Pro analysis layout (admin only)
src/app/(dashboard)/overview/page.tsx   The classic overview over /api/dashboard-stats, unchanged
src/app/(dashboard)/ledger/page.tsx     General ledger over ledger_entries (admin only)
src/app/(dashboard)/pnl/page.tsx        Profit & Loss over pnl_input + computePnl (admin only)
src/app/(dashboard)/customers/**        list / create / edit/[id] / show/[id] (Refine + antd)
src/app/(dashboard)/measurements/**     list / create[?customer_id=] / edit/[id] / show/[id] (Refine + antd)
src/app/(dashboard)/vendors/**          list / create / edit/[id] / show/[id] (Refine + antd, admin only);
                                        /vendors/[id] redirects to /vendors/show/[id]
src/app/(dashboard)/orders/**           list / create[?customer_id=] (3 steps) / edit/[id] / show/[id]
                                        (items, payments, receipt and measurement print)
src/components/orders/                  constants + payment math, OrderStepsForm, useOrderForm, PaymentModal
src/app/sign-in/page.tsx                Ant Design Pro style sign-in through Refine useLogin

src/components/providers/refine-provider.tsx      <Refine> root (+ AuthSync, BusinessScopeSync)
src/components/providers/color-mode-provider.tsx  light/dark for antd and the legacy pages
src/components/refine/                  shell (header, business switcher, logo) and the shared UX
                                        baseline: FilterBar, ResourceTable (+ TableToolbar),
                                        RowActions, page-parts (FormSection, PageSkeleton, ...),
                                        CardWithTitle, WriteGuard, ChartCard (+ Trend),
                                        PeriodPicker (presets + custom range)
src/components/customers/               customers types, form fields (rules from the zod schema)
src/components/measurements/            measurements types, form fields, CustomerSelect
src/components/vendors/                 constants + zod schemas, vendor form (with tags), CategorySelect,
                                        ManageCategoriesDrawer, VendorTagsEditor, VendorLedgerCard

src/lib/refine/zod-rule.ts              antd Form rule from a zod schema
src/lib/refine/notifications.ts         "<Entity> created/updated/deleted successfully" builders

src/lib/refine/auth-provider.ts         login / logout / check / getIdentity / getPermissions / onError
src/lib/refine/access-control.ts        role rules (canRoleAccess) + accessControlProvider
src/lib/refine/resources.tsx            resources: routes, labels, icons, sidebar order
src/lib/refine/data-provider.ts         @refinedev/supabase wrapped with business scoping
src/lib/refine/business-scope.ts        membership ids for the "All businesses" view
src/lib/refine/theme.ts                 antd theme: ACCENT, light/dark algorithm, tokens
src/lib/refine/reporting.ts             typed React Query hooks over the reporting functions
src/lib/auth/role.ts                    role lookup + cache shared by AuthContext and Refine
```

## Providers

| Provider | Implementation |
| --- | --- |
| routerProvider | `@refinedev/nextjs-router` (App Router) |
| dataProvider | `@refinedev/supabase` on the shared browser client (`src/lib/supabase-client.ts`), so requests carry the user's JWT and RLS applies. Wrapped in `data-provider.ts` (see Business scoping). |
| authProvider | Supabase email + password on the same client. `check` redirects to `/sign-in`. `getPermissions` returns `public.users.role` (`admin` or `staff`, `staff` on any failure, as before). |
| accessControlProvider | `access-control.ts` |
| notificationProvider | `useNotificationProvider` from `@refinedev/antd`, inside antd `<App>`. Legacy pages keep their sonner toasts. |
| React Query | Refine is given the app's existing `QueryClient` (`options.reactQuery.clientConfig`), so the Refine hooks and the legacy `useQuery` hooks share one cache. A business switch clears that cache for both. |

Refine telemetry is disabled (`disableTelemetry: true`).

`AuthSync` re-runs Refine's auth and access checks when the session or role changes (sign-out
in another tab, role refresh). The legacy `AuthContext` stays because the business context and
legacy pages read it. Both resolve the role through `src/lib/auth/role.ts`, so they agree.

The sign-in page handles the post-login redirect itself and does not use Refine's default
`?to=` redirect, which is unvalidated. Only `/oauth/consent?authorization_id=…` may be
returned to, as before.

## Theme, accent and dark mode

- Base theme: `RefineThemes.Blue` through antd `ConfigProvider` (`getAntdTheme` in `src/lib/refine/theme.ts`).
- **To change the accent**, edit `ACCENT` in `src/lib/refine/theme.ts`, for example
  `RefineThemes.Purple.token?.colorPrimary` or any hex value. The sidebar highlight, buttons,
  links, tags and dashboard charts all read the antd token, so nothing else needs to change.
- **Light / dark**: `next-themes` is the single source of truth. It saves the choice in
  `localStorage` (`theme`), follows `prefers-color-scheme` while nothing is saved
  (`defaultTheme="system"`), and sets the `dark` class used by the legacy shadcn pages.
  `ColorModeProvider` passes the resolved mode to antd (`theme.darkAlgorithm` /
  `theme.defaultAlgorithm`). The header toggle switches both UI kits together.
- **Tailwind v4 and antd**: `AntdRegistry layer` puts every antd style into `@layer antd`, and
  `globals.css` begins with `@layer theme, base, antd, components, utilities;`. Preflight
  (`base`) therefore cannot reset antd components, and Tailwind utilities can still adjust an
  antd element. The legacy base rules for links and 44px touch targets apply outside the antd
  UI (`.ar-antd`) and inside legacy pages (`.legacy-page`, set by the dashboard layout).
- Card look: use `CardWithTitle` (icon + title on the left, optional action on the right, soft
  shadow) and `ChartCard` (title with info tooltip, big number, trend, mini area/bar chart, footer).

## Access control (roles)

Which roles may open a module is defined once, in `NAV_ITEMS`
(`src/components/dashboard/nav-items.ts`). `resources.tsx` copies those roles into each
resource's `meta.roles`.

| Resource | Route(s) | Roles |
| --- | --- | --- |
| dashboard | `/` | admin |
| customers | `/customers`, `/customers/create`, `/customers/edit/:id`, `/customers/show/:id` | admin, staff |
| orders | `/orders`, `/orders/create`, `/orders/edit/:id`, `/orders/show/:id` | admin, staff (delete: admin) |
| payments | (no pages; on the order page and the header "Add New Payment") | read: admin, staff; write: admin |
| measurements | `/measurements`, `/measurements/create`, `/measurements/edit/:id`, `/measurements/show/:id` | admin, staff |
| vendors | `/vendors`, `/vendors/create`, `/vendors/edit/:id`, `/vendors/show/:id` | admin |
| vendor_tags, vendor_categories | (no pages; managed from Vendors) | admin |
| ledger | `/ledger` | admin |
| pnl | `/pnl` | admin |

Rules (`canRoleAccess`), matching the database policies in
`supabase/migrations/20261119000000_role_scoped_rls.sql` (verify with
`supabase/tests/role_scoped_rls_check.sql`):

1. Unknown resource, or no role: denied.
2. Role not in `meta.roles`: denied.
3. Per-action roles from `meta.actionRoles`:
   - **Delete** on customers, orders and measurements is admin-only.
   - **Payments** (a resource without a page): readable by members; create, edit and delete are admin-only. The header's "Add New Payment" button follows this rule.
   - Everything else in an allowed module is open to both roles.
4. In the admin "All businesses" view, `create` / `edit` / `delete` / `clone` on a business-scoped resource is denied with the read-only reason. This matches `authFetch` and the API.

Where the rules apply:

- **Sidebar:** `ThemedSider` wraps every item in `CanAccess`, so staff never see Dashboard, Vendors, Ledger or P&L.
- **Buttons:** Refine buttons (`CreateButton`, `EditButton`, `DeleteButton`, `ShowButton`) and the table `RowActions` are disabled with the reason as a tooltip when not allowed (e.g. staff: "Only an admin can delete this").
- **Create/edit pages:** wrapped in `WriteGuard`, which shows the reason instead of the form.
- **Dashboard:** wrapped in `CanAccess` and sends other roles to `/customers`.
- **Admin-only pages (Vendors):** wrapped in `ResourceGuard`, which shows a 403 result with a "Go to Customers" button for other roles (direct or shared URLs).
- **Ledger and P&L:** wrapped in `CanAccess` with a 403 result. The reporting functions refuse non-admins as well (42501), so a direct URL shows no data either.
- **Legacy pages:** keep their `RoleGuard`.

Hiding UI is only an affordance. The API and RLS still enforce everything.

## Business scoping

The switcher's options come from `src/lib/business-memberships.ts`. It reads `user_businesses`
joined to `businesses` with the browser client and the user's session (RLS: own rows,
member-readable businesses). It returns the same shape and ordering as `GET /api/me/businesses`
(active only, ATC first then by name, ATC as default, `canViewAll` for admins with more than
one business). The Refine shell, Customers and Dashboard therefore never need the
service-role API. That route is unchanged for the mobile app.

`data-provider.ts` applies these rules to every scoped table (customers, orders, measurements,
vendors, payments, general_ledger, vendor_ledger), mirroring `src/lib/business-context.ts`:

- **Reads:** filtered to `business_id IN (selected business)`, or to all of the user's memberships in "All businesses".
- **Inserts:** stamped with the selected `business_id`. A `business_id` sent by the caller is ignored.
- **Updates and deletes:** match `id` and `business_id`. A row from another business returns 404.
- **"All businesses" view:** writes are refused.

The selected business comes from `src/lib/business-store.ts`, the same value `authFetch` sends as `X-Business-Id`.

Resource-specific rules mirror the API routes and live in `RULES`:

- **Customers:** a duplicate phone (unique `(business_id, phone)`) becomes "Phone number already exists". The message also appears inline on the phone field.
- **Customers:** an empty address is stored as `null`.
- **Customers:** delete is refused with "Customer has orders; reassign or delete orders first" when the customer has orders.
- **Measurements:** empty readings and notes are stored as `null`. Saving a set with "Set as Default" on clears the flag on that customer's other sets in the same business, as `src/app/api/measurements/**` does (two writes, not atomic, same as the API). The customer must be in the business: the picker only offers scoped customers, and the `enforce_business_scope` trigger rejects a cross-business link.

### Virtual filters

List filters use form field names that are not columns. `data-provider.ts` expands them into
real filters before querying. Because the form field name equals the filter's `field`,
Refine's `syncWithLocation` restores the filter form from the URL with no extra code.

| Field | Where | Expands to |
| --- | --- | --- |
| `created_range` | every scoped table | `created_at >= start` and `created_at <= end` (ISO strings) |
| `q` | customers | name ilike *term* OR phone like *term* (same as `GET /api/customers?q=`) |
| `q` | measurements | measurement name ilike *term* |
| `customer` | measurements | customer name or phone contains *term*, resolved to `customer_id IN (...)` within the scope (PostgREST cannot OR across an embedded table) |
| `q` | vendors | as the previous list: a term that is exactly a category name means that category; otherwise name, notes, contact person, phone or category name contains *term* |
| `tag` | vendors | vendors with a tag containing *term*, resolved to `id IN (...)` |

The vendors category filter uses the real column (`category_id`), so it needs no expansion.

## Vendors (admin only)

- **Data access.** Vendors, tags and categories are read and written through the Supabase data provider (RLS: admin-only; categories are readable by every signed-in user). Rules in `RULES`, mirroring `src/app/api/vendors/**`, `vendor-tags/**` and `vendor-categories/**`:
  - **vendors:** strings trimmed and empty optional fields stored as `null`. A vendor always has a category; when none is chosen it is Uncategorized (fixed id `00000000-0000-0000-0000-000000000000`, the column default). If the database refuses a delete because ledger rows reference the vendor, the message is "This vendor has ledger entries and cannot be deleted."
  - **vendor_tags:** no `business_id` (RLS scopes a tag through its vendor). Writes are refused in "All businesses". A duplicate tag on one vendor gives "Tag already exists for this vendor".
  - **vendor_categories:** one list shared by every business.
    - Add/rename: trimmed, required, max 120, unique ignoring case ("A category with that name already exists").
    - Archive/restore: sets or clears `archived_at`.
    - Delete: a used category is refused by the database (both foreign keys are `ON DELETE RESTRICT`), with "This category is in use and cannot be deleted. Archive it instead."
    - No API needed: the API's extra delete step is only a pre-count, and rename does not touch the ledger in either path, so writing the table directly has the same effect.
    - Difference from the API: the delete message has no counts. The browser cannot count other businesses' vendors or the ledger.
    - Not editable from "All businesses", as before.
    - Uncategorized cannot be archived or deleted from the app (it is the default every vendor falls back to).
- **Tags** are edited on the vendor form (`Select mode="tags"`, saved after the vendor) and on the vendor page (add with suggestions, remove with confirmation).
- **Ledger and bills.** `vendor_ledger` / `general_ledger` have no direct client access by design, so the vendor page keeps `GET /api/vendor-ledger` and the existing shadcn `VendorBillDialog` (`POST /api/vendor-ledger`). Without the API (e.g. locally with no service-role key) the card says the ledger is unavailable, and Create Bill is disabled; details and tags still work. The totals and running balance are as on the previous page.
- **List.** There is no balance column, as on the previous list (no ledger reads needed).

## Orders and payments

### Database functions (`supabase/migrations/20261119000100_order_payment_functions.sql`)

All are `SECURITY DEFINER` (`search_path = public, pg_temp`), executable by `authenticated`
only, and do every write of one operation in one transaction. They raise SQLSTATE `42501`
(not signed in, no role, not a member, admin only), `P0002` (not found), `22023` / `23514`
(invalid input). The data provider maps these to 403 / 404 / 400 with the function's message.

| Function | Mirrors | Who | Writes |
| --- | --- | --- | --- |
| `create_order(p_business_id, p_order, p_items, p_advance)` | POST /api/orders | admin, staff (member) | order (number `<code>-#####`, race-free under an advisory lock), items, advance → `general_ledger` ("Advance payment for Order #n") |
| `update_order(p_order_id, p_patch, p_items)` | PATCH /api/orders/[id] | admin, staff (member) | order fields present in the patch, items replaced when given, advance ledger row kept in step |
| `delete_order(p_order_id)` | DELETE /api/orders/[id] | admin (member) | order, its items, payments and `order_payment` ledger rows |
| `record_payment(p_order_id, p_payment)` | POST /api/payments | admin (member) | payment + ledger row ("Payment for Order #n", notes or "Payment via <method>") |
| `update_payment(p_payment_id, p_patch)` | PATCH /api/payments/[id] | admin (member) | payment fields + its ledger row |
| `delete_payment(p_payment_id)` | DELETE /api/payments/[id] | admin (member) | payment + its ledger row |

Running balances are kept by the existing `general_ledger` triggers. `supabase/tests/order_payment_functions_check.sql`
exercises all of them as the disposable admin and staff users inside a transaction that rolls back.

**Deliberate differences from the API** (also in the migration header):
- **Atomic writes:** all writes of one operation are in one transaction. The API keeps a payment whose ledger insert failed, and keeps an order whose items or advance failed.
- **Ledger kept in step:** order advance edits, payment edits and deletes, and order deletes update or remove the matching ledger rows immediately. These are the rows `POST /api/general-ledger/sync-payments` would produce; the API leaves the ledger stale until that sync runs.
- **Admin-only operations:** deleting orders and all payment writes are admin-only, as in RLS. The API routes still allow staff.
- **Partial updates:** `update_order` changes only the keys sent. The API's PATCH nulls amounts, method and measurement when they are absent from the body.
- **Balance on create:** `create_order` stores `total - advance` as the balance when none is sent.
- **No payments row for the advance:** as in the API, the advance lives on the order and in the ledger only.

### UI

- **Data provider:** `orders` and `payments` writes go through `writeVia` in `data-provider.ts` (`supabase.rpc`). Refine's `useForm`, `useDelete`, `RowActions` and `PaymentModal` therefore all use the functions, and Refine invalidates the lists as usual. Reads are plain RLS-scoped selects.
- **List filters:**
  - "Order number or customer" (virtual `q`: order number contains the term, or the customer's name/phone does).
  - Status: defaults to In Process, as before. Typing a search switches it to All Orders.
  - Delivery date and Booking date ranges (virtual `delivery_range` / `booking_range`).
- **List sorting:** delivery date (default, ascending), booking date or created. Payment status is computed per row: paid = advance + payments, then Paid / Partial / Unpaid / No total.
- **Create/edit:** antd `Steps`, mirroring the previous multi-step form.
  - **General Information:** customer, dates, status, comments, and up to 4 items with unique types.
  - **Measurements:** the customer's default set is preselected; "New measurement" opens a modal with the measurement form. Also fitting preferences.
  - **Payment:** method, total, advance, and a calculated balance.
  - **Navigation:** Next validates the current step; Enter moves on; submitting validates every step. `/orders/create?customer_id=` preselects the customer.
- **Show page:**
  - Totals, details, items, and the payments table.
  - Payment actions: "Record Payment", edit and delete (admin; disabled with a tooltip for staff).
  - Printing: "Print Receipt" (existing `openPrintPreview`) and "Print Measurement" when a set is linked.
- **Header:** "Create New Order" opens `/orders/create`. "Add New Payment" opens the payment modal with an order picker (admin only).

## Reports: Dashboard, Ledger and P&L (admin only)

### Database functions (`supabase/migrations/20261119000200_reporting_functions.sql`)

`general_ledger` and `vendor_ledger` have no client grants, and reports need exact totals (no
1,000-row cap), so the three report screens read through read-only functions. All are `STABLE`,
`SECURITY DEFINER` (`search_path = public, pg_temp`), executable by `authenticated` only, and
check `current_user_is_admin()` and that every requested business id is one of
`current_user_business_ids()` (SQLSTATE `42501` otherwise). They take an array of business ids:
the selected business, or every membership in "All businesses". Dates are inclusive; "today" is
Asia/Karachi.

| Function | Returns | Mirrors |
| --- | --- | --- |
| `dashboard_summary(p_business_ids, p_from, p_to)` | jsonb: customers, orders (total, in range, by status), revenue in range, cash received (advances / payments / total), outstanding, 12-month series, top 5 customers, upcoming and overdue deliveries | `/api/dashboard-stats` where a figure exists (differences below) |
| `ledger_entries(p_business_ids, p_from, p_to, p_search, p_entry_type, p_vendor_id, p_limit, p_offset, p_vendor_category_id)` | jsonb `{rows, total, combined, opening_balance, totals: {debit, credit, net, entry_count}}` | `ledger-service.ts`: `listLedgerEntries` (filters, newest first), `getRangeRunningBalances` (`range_balance`, one business only) and `getLedgerTotals` (date range only) |
| `pnl_input(p_business_ids, p_from, p_to)` | jsonb `{orders, payments, ledger, vendorLedger, vendors}` | `/api/pnl` `fetchRows`, for both bases at once |

`supabase/tests/reporting_functions_check.sql` impersonates disposable admin and staff users
inside a transaction that rolls back: staff gets 42501 from all three, an admin asking for a
business they don't belong to gets 42501, and the admin's figures equal direct sums (cash received
= advances + payments, ledger debit / credit / count, running balance, opening balance).

`src/lib/refine/reporting.ts` wraps them in React Query hooks (`useDashboardSummary`,
`useLedgerPage`, `usePnlInput`, query key `['report', fn, businessIds, args]`). If the migration
has not been applied (PostgREST `PGRST202`), the screens say so instead of failing silently.

### Dashboard (`/`)

- **Period:** `PeriodPicker` (This Month / This Quarter / This Year / Custom), default This Month. Trends compare with the previous month / quarter / year, or the same number of days before a custom range.
- **KPI cards:** Revenue (orders booked in the period), Cash received (advances + later payments, split in the footer), Orders (booked in the period), Outstanding balance (unpaid on every order that is not Cancelled, today). The first three have a trend and a 12-month mini chart; Outstanding shows customers and overdue deliveries instead (it is a balance today, not a period figure).
- **Sales card:** tabs Revenue / Orders with a 12-month bar chart and "Top customers by order value" for the period.
- **Upcoming deliveries (next 14 days):** In Process orders, nearest first, with the balance due, plus a warning for overdue ones, and "See all orders".
- Loading skeletons, empty states and light/dark come from antd. The old capped client-side series are gone; every figure is computed in SQL.
- `/overview` (link "Open the classic overview") keeps the previous screen over `/api/dashboard-stats`.

**Differences from `/api/dashboard-stats`** (also in the migration header):
- **Cash received:** `advance_paid` (by booking date) + `payments.amount` (by payment date), the money definition used by P&L. The API's "Total received" is ledger debit − credit over every entry, vendor payments included (returned as `ledger_net`).
- **Outstanding:** Σ max(total − advance − payments, 0) per order that isn't Cancelled. The API reports total revenue − ledger net (returned as `outstanding_api`).
- **Revenue:** for the selected period. The API reports all-time (returned as `revenue_all_time`).
- **Upcoming:** In Process orders due in the next 14 days, up to 10. The API listed the next 5 orders that weren't Cancelled.
- **Series:** 12 months of order value and cash. The API charted 6 months of ledger `order_payment` debits.

### Ledger (`/ledger`)

- **Reads:** `ledger_entries`, paged on the server (page and size in the URL with the filters: `from`, `to`, `q`, `type`, `vendor`, `category`).
- **Filters** ("Ledger filters"): Dates (range picker with Last 7 days / Last 30 days / This month / This year presets), Search particulars, Entry type, Vendor, Category.
- **Table** (`ResourceTable`, key `ledger`): Date, Particulars (links to the order), Type, Vendor / Category, Debit, Credit, Balance (the running balance within the date range, as before; Business instead in "All businesses"), Notes (hidden by default), Actions. Sticky header, density and column settings. Summary rows: opening balance, totals for the dates, closing balance.
- **Stat cards:** Total Debit, Total Credit, Current Balance (Net in "All businesses"), Total Entries, over the date range only, as `/api/general-ledger/stats`.
- **Export CSV:** every row of the current filter (same columns as the previous export).
- **Writes stay on the API:** Add Entry and edit use the existing `LedgerEntryDialog` (`POST` / `PATCH /api/general-ledger`), delete uses `DELETE /api/general-ledger/[id]`, and Sync payments uses `POST /api/general-ledger/sync-payments`. Running balances are maintained by triggers and the API owns those writes. Without the service-role key (locally) the read side works and a failed write shows "The ledger service could not save this change". Order payment rows are not editable here, as before (edit the payment on the order).

### P&L (`/pnl`)

- `pnl_input` returns the API's rows for the period; `computePnl` from `src/lib/pnl.ts` (unchanged) builds the statement in the browser. Switching basis needs no new request.
- **Controls:** Basis (Cash basis / Accrual basis) and Period (This Month / This Quarter / This Year / Custom).
- **Cards:** Statement (Revenue, Cost of sales / production, Gross profit, Staff, Overheads, Other expenses, Other income, Net profit), By month (revenue and net profit chart), Monthly breakdown table with a period total row, Not in profit (opening balances, owner withdrawals, transfers, and in accrual the vendor payments replaced by bills), Read this with the figures (limitations and unknown categories).
- Same figures as `GET /api/pnl` for the same business, basis and dates.

## UX baseline (Ant Design Pro patterns)

Shared components in `src/components/refine/`, used by Customers and Measurements:

- **Page header** (Refine `List` / `Create` / `Edit` / `Show`): breadcrumb, title, subtitle (`withSubtitle(...)`), actions on the right. Content is a stack of cards on the gray page (`transparentContent`). Subtitles are hidden below 768px so the title keeps its room.
- **`FilterBar`**: query form above the table. Fields sit in a responsive grid (stacked on phones), with Search, Reset, and Expand / Collapse when there are more than two fields. It is wired to `useTable`'s `onSearch` (server-side), and with `syncWithLocation` the filters, sort and page live in the URL. `DateRangeFilter` + `dateRangeItemProps` keep a date range as ISO strings, so it survives the URL round trip.
- **`ResourceTable`**: card + toolbar + table.
  - **Toolbar:** Refresh, Density (Default / Medium / Compact), and Column settings (show/hide, All columns, Reset).
  - **Persistence:** density and hidden columns are saved in `localStorage` under `ar-table:<tableKey>`.
  - **Table:** sticky header under the shell header, horizontal scroll, page-size changer, and an `Empty` state with a call to action.
  - **Phones:** below 768px the table collapses into a list of cards (`renderMobile`).
- **`RowActions`**: inline View / Edit / Delete with Popconfirm on delete. Each action is checked with the access control provider; a denied action stays visible but disabled, with the reason as its tooltip.
- **Forms**: sections in cards (`FormSection`), first field auto-focused, Enter submits (`EnterToSubmit`, since Refine's Save button is outside the `<form>`), validation from the API's zod schemas (`zodRule`), success/error notifications from `notifications.ts`. Edit and show pages show a `PageSkeleton` while loading; the edit form stays mounted (hidden) so Refine can fill it.
- **Sign-in**: centred card with the AR Studio mark, Email / Password with icons, an inline error `Alert`, and a loading Sign In button. Works in light and dark mode.

## Porting the next module

1. Add any extra routes (`create`, `edit`, `show`) to the module's entry in `MODULES` in `src/lib/refine/resources.tsx`. Roles stay in `NAV_ITEMS`.
2. If the table has resource-specific rules (error wording, delete preconditions, value normalisation), add them to `RULES` in `data-provider.ts`. Scoping is already automatic for the scoped tables.
3. Build the pages with `List` / `Create` / `Edit` / `Show` and `useTable` / `useForm` / `useShow` from `@refinedev/antd`, following `src/app/(dashboard)/measurements/**`:
   - **List:** `FilterBar` + `ResourceTable` + `RowActions`, with `syncWithLocation: true`. Name filter fields after virtual filters.
   - **Create/edit:** `FormSection`s, `EnterToSubmit`, `PageSkeleton`, and `WriteGuard`.
   - **Validation:** `zodRule` over the API's zod schema.
4. Add the module's base path to `REFINE_MODULES` in `src/app/(dashboard)/layout.tsx` so the legacy styles stop applying there.
5. Remove the module's `RoleGuard`, its `use-api` hooks and its shadcn components once nothing else imports them.
6. Run `npx tsc --noEmit`, `npm run lint`, `npm run build`.

Multi-table writes that must be atomic (orders with items and payments, ledger postings,
running balances) should keep going through the existing API routes, for example via a Refine
`custom` call, rather than through several client-side writes.

## Deferred

- **API vs database roles:** the API routes still allow staff to delete orders and measurements and to record payments (`requireBusiness` defaults to admin + staff). They use the service role, so the new policies don't reach them. Legacy pages that call those routes therefore still allow it until the routes or the pages are changed.

- **Vendor ledger and bills:** still on `/api/vendor-ledger` and the shadcn `VendorBillDialog` (see Vendors). Porting them needs a server-side path for ledger writes (the running balance is maintained by database triggers and must stay atomic). The ledger card filters entries client-side, as before.
- **Vendor list:** the `tag` and `q` filters resolve at most 1000 matching tags or categories.
- **Ledger writes:** add / edit / delete / sync on `/ledger` still use the `/api/general-ledger` routes and the shadcn `LedgerEntryDialog`. Moving them needs atomic write functions like the order ones.
- **Reporting functions:** written against the API and the migrations in this repo. Run `supabase/tests/reporting_functions_check.sql` after applying.
- **Orders "Nearest delivery" sort:** the previous list put upcoming deliveries first and past-due ones after, using three server queries. The Refine list sorts by delivery date ascending, so past-due orders come first. The delivery date is shown in red when an In Process order is late. Restoring the exact order needs a sort expression, which means a view or function.
- **`orders_with_payment_status` view:** not used. Its definition is not in the repo, so the list computes payment status from the order and its payments, with the same formula as the receipt.
- **Order functions:** written against the API and the migrations in this repo. The base table definitions (column types, foreign-key actions) predate `supabase/migrations`, so run `supabase/tests/order_payment_functions_check.sql` after applying.
- **OAuth consent:** untouched (shadcn).
- **Sign-in "Remember me":** not added. Supabase always keeps the session in `localStorage`, so the checkbox would have had no effect.
- **Measurement print:** reuses `PrintMeasurement` / `openMeasurementPrintPreview`. `order` is now optional, so a measurement prints on its own (no order number or items). The print window still loads Tailwind from `cdn.tailwindcss.com`, as before, so it needs network access.
- **Measurement list sorting by customer** is not offered (PostgREST orders embedded rows, not parents). The customer filter resolves at most 1000 matching customers.
- **Phone layout:** the shell uses Refine's drawer menu on phones. The previous bottom tab bar is gone; `tab` / `tabLabel` in `NAV_ITEMS` are kept for a possible custom tab bar.
- **Notifications bell:** static.
- **e2e tests:** the Playwright specs in `e2e/` select elements of the old shadcn sidebar and tab bar (`nav.spec.ts`, `states.spec.ts`, `workflows.spec.ts`, `dialogs.spec.ts`, `pwa.spec.ts`) and need updating for the antd shell.
- **Unused code to delete when modules are ported:**
  - `src/hooks/use-api.ts` now holds only `useDashboardStats` (for `/overview`); delete it with `/overview`.
  - `src/lib/vendor-filter.ts`, kept for `scripts/checks/filters.check.ts`.
  - `itemsFor` / `tabItemsFor` / `moreItemsFor` in `nav-items.ts`.
  - The payment types in `validators.ts` used only by the removed dialogs.
  - `src/components/data-table/data-table.tsx`, still used by legacy pages.
- **Existing auth wait:** `AuthContext` awaits the role lookup inside Supabase's `onAuthStateChange`, which can hold the first session read for up to the 10 s role timeout if that query hangs. The previous guard waited on the same path; changing it means touching `AuthContext` timing and was left as is.
