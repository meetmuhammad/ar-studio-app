# Graph Report - ar-studio-app  (2026-10-04)

## Corpus Check
- 142 files · ~63,015 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 861 nodes · 2068 edges · 69 communities (33 shown, 36 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a8cbea48`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cn
- payment-dialog.tsx
- measurements-step.tsx
- use-api.ts
- (dashboard)/page.tsx
- AR Studio — Design System (Master)
- devDependencies
- createAdminSupabaseClient
- AR Studio - Theming System
- compilerOptions
- supabase-client.ts
- public.resnapshot_vendor_category
- (dashboard)/layout.tsx
- validators.ts
- supabase.ts
- components.json
- AR Dashboard - Customer & Order Management System
- alert-dialog.tsx
- 20260827000000_vendor_categories.sql
- dependencies
- database.ts
- customers/[id]/route.ts
- api-auth.ts
- eslint.config.mjs
- dashboard-stats/route.ts
- theme-config.ts
- payments/[id]/route.ts
- assert-writable-db.ts
- payments/route.ts
- tailwind-merge
- clsx
- cmdk
- date-fns
- @hookform/resolvers
- lucide-react
- next
- next.config.ts
- next-themes
- @radix-ui/react-alert-dialog
- @radix-ui/react-checkbox
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
- react-dom
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
- public.general_ledger
- public.vendors

## God Nodes (most connected - your core abstractions)
1. `cn()` - 133 edges
2. `createAdminSupabaseClient()` - 65 edges
3. `Button()` - 36 edges
4. `OrderWithCustomer` - 25 edges
5. `Input()` - 21 edges
6. `Badge()` - 19 edges
7. `Card()` - 19 edges
8. `CardTitle()` - 19 edges
9. `CardContent()` - 19 edges
10. `CardHeader()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `getOrders()`  [EXTRACTED]
  scripts/check-order-search.ts → src/lib/database.ts
- `GET()` --calls--> `createAdminSupabaseClient()`  [EXTRACTED]
  src/app/api/customers/[id]/measurements/route.ts → src/lib/supabase.ts
- `GET()` --calls--> `createAdminSupabaseClient()`  [EXTRACTED]
  src/app/api/general-ledger/stats/route.ts → src/lib/supabase.ts
- `POST()` --calls--> `createAdminSupabaseClient()`  [EXTRACTED]
  src/app/api/general-ledger/sync-payments/route.ts → src/lib/supabase.ts
- `PATCH()` --calls--> `createAdminSupabaseClient()`  [EXTRACTED]
  src/app/api/payments/[id]/route.ts → src/lib/supabase.ts

## Import Cycles
- None detected.

## Communities (69 total, 36 thin omitted)

### Community 0 - "cn"
Cohesion: 0.06
Nodes (47): CustomerComboboxProps, CustomerDialog(), LedgerEntryDialog(), LedgerEntryDialogProps, VendorBillDialog(), VendorBillDialogProps, VendorDialog(), CustomerForm() (+39 more)

### Community 1 - "payment-dialog.tsx"
Cohesion: 0.09
Nodes (48): MeasurementsPage(), RoleGuard(), RoleGuardProps, CustomerActionsProps, OrderActionsProps, DataTable(), DataTableProps, globalFilterFn() (+40 more)

### Community 2 - "measurements-step.tsx"
Cohesion: 0.09
Nodes (52): CustomerCombobox(), LedgerEntryInput, LedgerEntrySchema, MeasurementFieldProps, measurementSections, MeasurementForm(), OrderFormProps, ORDER_TYPES (+44 more)

### Community 3 - "use-api.ts"
Cohesion: 0.07
Nodes (38): CustomersPage(), CustomerWithOrderCount, LedgerPage(), OrdersPage(), createCustomerColumns(), CustomerWithOrderCount, CustomerDetailDialog(), CustomerWithOrderCount (+30 more)

### Community 4 - "(dashboard)/page.tsx"
Cohesion: 0.07
Nodes (39): DashboardPage(), RevenueOverview(), daysUntil(), DeliveryRow(), DeliveryRowProps, UpcomingOrder, EmptyState(), EmptyStateProps (+31 more)

### Community 5 - "AR Studio — Design System (Master)"
Cohesion: 0.04
Nodes (46): 0b. Visual identity (second pass — locked), 10. Pre-delivery checklist, 1. Color, 2. Typography, 3. Spacing (density 8/10), 4. Elevation & shape, 5. Motion (3/10 — subtle), 6. Interaction & accessibility (non-negotiable) (+38 more)

### Community 6 - "devDependencies"
Cohesion: 0.05
Nodes (38): dotenv, eslint, eslint-config-next, @eslint/eslintrc, @faker-js/faker, devDependencies, dotenv, eslint (+30 more)

### Community 7 - "createAdminSupabaseClient"
Cohesion: 0.09
Nodes (26): DELETE(), GET(), PUT(), GET(), POST(), DELETE(), GET(), PUT() (+18 more)

### Community 8 - "AR Studio - Theming System"
Cohesion: 0.06
Nodes (34): 1. Use Semantic Colors, 2. Consistent Status Colors, 3. Proper Contrast, 4. Theme-aware Custom Styles, Adding New Colors, AR Studio - Theming System, 🎨 Available Colors, Badge Variants (+26 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 10 - "supabase-client.ts"
Cohesion: 0.08
Nodes (35): MeasurementSelectDialogProps, OrderDetailsDialogProps, OrderDialogProps, VendorDialogProps, MeasurementFormProps, VendorFormProps, PrintMeasurement(), PrintMeasurementProps (+27 more)

### Community 11 - "public.resnapshot_vendor_category"
Cohesion: 0.33
Nodes (5): public.resnapshot_vendor_category, public.vendor_categories, public.resnapshot_vendor_category(), public.vendors, trg_resnapshot_vendor_category

### Community 12 - "(dashboard)/layout.tsx"
Cohesion: 0.06
Nodes (34): geistMono, inter, manrope, metadata, SignInPage(), RouteGuard(), RouteGuardProps, Header() (+26 more)

### Community 13 - "validators.ts"
Cohesion: 0.11
Nodes (20): GET(), POST(), createCustomer(), getCustomers(), CreateCustomerSchema, CreatePaymentInput, CreatePaymentSchema, CustomerQuery (+12 more)

### Community 14 - "supabase.ts"
Cohesion: 0.12
Nodes (12): GET(), RouteParams, GET(), POST(), DELETE(), Counter, Customer, Order (+4 more)

### Community 15 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 16 - "AR Dashboard - Customer & Order Management System"
Cohesion: 0.11
Nodes (18): 1. Install Dependencies, 2. Supabase Setup, 3. Seed the Database (Optional), 4. Run the Development Server, 📊 Advanced Features, 📋 API Endpoints, AR Dashboard - Customer & Order Management System, 🧑‍💼 Customer Management (+10 more)

### Community 17 - "alert-dialog.tsx"
Cohesion: 0.21
Nodes (12): DeleteConfirmationDialog(), DeleteConfirmationDialogProps, AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription(), AlertDialogFooter() (+4 more)

### Community 18 - "20260827000000_vendor_categories.sql"
Cohesion: 0.40
Nodes (5): public.snapshot_vendor_category, public.snapshot_vendor_category(), public.vendor_categories, public.vendors, trg_snapshot_vendor_category

### Community 19 - "dependencies"
Cohesion: 0.22
Nodes (9): class-variance-authority, dependencies, class-variance-authority, @radix-ui/react-tabs, react-day-picker, @tanstack/react-table, @radix-ui/react-tabs, react-day-picker (+1 more)

### Community 20 - "database.ts"
Cohesion: 0.17
Nodes (18): main(), GET(), DELETE(), GET(), PATCH(), GET(), POST(), createOrder() (+10 more)

### Community 21 - "customers/[id]/route.ts"
Cohesion: 0.36
Nodes (7): DELETE(), GET(), PATCH(), deleteCustomer(), getCustomer(), updateCustomer(), UpdateCustomerSchema

### Community 22 - "api-auth.ts"
Cohesion: 0.39
Nodes (7): AuthUser, getAuthUser(), requireAdmin(), requireAuth(), requireRole(), UserRole, createServerSupabaseClient()

### Community 23 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 24 - "dashboard-stats/route.ts"
Cohesion: 0.70
Nodes (4): buildChartData(), GET(), getFirstDayOfMonth(), getSixMonthsAgo()

### Community 26 - "payments/[id]/route.ts"
Cohesion: 0.50
Nodes (3): DELETE(), PATCH(), IMPORTANT: Prepare update data - ONLY update payments table fields

### Community 27 - "assert-writable-db.ts"
Cohesion: 0.24
Nodes (4): assertWritableDb(), supabase, supabase, supabase

### Community 28 - "payments/route.ts"
Cohesion: 0.50
Nodes (3): GET(), POST(), IMPORTANT: We are creating a NEW payment in the payments table

## Knowledge Gaps
- **261 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+256 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `payment-dialog.tsx`, `measurements-step.tsx`, `(dashboard)/page.tsx`, `(dashboard)/layout.tsx`, `alert-dialog.tsx`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `createAdminSupabaseClient()` connect `createAdminSupabaseClient` to `validators.ts`, `supabase.ts`, `database.ts`, `customers/[id]/route.ts`, `dashboard-stats/route.ts`, `payments/[id]/route.ts`, `payments/route.ts`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `OrderWithCustomer` connect `supabase-client.ts` to `cn`, `payment-dialog.tsx`, `measurements-step.tsx`, `use-api.ts`, `database.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _261 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `cn` be split into smaller, more focused modules?**
  _Cohesion score 0.05926251097453907 - nodes in this community are weakly interconnected._
- **Should `payment-dialog.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08734567901234568 - nodes in this community are weakly interconnected._
- **Should `measurements-step.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.08591408591408592 - nodes in this community are weakly interconnected._