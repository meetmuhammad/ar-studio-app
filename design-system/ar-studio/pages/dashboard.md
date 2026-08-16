# Page Spec — Dashboard (`/`)

> Overrides [`../MASTER.md`](../MASTER.md) for `src/app/(dashboard)/page.tsx`.
> Anything not stated here inherits from Master.

**Route:** `/` · **Access:** admin only (`RoleGuard allowedRoles={['admin']}`)
**Data:** `GET /api/dashboard-stats` via `useDashboardStats()`
**Direction:** Data-Dense Operations Console, tempered by Swiss Ledger (locked in Master)

---

## 0. Hard constraints

### No backend changes

Everything below is built from the payload already returned:

```
totalCustomers, totalOrders, totalRevenue, totalReceived, outstandingBalance,
recentOrdersCount, upcomingOrders[≤5], chartData[6 × {month, revenue}]
```

**Derivable client-side — safe to design for:**

| Metric | Derivation |
|---|---|
| Revenue MoM delta | `chartData[5].revenue` vs `chartData[4].revenue` |
| 6-month sparkline | `chartData` |
| Collection rate | `totalReceived / totalRevenue` |
| Avg order value | `totalRevenue / totalOrders` |
| Delivery urgency (the 5 returned) | `delivery_date` vs today |

**Not derivable — must not be faked:**

- ❌ Customer/order growth deltas — no historical series in the payload.
- ❌ Order status breakdown — not in the payload.
- ❌ "N deliveries due this week" — `upcomingOrders` is capped at 5; any count ≥5 is a floor.
- ❌ Working around it via `/api/orders?from=&to=` — those params filter **`booking_date`**, not
  `delivery_date` ([`src/lib/database.ts:189`](../../../src/lib/database.ts)). Out of scope.

A card with no derivable delta shows a static footer link. No placeholder, no em-dash, no invented
percentage.

### Tempered density (from Master)

| Property | Value |
|---|---|
| Body text | `text-sm` (14px) desktop · 16px inputs on mobile |
| Meta text | `text-xs` (12px) — floor, never smaller |
| Card padding | `p-4` (16px); list rows `p-3` (12px) |
| Grid gutter | `gap-4` (16px) at every breakpoint — never scales responsively |
| Card radius | `rounded-lg` (`--radius: 0.65rem`) |
| Card elevation | **`shadow-none`** — flat, `border` + `bg-card` only |
| Row min-height | 44px mobile / 40px desktop |
| Focus ring | 3px, visible, never removed |
| Page padding | `p-4 md:p-6` |
| Content cap | `max-w-[1600px] mx-auto` |

---

## 1. Desktop wireframe (1440px)

```
┌────────────┬──────────────────────────────────────────────────────────────────────────┐
│            │  ┌────────────────────────────────────────────────────────────────────┐  │
│  SIDEBAR   │  │ Dashboard                                    [＋ New Order]        │  │  PageHeader
│  w-64      │  │ Last updated 14:02                           [＄ Add Payment]      │  │  (h1 + actions)
│  (existing)│  └────────────────────────────────────────────────────────────────────┘  │
│            │                                                                          │
│  ▸ Dashboard  ┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐        │
│    Customers  │ REVENUE      ││ OUTSTANDING  ││ ORDERS       ││ CUSTOMERS    │        │  KPI row
│    Orders     │              ││              ││              ││              │        │  4 × col-span-3
│    Measure…   │ PKR 1,642,000││ PKR 412,500  ││ 284          ││ 1,204        │        │  gap-4
│    Ledger     │ ▲ 8.2% vs Jul││ ▓▓▓▓▓▓░░ 68% ││ +12 this mo. ││              │        │
│    Vendors    │ ╱╲__╱‾╲_╱‾   ││ collected    ││              ││              │        │
│            │  │ View ledger →││ View ledger →││ View orders →││ View all →   │        │
│  ─────────    └──────────────┘└──────────────┘└──────────────┘└──────────────┘        │
│  AH  admin                                                                            │
│  Sign Out     ┌────────────────────────────────────────┐┌────────────────────────────┐│
│            │  │ Revenue Overview      6-mo: PKR 1.64M  ││ Next 5 Deliveries          ││
│            │  │ Monthly revenue, last 6 months         ││ Soonest first              ││
│            │  │                                        ││                            ││
│            │  │  ┌──────────────────────────────────┐  ││ ┌────────────────────────┐ ││
│            │  │  │                            ╱‾╲   │  ││ │⚠ #1042      Aug 16     │ ││
│            │  │  │              ╱‾╲___╱‾‾╲___╱    ╲ │  ││ │  Ayesha K.   [Today]   │ ││
│            │  │  │   ╱‾╲___╱‾‾‾                     │  ││ │  0300-1234567   Today  │ ││
│            │  │  │ ╱                                │  ││ ├────────────────────────┤ ││
│            │  │  └──────────────────────────────────┘  ││ │⚠ #1043      Aug 17     │ ││
│            │  │   Mar   Apr   May   Jun   Jul   Aug    ││ │  Bilal M.  [Tomorrow]  │ ││
│            │  │                                        ││ ├────────────────────────┤ ││
│            │  │  lg:col-span-8                         ││ │  #1044      Aug 20     │ ││
│            │  │                                        ││ │  Sana R.           4d  │ ││
│            │  │                                        ││ └────────────────────────┘ ││
│            │  │                                        ││ View all orders →          ││
│            │  └────────────────────────────────────────┘└────────────────────────────┘│
│            │                                              lg:col-span-4                │
└────────────┴──────────────────────────────────────────────────────────────────────────┘
   flat cards · no shadow · hairline borders · gap-4 · mono tabular numerals
```

