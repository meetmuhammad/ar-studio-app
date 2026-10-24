# Graph Report - ar-studio-app  (2026-10-24)

## Corpus Check
- 166 files · ~85,943 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1040 nodes · 2543 edges · 81 communities (43 shown, 38 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `85539f43`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- order-details-dialog.tsx
- payment-dialog.tsx
- cn
- use-api.ts
- (dashboard)/page.tsx
- AR Studio — Design System (Master)
- devDependencies
- createAdminSupabaseClient
- AR Studio - Theming System
- compilerOptions
- OrderWithCustomer
- public.resnapshot_vendor_category
- (dashboard)/layout.tsx
- validators.ts
- orders/page.tsx
- components.json
- AR Dashboard - Customer & Order Management System
- measurements/page.tsx
- 20260827000000_vendor_categories.sql
- dependencies
- database.ts
- customers/[id]/route.ts
- api-auth.ts
- eslint.config.mjs
- dashboard-stats/route.ts
- theme-config.ts
- customers/page.tsx
- support.ts
- proposals.ts
- supabase.ts
- requireAuth
- auth.ts
- date-fns
- @hookform/resolvers
- lucide-react
- next
- next.config.ts
- next-themes
- @radix-ui/react-alert-dialog
- supabase-client.ts
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-label
- @radix-ui/react-popover
- @radix-ui/react-radio-group
- @radix-ui/react-select
- @radix-ui/react-separator
- @radix-ui/react-slot
- @radix-ui/react-switch
- @radix-ui/react-tooltip
- react
- cmdk
- react-hook-form
- recharts
- sonner
- @supabase/ssr
- @supabase/supabase-js
- @tanstack/react-query
- use-debounce
- zod
- postcss.config.mjs
- orders
- button.tsx
- public.vendors
- Ledger MCP pilot
- Compile an Abide rubric
- 20261024000100_ledger_mcp_proposals.sql
- @radix-ui/react-tabs
- react-day-picker
- @tanstack/react-table
- public.general_ledger
- jose
- @modelcontextprotocol/server
- @radix-ui/react-checkbox

## God Nodes (most connected - your core abstractions)
1. `cn()` - 133 edges
2. `createAdminSupabaseClient()` - 75 edges
3. `Button()` - 37 edges
4. `authFetch()` - 30 edges
5. `OrderWithCustomer` - 25 edges
6. `Input()` - 21 edges
7. `Card()` - 20 edges
8. `CardTitle()` - 20 edges
9. `CardContent()` - 20 edges
10. `Badge()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `getOrders()`  [EXTRACTED]
  scripts/check-order-search.ts → src/lib/database.ts
- `main()` --calls--> `createLedgerVerifier()`  [EXTRACTED]
  scripts/ledger-mcp/auth.check.ts → src/lib/ledger-mcp/auth.ts
- `run()` --calls--> `normalizeEntry()`  [EXTRACTED]
  scripts/ledger-mcp/normalize.check.ts → src/lib/ledger-mcp/normalize.ts
- `DashboardLayout()` --calls--> `authFetch()`  [EXTRACTED]
  src/app/(dashboard)/layout.tsx → src/lib/auth-fetch.ts
- `GET()` --calls--> `createAdminSupabaseClient()`  [EXTRACTED]
  src/app/api/customers/[id]/measurements/route.ts → src/lib/supabase.ts

## Import Cycles
- None detected.

## Communities (81 total, 38 thin omitted)

### Community 0 - "order-details-dialog.tsx"
Cohesion: 0.26
Nodes (11): MeasurementSelectDialog(), OrderDetailsDialog(), Payment, VendorBillDialogProps, Dialog(), DialogContent(), DialogDescription(), DialogHeader() (+3 more)

### Community 1 - "payment-dialog.tsx"
Cohesion: 0.19
Nodes (17): RoleGuard(), RoleGuardProps, DataTable(), DataTableProps, globalFilterFn(), Payment, PaymentDialogProps, VendorDialog() (+9 more)

### Community 2 - "cn"
Cohesion: 0.06
Nodes (80): CustomerCombobox(), CustomerComboboxProps, CustomerForm(), LedgerEntryForm(), LedgerEntryInput, LedgerEntrySchema, MeasurementFieldProps, measurementSections (+72 more)

### Community 3 - "use-api.ts"
Cohesion: 0.10
Nodes (28): LedgerPage(), VendorLedgerPage(), LedgerEntryDialog(), VendorBillDialog(), VendorCategoriesDialog(), VendorForm(), DatePicker(), CustomerQueryParams (+20 more)

### Community 4 - "(dashboard)/page.tsx"
Cohesion: 0.06
Nodes (40): DashboardPage(), RevenueOverview(), daysUntil(), DeliveryRow(), DeliveryRowProps, UpcomingOrder, EmptyState(), EmptyStateProps (+32 more)

### Community 5 - "AR Studio — Design System (Master)"
Cohesion: 0.04
Nodes (46): 0b. Visual identity (second pass — locked), 10. Pre-delivery checklist, 1. Color, 2. Typography, 3. Spacing (density 8/10), 4. Elevation & shape, 5. Motion (3/10 — subtle), 6. Interaction & accessibility (non-negotiable) (+38 more)

### Community 6 - "devDependencies"
Cohesion: 0.05
Nodes (40): dotenv, eslint, eslint-config-next, @eslint/eslintrc, @faker-js/faker, @modelcontextprotocol/client, devDependencies, dotenv (+32 more)

### Community 7 - "createAdminSupabaseClient"
Cohesion: 0.12
Nodes (20): DELETE(), GET(), PUT(), RouteParams, GET(), POST(), DELETE(), PATCH() (+12 more)

### Community 8 - "AR Studio - Theming System"
Cohesion: 0.06
Nodes (34): 1. Use Semantic Colors, 2. Consistent Status Colors, 3. Proper Contrast, 4. Theme-aware Custom Styles, Adding New Colors, AR Studio - Theming System, 🎨 Available Colors, Badge Variants (+26 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 10 - "OrderWithCustomer"
Cohesion: 0.08
Nodes (33): CustomerActionsProps, OrderActionsProps, MeasurementSelectDialogProps, OrderDetailsDialogProps, OrderDialogProps, OrderMultiStepFormProps, PrintMeasurement(), PrintMeasurementProps (+25 more)

### Community 11 - "public.resnapshot_vendor_category"
Cohesion: 0.33
Nodes (5): public.resnapshot_vendor_category, public.vendor_categories, public.resnapshot_vendor_category(), public.vendors, trg_resnapshot_vendor_category

### Community 12 - "(dashboard)/layout.tsx"
Cohesion: 0.06
Nodes (34): DashboardLayout(), geistMono, inter, manrope, metadata, afterSignIn(), SignInPage(), RouteGuard() (+26 more)

### Community 13 - "validators.ts"
Cohesion: 0.08
Nodes (23): valid, GET(), POST(), createCustomer(), getCustomers(), CreateCustomerSchema, CreateOrderFields, CreateOrderSchema (+15 more)

### Community 14 - "orders/page.tsx"
Cohesion: 0.48
Nodes (6): OrdersPage(), OrderDialog(), useCreateOrder(), useDeleteOrder(), useOrders(), useUpdateOrder()

### Community 15 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 16 - "AR Dashboard - Customer & Order Management System"
Cohesion: 0.11
Nodes (18): 1. Install Dependencies, 2. Supabase Setup, 3. Seed the Database (Optional), 4. Run the Development Server, 📊 Advanced Features, 📋 API Endpoints, AR Dashboard - Customer & Order Management System, 🧑‍💼 Customer Management (+10 more)

### Community 17 - "measurements/page.tsx"
Cohesion: 0.13
Nodes (23): CustomerWithOrderCount, MeasurementsPage(), CustomerWithOrderCount, CustomerWithOrderCount, CustomerDialogProps, DeleteConfirmationDialogProps, CustomerFormProps, MeasurementForm() (+15 more)

### Community 18 - "20260827000000_vendor_categories.sql"
Cohesion: 0.40
Nodes (5): public.snapshot_vendor_category, public.snapshot_vendor_category(), public.vendor_categories, public.vendors, trg_snapshot_vendor_category

### Community 19 - "dependencies"
Cohesion: 0.22
Nodes (9): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, react-dom, tailwind-merge, react-dom (+1 more)

### Community 20 - "database.ts"
Cohesion: 0.20
Nodes (16): main(), DELETE(), GET(), PATCH(), GET(), POST(), createOrder(), createOrderItems() (+8 more)

### Community 21 - "customers/[id]/route.ts"
Cohesion: 0.36
Nodes (7): DELETE(), GET(), PATCH(), deleteCustomer(), getCustomer(), updateCustomer(), UpdateCustomerSchema

### Community 22 - "api-auth.ts"
Cohesion: 0.18
Nodes (15): DELETE(), GET(), PUT(), GET(), POST(), POST(), GET(), POST() (+7 more)

### Community 23 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 24 - "dashboard-stats/route.ts"
Cohesion: 0.70
Nodes (4): buildChartData(), GET(), getFirstDayOfMonth(), getSixMonthsAgo()

### Community 26 - "customers/page.tsx"
Cohesion: 0.31
Nodes (9): CustomersPage(), createCustomerColumns(), CustomerDetailDialog(), CustomerDialog(), DeleteConfirmationDialog(), useCreateCustomer(), useCustomers(), useDeleteCustomer() (+1 more)

### Community 27 - "support.ts"
Cohesion: 0.09
Nodes (45): assertWritableDb(), supabase, main(), R, say(), forgedJwt(), ledgerFingerprint(), main() (+37 more)

### Community 28 - "proposals.ts"
Cohesion: 0.10
Nodes (40): good, problems(), run(), GET(), businessToday(), centsToDecimal(), CURRENCY, Direction (+32 more)

### Community 29 - "supabase.ts"
Cohesion: 0.17
Nodes (9): GET(), RouteParams, Counter, Customer, Order, OrderWithCustomer, supabase, User (+1 more)

### Community 31 - "requireAuth"
Cohesion: 0.26
Nodes (9): GET(), DELETE(), PATCH(), IMPORTANT: Prepare update data - ONLY update payments table fields, GET(), POST(), IMPORTANT: We are creating a NEW payment in the payments table, requireAuth() (+1 more)

### Community 32 - "auth.ts"
Cohesion: 0.14
Nodes (21): RFC-8707, RFC-9728, main(), dynamic, handler, serve(), dynamic, GET() (+13 more)

### Community 40 - "supabase-client.ts"
Cohesion: 0.11
Nodes (20): LedgerEntryDialogProps, VendorDialogProps, LedgerEntryFormProps, VendorFormProps, Counter, GeneralLedger, GeneralLedgerWithRelations, LedgerEntryType (+12 more)

### Community 65 - "button.tsx"
Cohesion: 0.22
Nodes (12): Details, CustomerDetailDialogProps, CustomerOrder, OrderMultiStepForm(), steps, Badge(), badgeVariants, Button() (+4 more)

### Community 69 - "Ledger MCP pilot"
Cohesion: 0.17
Nodes (11): Authentication, Demo conversation, Files, Ledger MCP pilot, Prepare → confirm → commit, Release blockers (not shortcuts to be waived), Run it locally (isolated database only), The limit of "confirmation" (+3 more)

### Community 70 - "Compile an Abide rubric"
Cohesion: 0.20
Nodes (9): Compile an Abide rubric, Step 1. Read the sources, Step 2. Extract every statement that instructs, Step 3. Classify each rule into exactly one bucket, Step 4. Write the question for each model rule, Step 5. Decide when each model rule runs, Step 6. Write the rubric file, Step 7. Validate, then calibrate (+1 more)

### Community 71 - "20261024000100_ledger_mcp_proposals.sql"
Cohesion: 0.22
Nodes (6): auth.users, public.ledger_mcp_set_payload_hash, public.ledger_mcp_audit, public.ledger_mcp_proposals, public.general_ledger, trg_ledger_mcp_payload_hash

## Knowledge Gaps
- **317 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+312 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **38 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAdminSupabaseClient()` connect `createAdminSupabaseClient` to `auth.ts`, `validators.ts`, `database.ts`, `customers/[id]/route.ts`, `api-auth.ts`, `dashboard-stats/route.ts`, `proposals.ts`, `supabase.ts`, `requireAuth`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `cn()` connect `cn` to `order-details-dialog.tsx`, `button.tsx`, `payment-dialog.tsx`, `use-api.ts`, `(dashboard)/page.tsx`, `OrderWithCustomer`, `(dashboard)/layout.tsx`, `measurements/page.tsx`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `OrderWithCustomer` connect `OrderWithCustomer` to `order-details-dialog.tsx`, `payment-dialog.tsx`, `cn`, `button.tsx`, `use-api.ts`, `supabase-client.ts`, `orders/page.tsx`, `database.ts`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _317 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.05526083112290009 - nodes in this community are weakly interconnected._
- **Should `use-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1036036036036036 - nodes in this community are weakly interconnected._
- **Should `(dashboard)/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.06464646464646465 - nodes in this community are weakly interconnected._