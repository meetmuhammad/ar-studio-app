# Refine app shell

The root Next.js 15 App Router app is a Refine app. Refine (`@refinedev/core` 5) with the
Ant Design UI kit (`@refinedev/antd` 6, `antd` 5) provides the shell (sidebar, header, theme),
auth, access control and data access. Customers, Measurements, the Dashboard and the sign-in
page are fully on Refine + antd. Orders, Vendors, Ledger and P&L are still the previous shadcn
pages, rendered inside the new shell until they are ported. Refine pages read and write through
the Supabase data provider only (never the service-role `/api` routes).

Nothing under `src/app/api/**`, `src/app/.well-known/**`, `src/app/oauth/**`,
`src/lib/ledger-mcp/**`, `src/lib/ledger-service.ts` or `src/lib/pnl.ts` changed. The mobile
app and the MCP server keep using the API routes exactly as before.

## Structure

```
src/app/layout.tsx                      AntdRegistry(layer) > next-themes > React Query > AuthContext
                                        > ColorModeProvider (antd ConfigProvider + App) > RefineProvider
src/app/(dashboard)/layout.tsx          <Authenticated> + BusinessProvider + ThemedLayout (sider + ShellHeader)
src/app/(dashboard)/page.tsx            Dashboard (Refine + antd, admin only)
src/app/(dashboard)/overview/page.tsx   The previous dashboard, unchanged apart from its title
src/app/(dashboard)/customers/**        list / create / edit/[id] / show/[id] (Refine + antd)
src/app/(dashboard)/measurements/**     list / create[?customer_id=] / edit/[id] / show/[id] (Refine + antd)
src/app/sign-in/page.tsx                Ant Design Pro style sign-in through Refine useLogin

src/components/providers/refine-provider.tsx      <Refine> root (+ AuthSync, BusinessScopeSync)
src/components/providers/color-mode-provider.tsx  light/dark for antd and the legacy pages
src/components/refine/                  shell (header, business switcher, logo) and the shared UX
                                        baseline: FilterBar, ResourceTable (+ TableToolbar),
                                        RowActions, page-parts (FormSection, PageSkeleton, ...),
                                        CardWithTitle, KpiCard, WriteGuard
src/components/customers/               customers types, form fields (rules from the zod schema)
src/components/measurements/            measurements types, form fields, CustomerSelect

src/lib/refine/zod-rule.ts              antd Form rule from a zod schema
src/lib/refine/notifications.ts         "<Entity> created/updated/deleted successfully" builders

src/lib/refine/auth-provider.ts         login / logout / check / getIdentity / getPermissions / onError
src/lib/refine/access-control.ts        role rules (canRoleAccess) + accessControlProvider
src/lib/refine/resources.tsx            resources: routes, labels, icons, sidebar order
src/lib/refine/data-provider.ts         @refinedev/supabase wrapped with business scoping
src/lib/refine/business-scope.ts        membership ids for the "All businesses" view
src/lib/refine/theme.ts                 antd theme: ACCENT, light/dark algorithm, tokens
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
  shadow) and `KpiCard` (icon, title, big number, area sparkline).

## Access control (roles)

Which roles may open a module is defined once, in `NAV_ITEMS`
(`src/components/dashboard/nav-items.ts`). `resources.tsx` copies those roles into each
resource's `meta.roles`.

| Resource | Route(s) | Roles |
| --- | --- | --- |
| dashboard | `/` | admin |
| customers | `/customers`, `/customers/create`, `/customers/edit/:id`, `/customers/show/:id` | admin, staff |
| orders | `/orders` | admin, staff |
| measurements | `/measurements`, `/measurements/create`, `/measurements/edit/:id`, `/measurements/show/:id` | admin, staff |
| vendors | `/vendors`, `/vendors/:id` | admin |
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

## Porting the next module (for example Orders)

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

- **Legacy modules:** Orders, Vendors, Ledger and P&L are still shadcn pages using the `/api` routes. They need the service-role key, so they show errors locally without it. The global "Create New Order" / "Add New Payment" dialogs in the header are also still shadcn, and the order dialog's measurement step still uses the `/api/measurements` routes.
- **OAuth consent:** untouched (shadcn).
- **Sign-in "Remember me":** not added. Supabase always keeps the session in `localStorage`, so the checkbox would have had no effect.
- **Measurement print:** reuses `PrintMeasurement` / `openMeasurementPrintPreview`. `order` is now optional, so a measurement prints on its own (no order number or items). The print window still loads Tailwind from `cdn.tailwindcss.com`, as before, so it needs network access.
- **Measurement list sorting by customer** is not offered (PostgREST orders embedded rows, not parents). The customer filter resolves at most 1000 matching customers.
- **Phone layout:** the shell uses Refine's drawer menu on phones. The previous bottom tab bar is gone; `tab` / `tabLabel` in `NAV_ITEMS` are kept for a possible custom tab bar.
- **Notifications bell:** static.
- **Dashboard series:** sparklines fetch 6 months of rows without pagination, so each series is capped by the PostgREST row limit (1000 by default). Headline counts are exact. "Payments received" sums the `payments` table only; order advances stored on `orders.advance_paid` are not included. Moving the series to SQL aggregates (views or RPC) needs a database change and was out of scope.
- **e2e tests:** the Playwright specs in `e2e/` select elements of the old shadcn sidebar and tab bar (`nav.spec.ts`, `states.spec.ts`, `workflows.spec.ts`, `dialogs.spec.ts`, `pwa.spec.ts`) and need updating for the antd shell.
- **Unused code to delete when modules are ported:**
  - `useCustomers`, `useCreateCustomer`, `useUpdateCustomer`, `useDeleteCustomer` in `src/hooks/use-api.ts`.
  - `itemsFor` / `tabItemsFor` / `moreItemsFor` in `nav-items.ts`.
  - `src/components/dialogs/customer-dialog.tsx` and `src/components/forms/customer-form.tsx`, still used by the order dialog's customer picker.
  - `src/components/data-table/data-table.tsx`, still used by legacy pages.
- **Existing auth wait:** `AuthContext` awaits the role lookup inside Supabase's `onAuthStateChange`, which can hold the first session read for up to the 10 s role timeout if that query hangs. The previous guard waited on the same path; changing it means touching `AuthContext` timing and was left as is.