---

## 2. Page layout

Root: `<div className="mx-auto max-w-[1600px] space-y-6">` inside the existing
`<main className="p-3 sm:p-4 md:p-6">` from [`layout.tsx`](../../../src/app/(dashboard)/layout.tsx).

| Band | Grid |
|---|---|
| PageHeader | full width, `flex items-start justify-between gap-4` |
| KPI row | `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4` |
| Chart + deliveries | `grid grid-cols-1 lg:grid-cols-12 gap-4` → `lg:col-span-8` / `lg:col-span-4` |

`space-y-6` between bands (24px). Nothing else separates them — no dividers, no headings.

**Why 12 columns, not the current 7:** the page currently uses `lg:grid-cols-7` with `col-span-4` /
`col-span-3`, which is a 57/43 split that no other page shares. 12 columns is the Master grid and
divides evenly for the 4-up KPI row.

---

## 3. Page header

New `PageHeader` primitive. Supplies the `h1` the app currently lacks entirely — today the highest
heading on any route is an `h2`, so heading order is broken app-wide.

```
Dashboard                                   [＋ New Order]  [＄ Add Payment]
Last updated 14:02
```

- `h1`: "Dashboard" — `text-2xl font-semibold tracking-tight`
- Sub: `Last updated {format(dataUpdatedAt, 'HH:mm')}` — `text-xs text-muted-foreground`, read from
  React Query's `dataUpdatedAt`. Suppressed while `isPending`.
- **Removed copy:** "Welcome to AR Dashboard" and "Here's what's happening with your business
  today." Greeting text costs a full row on a screen opened many times a day and says nothing.

### Page-level actions

**New Order** (primary) and **Add Payment** (outline) move here from
[`header.tsx`](../../../src/components/dashboard/header.tsx), where they currently render on *every*
route regardless of relevance and occupy the primary visual slot ahead of any page identity.

- The global `Header` keeps: mobile menu trigger, `ThemeToggle`. Its action buttons and their
  `onCreateOrder`/`onAddPayment` props are removed from the header component.
- `layout.tsx` still owns `OrderDialog` / `PaymentDialog` state and the `handleCreateOrder` handler —
  **no logic changes**. The open-callbacks are passed down to the page instead of the header.
- Mechanism: since `layout.tsx` is a client component holding the dialog state, expose the two
  openers through a small React context (`DashboardActionsContext`) that `layout.tsx` provides and
  `PageHeader` consumers read. This is presentation wiring only; the dialogs, the POST, the toast,
  and the `orderCreated` event stay exactly as they are.
- Mobile: buttons collapse to icon + short label (`Order` / `Payment`) as they do today, and wrap
  below the `h1` rather than crowding it.

---

## 4. KPI row

### Order (changed)

