# Graph Report - ar-studio-app  (2026-10-25)

## Corpus Check
- 194 files · ~122,819 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1207 nodes · 2830 edges · 102 communities (62 shown, 40 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6c356d74`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- dialog.tsx
- ledger/page.tsx
- order-form.tsx
- use-api.ts
- (dashboard)/page.tsx
- AR Studio — Design System (Master)
- devDependencies
- createAdminSupabaseClient
- AR Studio - Theming System
- compilerOptions
- OrderWithCustomer
- public.resnapshot_vendor_category
- app/layout.tsx
- validators.ts
- (dashboard)/layout.tsx
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
- customer-form.tsx
- support.ts
- proposals.ts
- helpers.ts
- api-matrix.check.ts
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
- dropdown-menu.tsx
- order-details-dialog.tsx
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
- cn
- payment-dialog.tsx
- summarize.ts
- Endpoint and MCP regression matrix
- format.ts
- bottom-nav.tsx
- cleanup.mjs
- payment-step.tsx
- chart.tsx
- button.tsx
- auth-context.tsx
- db-counts.mjs
- Add AR Studio to a phone or tablet home screen
- useAuth
- dashboard-actions.tsx
- generate-icons.mjs
- 20261024000200_ledger_mcp_audience_hook.sql
- screenshot-index.md

## God Nodes (most connected - your core abstractions)
1. `cn()` - 135 edges
2. `createAdminSupabaseClient()` - 75 edges
3. `Button()` - 38 edges
4. `authFetch()` - 30 edges
5. `OrderWithCustomer` - 25 edges
6. `Input()` - 21 edges
7. `Badge()` - 20 edges
8. `Card()` - 20 edges
9. `CardTitle()` - 20 edges
10. `CardContent()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `getOrders()`  [EXTRACTED]
  scripts/check-order-search.ts → src/lib/database.ts
- `main()` --calls--> `createLedgerVerifier()`  [EXTRACTED]
  scripts/ledger-mcp/auth.check.ts → src/lib/ledger-mcp/auth.ts
- `run()` --calls--> `normalizeEntry()`  [EXTRACTED]
  scripts/ledger-mcp/normalize.check.ts → src/lib/ledger-mcp/normalize.ts
- `DashboardLayout()` --calls--> `authFetch()`  [EXTRACTED]
  src/app/(dashboard)/layout.tsx → src/lib/auth-fetch.ts
- `OrderForm()` --calls--> `cn()`  [EXTRACTED]
  src/components/forms/order-form.tsx → src/lib/utils.ts

## Import Cycles
- None detected.

## Communities (102 total, 40 thin omitted)

### Community 0 - "dialog.tsx"
Cohesion: 0.17
Nodes (15): VendorBillDialogProps, VendorDialog(), VendorDialogProps, LedgerEntryForm(), OrderMultiStepForm(), Dialog(), DialogContent(), DialogDescription() (+7 more)

### Community 1 - "ledger/page.tsx"
Cohesion: 0.32
Nodes (11): RoleGuard(), RoleGuardProps, DeleteConfirmationDialog(), DatePicker(), Label(), Table(), TableBody(), TableCell() (+3 more)

### Community 2 - "order-form.tsx"
Cohesion: 0.13
Nodes (31): CustomerCombobox(), MeasurementFieldProps, measurementSections, MeasurementForm(), OrderForm(), ORDER_TYPES, OrderItemsRepeater(), OrderGeneralInfoStep() (+23 more)

### Community 3 - "use-api.ts"
Cohesion: 0.08
Nodes (36): CustomersPage(), LedgerPage(), OrdersPage(), VendorLedgerPage(), LedgerEntryDialog(), VendorBillDialog(), VendorCategoriesDialog(), CustomerQueryParams (+28 more)

### Community 4 - "(dashboard)/page.tsx"
Cohesion: 0.09
Nodes (21): daysUntil(), DeliveryRow(), DeliveryRowProps, UpcomingOrder, EmptyState(), EmptyStateProps, ErrorState(), ErrorStateProps (+13 more)

### Community 5 - "AR Studio — Design System (Master)"
Cohesion: 0.04
Nodes (46): 0b. Visual identity (second pass — locked), 10. Pre-delivery checklist, 1. Color, 2. Typography, 3. Spacing (density 8/10), 4. Elevation & shape, 5. Motion (3/10 — subtle), 6. Interaction & accessibility (non-negotiable) (+38 more)

### Community 6 - "devDependencies"
Cohesion: 0.05
Nodes (42): dotenv, eslint, eslint-config-next, @eslint/eslintrc, @faker-js/faker, @modelcontextprotocol/client, devDependencies, dotenv (+34 more)

### Community 7 - "createAdminSupabaseClient"
Cohesion: 0.08
Nodes (29): GET(), RouteParams, DELETE(), GET(), PUT(), RouteParams, GET(), POST() (+21 more)

### Community 8 - "AR Studio - Theming System"
Cohesion: 0.06
Nodes (34): 1. Use Semantic Colors, 2. Consistent Status Colors, 3. Proper Contrast, 4. Theme-aware Custom Styles, Adding New Colors, AR Studio - Theming System, 🎨 Available Colors, Badge Variants (+26 more)

### Community 9 - "compilerOptions"
Cohesion: 0.07
Nodes (26): dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts, **/*.tsx (+18 more)

### Community 10 - "OrderWithCustomer"
Cohesion: 0.12
Nodes (22): OrderActionsProps, MeasurementSelectDialogProps, OrderDetailsDialogProps, MeasurementFormProps, PrintMeasurement(), PrintMeasurementProps, Payment, PrintReceipt() (+14 more)

### Community 11 - "public.resnapshot_vendor_category"
Cohesion: 0.33
Nodes (5): public.resnapshot_vendor_category, public.vendor_categories, public.resnapshot_vendor_category(), public.vendors, trg_resnapshot_vendor_category

### Community 12 - "app/layout.tsx"
Cohesion: 0.16
Nodes (10): geistMono, inter, manrope, metadata, viewport, QueryProvider(), ThemeProvider(), Toaster() (+2 more)

### Community 13 - "validators.ts"
Cohesion: 0.08
Nodes (24): valid, GET(), POST(), createCustomer(), getCustomers(), CreateCustomerSchema, CreateOrderFields, CreateOrderSchema (+16 more)

### Community 14 - "(dashboard)/layout.tsx"
Cohesion: 0.21
Nodes (13): DashboardLayout(), BottomNav(), isActivePath(), itemsFor(), moreItemsFor(), NAV_ITEMS, NavItem, Role (+5 more)

### Community 15 - "components.json"
Cohesion: 0.11
Nodes (18): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+10 more)

### Community 16 - "AR Dashboard - Customer & Order Management System"
Cohesion: 0.11
Nodes (18): 1. Install Dependencies, 2. Supabase Setup, 3. Seed the Database (Optional), 4. Run the Development Server, 📊 Advanced Features, 📋 API Endpoints, AR Dashboard - Customer & Order Management System, 🧑‍💼 Customer Management (+10 more)

### Community 17 - "measurements/page.tsx"
Cohesion: 0.24
Nodes (12): MeasurementsPage(), DeleteConfirmationDialogProps, createMeasurementColumns(), AlertDialog(), AlertDialogAction(), AlertDialogCancel(), AlertDialogContent(), AlertDialogDescription() (+4 more)

### Community 18 - "20260827000000_vendor_categories.sql"
Cohesion: 0.40
Nodes (5): public.snapshot_vendor_category, public.snapshot_vendor_category(), public.vendor_categories, public.vendors, trg_snapshot_vendor_category

### Community 19 - "dependencies"
Cohesion: 0.22
Nodes (9): class-variance-authority, clsx, dependencies, class-variance-authority, clsx, react-dom, tailwind-merge, react-dom (+1 more)

### Community 20 - "database.ts"
Cohesion: 0.13
Nodes (25): main(), GET(), DELETE(), GET(), PATCH(), GET(), POST(), DELETE() (+17 more)

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

### Community 26 - "customer-form.tsx"
Cohesion: 0.31
Nodes (9): CustomerWithOrderCount, CustomerWithOrderCount, CustomerWithOrderCount, CustomerDialog(), CustomerDialogProps, CustomerForm(), CustomerFormProps, Customer (+1 more)

### Community 27 - "support.ts"
Cohesion: 0.08
Nodes (47): assertWritableDb(), supabase, main(), R, say(), forgedJwt(), ledgerFingerprint(), main() (+39 more)

### Community 28 - "proposals.ts"
Cohesion: 0.10
Nodes (40): good, problems(), run(), GET(), businessToday(), centsToDecimal(), CURRENCY, Direction (+32 more)

### Community 29 - "helpers.ts"
Cohesion: 0.10
Nodes (31): Screen, SCREENS, NAMES, Opener, OPENERS, vps, assertLocalTarget(), ACCOUNTS (+23 more)

### Community 31 - "api-matrix.check.ts"
Cohesion: 0.10
Nodes (32): api(), assertNoExisting2099(), Auth, callStats, Cat, cellFor(), check(), COUNT_TABLES (+24 more)

### Community 32 - "auth.ts"
Cohesion: 0.14
Nodes (21): RFC-8707, RFC-9728, main(), dynamic, handler, serve(), dynamic, GET() (+13 more)

### Community 40 - "supabase-client.ts"
Cohesion: 0.16
Nodes (13): LedgerEntryDialogProps, LedgerEntryFormProps, Counter, GeneralLedger, GeneralLedgerWithRelations, LedgerEntryType, OrderStatus, OrderType (+5 more)

### Community 64 - "dropdown-menu.tsx"
Cohesion: 0.15
Nodes (17): CustomerActionsProps, columnLabel(), DataTable(), DataTableProps, globalFilterFn(), ThemeToggle(), DropdownMenu(), DropdownMenuCheckboxItem() (+9 more)

### Community 65 - "order-details-dialog.tsx"
Cohesion: 0.16
Nodes (19): Details, CustomerDetailDialogProps, CustomerOrder, MeasurementSelectDialog(), OrderDetailsDialog(), Payment, steps, Badge() (+11 more)

### Community 69 - "Ledger MCP pilot"
Cohesion: 0.17
Nodes (11): Authentication, Demo conversation, Files, Ledger MCP pilot, Prepare → confirm → commit, Release blockers (not shortcuts to be waived), Run it locally (isolated database only), The limit of "confirmation" (+3 more)

### Community 70 - "Compile an Abide rubric"
Cohesion: 0.20
Nodes (9): Compile an Abide rubric, Step 1. Read the sources, Step 2. Extract every statement that instructs, Step 3. Classify each rule into exactly one bucket, Step 4. Write the question for each model rule, Step 5. Decide when each model rule runs, Step 6. Write the rubric file, Step 7. Validate, then calibrate (+1 more)

### Community 71 - "20261024000100_ledger_mcp_proposals.sql"
Cohesion: 0.22
Nodes (6): auth.users, public.ledger_mcp_set_payload_hash, public.ledger_mcp_audit, public.ledger_mcp_proposals, public.general_ledger, trg_ledger_mcp_payload_hash

### Community 81 - "cn"
Cohesion: 0.14
Nodes (17): OrderMeasurementsStep(), CardFooter(), Checkbox(), SelectContent(), SelectItem(), SelectLabel(), SelectScrollDownButton(), SelectScrollUpButton() (+9 more)

### Community 82 - "payment-dialog.tsx"
Cohesion: 0.20
Nodes (17): CustomerComboboxProps, Payment, PaymentDialogProps, LedgerEntryInput, LedgerEntrySchema, Command(), CommandDialog(), CommandEmpty() (+9 more)

### Community 83 - "summarize.ts"
Cohesion: 0.10
Nodes (16): cells, f(), [vp, out, ...screens], W, imgW, items, [phase, browserName, vp, out, ...only], root (+8 more)

### Community 84 - "Endpoint and MCP regression matrix"
Cohesion: 0.13
Nodes (14): 1. Legend, 2. Matrix, 3. What is NOT covered (do not read the table as more than this), 4. Existing regression suites (run in this session), 5. Findings (not fixed: backend code was not changed), 6. Cleanup and database confirmation, A. Authentication gaps: the API does not match the UI's role rules, B. Data-integrity risks (+6 more)

### Community 85 - "format.ts"
Cohesion: 0.22
Nodes (11): DashboardPage(), RevenueOverview(), useDashboardStats(), useReducedMotion(), formatCompactNumber(), formatCompactPKR(), formatPKR(), monthOverMonth() (+3 more)

### Community 86 - "bottom-nav.tsx"
Cohesion: 0.24
Nodes (7): Sheet(), SheetContent(), SheetDescription(), SheetFooter(), SheetHeader(), SheetOverlay(), SheetTitle()

### Community 87 - "cleanup.mjs"
Cohesion: 0.18
Nodes (6): done, env, H, orders, sb, url

### Community 88 - "payment-step.tsx"
Cohesion: 0.24
Nodes (8): OrderDialogProps, OrderFormProps, OrderItemsRepeaterProps, OrderMultiStepFormProps, OrderPaymentStep(), RadioGroup(), RadioGroupItem(), CreateOrderInput

### Community 89 - "chart.tsx"
Cohesion: 0.29
Nodes (8): ChartConfig, ChartContext, ChartContextProps, ChartLegendContent(), ChartTooltipContent(), getPayloadConfigFromPayload(), THEMES, useChart()

### Community 90 - "button.tsx"
Cohesion: 0.50
Nodes (5): Button(), buttonVariants, Calendar(), CalendarDayButton(), DatePickerProps

### Community 91 - "auth-context.tsx"
Cohesion: 0.31
Nodes (8): AuthContext, AuthContextType, AuthProvider(), AuthUser, clearCachedRole(), getCachedRole(), setCachedRole(), supabase

### Community 92 - "db-counts.mjs"
Cohesion: 0.29
Nodes (5): env, now, sb, tables, url

### Community 93 - "Add AR Studio to a phone or tablet home screen"
Cohesion: 0.33
Nodes (5): Add AR Studio to a phone or tablet home screen, Android (Chrome), For whoever maintains this, iPhone and iPad (Safari), What to expect

### Community 94 - "useAuth"
Cohesion: 0.40
Nodes (5): afterSignIn(), SignInPage(), RouteGuard(), RouteGuardProps, useAuth()

### Community 95 - "dashboard-actions.tsx"
Cohesion: 0.33
Nodes (5): Header(), DashboardActions, DashboardActionsContext, DashboardActionsProvider, useDashboardActions()

## Knowledge Gaps
- **388 isolated node(s):** `$schema`, `style`, `rsc`, `tsx`, `config` (+383 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `cn` to `dialog.tsx`, `order-details-dialog.tsx`, `order-form.tsx`, `ledger/page.tsx`, `(dashboard)/page.tsx`, `dropdown-menu.tsx`, `(dashboard)/layout.tsx`, `measurements/page.tsx`, `payment-dialog.tsx`, `bottom-nav.tsx`, `payment-step.tsx`, `chart.tsx`, `button.tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `createAdminSupabaseClient()` connect `createAdminSupabaseClient` to `auth.ts`, `validators.ts`, `database.ts`, `customers/[id]/route.ts`, `api-auth.ts`, `dashboard-stats/route.ts`, `proposals.ts`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Why does `OrderWithCustomer` connect `OrderWithCustomer` to `dialog.tsx`, `order-details-dialog.tsx`, `ledger/page.tsx`, `order-form.tsx`, `use-api.ts`, `supabase-client.ts`, `payment-dialog.tsx`, `database.ts`, `payment-step.tsx`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `$schema`, `style`, `rsc` to the rest of the system?**
  _388 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `order-form.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.13124274099883856 - nodes in this community are weakly interconnected._
- **Should `use-api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08139534883720931 - nodes in this community are weakly interconnected._
- **Should `(dashboard)/page.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09274193548387097 - nodes in this community are weakly interconnected._