| # | Card | Was | Rationale |
|---|---|---|---|
| 1 | **Revenue** | 3rd | The headline number |
| 2 | **Outstanding** | 4th | Money owed drives today's action — promoted from last |
| 3 | **Orders** | 2nd | Volume |
| 4 | **Customers** | 1st | Vanity metric — demoted from first |

### `StatCard` anatomy

```
REVENUE                                    [icon]   ← text-xs uppercase tracking-wide muted
PKR 1,642,000                                       ← text-3xl font-mono tabular-nums font-semibold
▲ 8.2% vs Jul                                       ← delta: icon + sign + label
╱╲__╱‾╲_╱‾                                          ← optional sparkline (h-8)
View ledger →                                       ← footer link, text-xs
```

Rules:

- **The whole card is the link target**, not just the footer text as today. Wrap in `Link`, add
  `focus-visible:ring-[3px]` and `hover:bg-accent/50 transition-colors`. No `translateY`, no `scale`.
- Values use `font-mono tabular-nums` so digits don't jitter between refetches.
- Deltas pair `TrendingUp`/`TrendingDown` with a sign and label — never color alone.
- Cards must override shadcn `Card` defaults: `rounded-lg py-4 gap-2 shadow-none` (default is
  `rounded-xl py-6 gap-6 shadow-sm`).

### Card contents

| Card | Value | Secondary | Footer | Icon |
|---|---|---|---|---|
| Revenue | `formatPKR(totalRevenue)` | MoM delta from `chartData` + 6-point sparkline (`h-8`, stroke `var(--chart-1)`, no axes/dots) | `/ledger` | `TrendingUp` |
| Outstanding | `formatPKR(outstandingBalance)` | 2px collection bar `bg-warning` on `bg-muted` + `"{x}% collected"` | `/ledger` | `CreditCard` |
| Orders | `totalOrders` | `+{recentOrdersCount} this month` | `/orders` | `ShoppingCart` |
| Customers | `totalCustomers` | *(none — no delta available)* | `/customers` | `Users` |

**Collection bar is a plain progress bar, not a gauge or bullet chart.** `charts.csv` →
*Performance vs Target* excludes both when "no target or benchmark exists," and AR Studio defines no
collection target. Label it descriptively (`68% collected`), never as attainment.

Outstanding value keeps a `text-warning` treatment — but via the token, replacing today's
`text-orange-600`.

---

## 5. Revenue Overview chart

`lg:col-span-8`. Reuses `ChartContainer` / `ChartTooltip` / `ChartTooltipContent` and Recharts
`AreaChart` — `charts.csv` → *Trend Over Time* gives Line as best, Area as an accepted secondary, so
the existing Area is kept.

**Required fixes:**

| Issue | Now | Fix |
|---|---|---|
| Chart color | `color: "hsl(var(--chart-1))"` — tokens are **oklch**, so this yields `hsl(oklch(…))`, invalid; the declaration drops and Recharts falls back to its own default in both themes | `color: "var(--chart-1)"` |
| Axis stroke | `stroke="#888888"` — hardcoded, fails contrast in dark mode | `stroke="var(--muted-foreground)"` |
| Y tick format | `PKR ${value}` — unabbreviated, overflows at 375px | `PKR 1.2M` / `PKR 240k` |
| Gridlines | none | `CartesianGrid` `stroke="var(--border)"`, **horizontal only**, `vertical={false}` |
| Left margin | `left: -20` | `left: 0` once ticks are abbreviated |

Header gains a right-aligned `CardAction` with the window total: `6-mo: PKR 1.64M`.

Height `h-[240px] sm:h-[280px] lg:h-[300px]`.

---

## 6. Next 5 Deliveries

`lg:col-span-4`.

**Title changes to "Next 5 Deliveries"** — the API hard-caps this at 5, so "Upcoming Deliveries"
implies a completeness the data doesn't have. Description: `Soonest first`.

### Row (`DeliveryRow`)

```
⚠ #1042                        Aug 16
  Ayesha Khan      [Today]      Today
  0300-1234567
```

- Left: order number (`font-mono text-sm font-medium`), customer name (`text-sm truncate`), phone
  (`font-mono text-xs text-muted-foreground`)
- Right: `format(delivery_date, 'MMM d')` then relative (`Today` / `Tomorrow` / `4d`)
- Row: `p-3 rounded-md border`, `min-h-11` (44px), `hover:bg-accent/50 transition-colors`
- Rows link to `/orders` — the payload carries no per-order detail path, so the list route stands
  until one exists.

### Urgency treatment

| Condition | Treatment |
|---|---|
| `daysUntil === 0` | `border-destructive-border bg-destructive-surface`, `AlertCircle` icon, `Badge variant="destructive"` "Today" |
| `daysUntil === 1` | `border-warning-border bg-warning-surface`, `AlertCircle` icon, `Badge variant="warning"` "Tomorrow" |
| `daysUntil ≤ 2` | `border-warning-border`, `text-warning` on the relative label |
| otherwise | plain `border`, muted relative label |

Two corrections to the current implementation:

1. Replaces `border-orange-500/50 bg-orange-50/50 dark:bg-orange-950/20` and `text-orange-600` with
   the tokens. Requires the `*-surface` / `*-border` token pairs added in Master §1.
2. `Badge` **already ships** `warning` / `success` / `info` / `brand` variants
   ([`badge.tsx`](../../../src/components/ui/badge.tsx)) — so today's
   `variant="default" className="bg-orange-500"` override is replaced by `variant="warning"`. No new
   variant needed.

Every urgent row carries `AlertCircle` — urgency is currently signalled by color and badge only.

Footer: `View all orders →` link.

---

## 7. States

All four are **required**, and each widget owns its own.

### Loading

- **Delete the page-level `if (loading)` branch.** It is a 60-line duplicate of the layout that will
  drift from the real markup on the first edit.
- Each of `StatCard`, the chart card, and the deliveries card renders its own skeleton internally
  when `isPending`.
- Skeleton blocks match loaded dimensions exactly (CLS < 0.1): KPI value `h-9 w-32`, sparkline
  `h-8 w-full`, chart `h-[300px] w-full`, delivery row `h-[68px]`.
- Skeletons, not spinners.

### Empty

| Surface | Condition | Treatment |
|---|---|---|
| Chart | all 6 months zero | `TrendingUp` icon (muted, `size-10`) + "No revenue recorded in the last 6 months" + link to `/ledger` |
| Deliveries | `upcomingOrders.length === 0` | `Calendar` icon + "No upcoming deliveries" + **"Create order"** action (currently offers no action) |
| KPI cards | value is `0` | render `0` — a zero is data, not an empty state |

Shared `EmptyState` primitive: icon + one-line explanation + optional action.

### Error

**Currently unhandled — `useDashboardStats` exposes `isError` and the page ignores it, so a failed
fetch renders zeros and a blank chart, indistinguishable from a genuinely empty studio.**

- On `isError`: replace the KPI row + content bands with a single `Card` — `AlertCircle`
  (`text-destructive`), "Couldn't load dashboard data", the error message in
  `text-xs text-muted-foreground`, and a **Retry** button wired to `refetch()`.
- PageHeader stays rendered so actions remain reachable.
- No partial rendering — stale zeros are worse than an honest failure.

---

## 8. Responsive behavior

| Width | Layout |
|---|---|
| **375** | Single column. Sidebar → `Sheet` (existing). KPI `grid-cols-1`. Chart `h-[240px]`, Y ticks abbreviated (`PKR 240k`) — this is the horizontal-overflow risk to verify. Header actions wrap below `h1`, icon + short label. All targets ≥44px. |
| **768** | KPI `sm:grid-cols-2` (2×2). Chart + deliveries still stacked. Sidebar still a Sheet (`lg:` is the breakpoint). Header actions inline with full labels. |
| **1024** | Sidebar becomes persistent (`lg:flex w-64`). Chart/deliveries split `lg:col-span-8` / `lg:col-span-4`. KPI still 2×2 — 4-up at 1024 minus a 256px sidebar leaves ~180px per card, too narrow for `PKR 1,642,000` at `text-3xl`. |
| **1440** | KPI goes 4-up (`xl:grid-cols-4`). Content caps at `max-w-[1600px]`. |

Verify at every width: no horizontal scroll, gutters stay `gap-4`, KPI values never wrap mid-number.

---

## 9. Components reused (unchanged)

| Component | Use |
|---|---|
| `ui/card` (+ `CardHeader`/`CardTitle`/`CardDescription`/`CardAction`/`CardContent`) | all surfaces — with density overrides |
| `ui/badge` | Today / Tomorrow — existing `destructive` + `warning` variants |
| `ui/skeleton` | all loading states |
| `ui/button` | page actions, Retry |
| `ui/chart` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`) | revenue chart |
| `auth/role-guard` | admin gate — unchanged |
| `dashboard/sidebar` | unchanged in this pass |
| `dashboard/header` | **edited**: action buttons removed, keeps menu + theme toggle |
| `hooks/use-api` → `useDashboardStats` | unchanged; page additionally consumes `isError`, `refetch`, `dataUpdatedAt` |
| Recharts `AreaChart`/`Area`/`XAxis`/`YAxis` + new `CartesianGrid` | chart |
| `date-fns` `format` | dates |
| lucide `TrendingUp`, `TrendingDown`, `CreditCard`, `ShoppingCart`, `Users`, `AlertCircle`, `Calendar`, `ArrowUpRight`, `Plus`, `DollarSign` | icons |

## 10. New shared primitives

All in `src/components/dashboard/` unless noted.

| Primitive | Responsibility |
|---|---|
| `page-header.tsx` → `PageHeader` | `h1` + optional sub-line + right-aligned action slot. Reusable across all 6 routes. |
| `stat-card.tsx` → `StatCard` | label, mono value, optional delta, optional sparkline, optional progress bar, footer link, own skeleton. Whole-card link target. |
| `section-card.tsx` → `SectionCard` | `Card` preset at tempered density (`rounded-lg py-4 gap-4 shadow-none`, `px-4` header/content) so density isn't re-specified per call site. |
| `empty-state.tsx` → `EmptyState` | icon + message + optional action. |
| `delivery-row.tsx` → `DeliveryRow` | one delivery with urgency logic and treatment. |
| `stat-sparkline.tsx` → `StatSparkline` | 6-point axis-less Recharts line for `StatCard`. |
| `error-state.tsx` → `ErrorState` | icon + message + Retry. |
| `contexts/dashboard-actions.tsx` | context exposing `openOrderDialog` / `openPaymentDialog` from `layout.tsx`. Presentation wiring only. |
| `lib/format.ts` → `formatPKR`, `formatCompactPKR` | single currency helper. `page.tsx` currently defines `formatCurrency` inline; `formatCompactPKR` powers axis ticks. |

### Token additions required first (Master §1)

`--warning-surface` / `--warning-border`, `--success-*`, `--info-*`, `--destructive-surface` /
`--destructive-border`, in both `:root` and `.dark`, registered in `@theme inline`.

---

## 11. Explicitly out of scope

1. Order status breakdown chart — needs backend.
2. True delivery-window counts — needs `delivery_date` range filtering in `getOrders`.
3. Customer/order growth deltas — needs a historical series.
4. Recent activity feed from `general_ledger` — needs an endpoint.
5. Saved-view tabs on `/orders` — different route; deferred pending your call.
6. The global link-underline rule cleanup (Master §7) — touches every route; **not** in this
   proof of concept. The dashboard keeps `no-underline` locally until that lands.
7. Sidebar restyling.

---

## 12. Acceptance checks

- [ ] `grep -n "hsl(var" src/app/\(dashboard\)/page.tsx` → no matches
- [ ] `grep -rnE "(text|bg|border)-(orange|green|red|blue|amber)-[0-9]"` over dashboard files → no matches
- [ ] Exactly one `h1`; no skipped heading levels
- [ ] Loading / empty / error / loaded all reachable and correct
- [ ] Error state reachable (throttle or block `/api/dashboard-stats`) and Retry works
- [ ] Chart legible in **both** themes; axis contrast ≥ 3:1
- [ ] No horizontal scroll at 375 / 768 / 1024 / 1440
- [ ] Every KPI card keyboard-focusable with a visible 3px ring
- [ ] No metric shown that the payload cannot support
- [ ] `npm run lint`, `npm run typecheck`, `npm test` clean
- [ ] No changes to API routes, `lib/database.ts`, auth, or Supabase config
