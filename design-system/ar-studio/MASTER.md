# AR Studio — Design System (Master)

> **LOGIC:** When building a specific page, first check `design-system/ar-studio/pages/<page>.md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.

**Project:** AR Studio — tailoring studio back-office (customers, orders, measurements, ledger, vendors)
**Category:** Internal operational dashboard (not a marketing surface)
**Stack:** Next.js 15 (App Router) · React 19 · Tailwind v4 · shadcn/ui (new-york) · lucide-react · Recharts 2
**Design dials:** Variance 4/10 (balanced) · Motion 3/10 (subtle) · Density 8/10 (dense/dashboard)
**Generated from:** `ui-ux-pro-max --design-system`, then reconciled against the existing codebase.

## Visual direction (locked)

**Data-Dense Operations Console, tempered by Swiss Ledger.**

| Source | Style ID | Role |
|---|---|---|
| `styles.csv` | `data-dense-dashboard` | Base — grid, tables, compact cards, KPI row |
| `styles.csv` | `minimalism-and-swiss-style` | Restraint — flat surfaces, hairline rules, single accent |
| `styles.csv` | `accessible-and-ethical` | **Floor** — overrides the base wherever they conflict |
| `styles.csv` | `shopify-polaris` | IA patterns only (saved-view tabs, resource lists, contextual page actions) — **not** its tokens or components |

### The tempering rule

`data-dense-dashboard` specifies `--font-size-small: 12px` and `--table-row-height: 36px`. This app
already committed to mobile: `globals.css` enforces `min-height: 44px` on every interactive element
under 768px, and the layout ships a mobile sheet sidebar. Both cannot hold.

**Where the two conflict, `accessible-and-ethical` wins:**

| Raw data-dense | Applied here | Reason |
|---|---|---|
| 12px body | 14px desktop / 16px mobile | 12px is below the readable floor for sustained daily use |
| 36px table rows | 44px (mobile) / 40px (desktop) | Existing touch-target commitment |
| `--grid-gap: 8px` | 16px (`gap-4`) | 8px gutters read as cramped at this type size |
| `--card-padding: 12px` | 16px (`p-4`); 12px for list rows | — |
| `--sidebar-width: 240px` | 256px (`w-64`, unchanged) | Already shipped; no reason to churn |
| `--header-height: 56px` | 56px | Matches current header |
| Contrast 4.5:1 | 4.5:1 text / 3:1 UI, both themes | 7:1 not required for an authenticated internal tool |
| Focus ring | 3px visible, never removed | — |

From Swiss: `shadow: none` on cards, hairline borders, one accent color. **Not** taken from Swiss:
its `2rem` spacing and `border-radius: 0` — the existing `--radius: 0.65rem` stays.

Violet primary stays. `defaultTheme: "dark"` ([theme-config.ts](../../src/lib/theme-config.ts)) stays.

### Rejected directions

`bento-box-grid` (its Do-Not-Use-For names "dense data tables" — breaks on 5 of 6 routes) ·
`dimensional-layering` (`risk:high`, the only high-risk entry in the pool) · `glassmorphism`
(`risk:conditional`; translucency destroys dense-table legibility) · `dark-mode-oled` as a *forced*
theme (dark stays the default, but light must remain fully supported) · `neubrutalism`, `claymorphism`,
`cyberpunk-ui`, `hud-sci-fi-fui` · all landing/marketing patterns.

## Reconciliations against the raw generator output

The generator's defaults were overridden where they conflicted with shipped reality. These are
deliberate, not omissions:

| Generator proposed | Decision | Reason |
|---|---|---|
| Blue palette (`#1E40AF`) | **Rejected** — keep violet `oklch(0.606 0.25 292.717)` | Violet is the established brand across sidebar, buttons, and `--brand`. Rebranding is a separate decision, not a dashboard redesign. |
| Fira Code / Fira Sans | **Rejected** — keep Geist Sans + Geist Mono | Already self-hosted via `next/font`. Swapping adds a webfont round-trip for no legibility gain; Geist Mono already covers the numeric/tabular need. |
| GSAP ScrollTrigger motion | **Rejected** | GSAP is not a dependency. `tw-animate-css` + CSS transitions are installed and sufficient at motion 3/10. Scroll-reveal is wrong for a dashboard — data must be readable instantly. |
| "Enterprise Gateway" page pattern | **Rejected** | That is a B2B *landing page* pattern (hero, client logos, contact sales). Irrelevant to an authenticated ops tool. |
| Raw CSS classes (`.btn-primary`, `.card`) | **Rejected** | Styling goes through shadcn component variants + Tailwind utilities. No parallel CSS class layer. |
| "Data-Dense Dashboard" style | **Accepted** | Correct match: KPI cards, tables, tight padding, maximum data per screen. |
| Density 8/10 spacing | **Accepted**, remapped to Tailwind steps | See spacing scale below. |

## 1. Color

**Source of truth:** `src/app/globals.css`. Components consume semantic tokens only. **Never** write a
raw Tailwind palette utility (`text-orange-600`, `bg-green-50`) in application code.

### Existing tokens (keep)

| Role | Light | Dark |
|---|---|---|
| `--primary` / `--brand` | `oklch(0.606 0.25 292.717)` | `oklch(0.541 0.281 293.009)` |
| `--background` | `oklch(1 0 0)` | `oklch(0.141 0.005 285.823)` |
| `--card` | `oklch(1 0 0)` | `oklch(0.21 0.006 285.885)` |
| `--muted-foreground` | `oklch(0.552 0.016 285.938)` | `oklch(0.705 0.015 286.067)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` | `oklch(0.704 0.191 22.216)` |
| `--success` / `--warning` / `--info` | defined | defined |

### Additions required

Status colors currently exist as *fills* only, with no matching low-emphasis surface token, which is
why call sites reach for `bg-orange-50/50`. Add a surface + border pair per status:

```css
:root {
  --warning-surface: oklch(0.97 0.03 84);
  --warning-border:  oklch(0.88 0.09 84);
  --success-surface: oklch(0.97 0.03 156);
  --success-border:  oklch(0.87 0.09 156);
  --info-surface:    oklch(0.97 0.02 234);
  --info-border:     oklch(0.88 0.07 234);
  --destructive-surface: oklch(0.97 0.02 27);
  --destructive-border:  oklch(0.89 0.08 27);
}
.dark {
  --warning-surface: oklch(0.26 0.05 84);
  --warning-border:  oklch(0.40 0.09 84);
  --success-surface: oklch(0.25 0.05 156);
  --success-border:  oklch(0.38 0.09 156);
  --info-surface:    oklch(0.25 0.04 234);
  --info-border:     oklch(0.37 0.08 234);
  --destructive-surface: oklch(0.26 0.06 27);
  --destructive-border:  oklch(0.40 0.11 27);
}
```

Register each in the `@theme inline` block (`--color-warning-surface: var(--warning-surface);` etc.)
so `bg-warning-surface` / `border-warning-border` become valid utilities.

### Chart colors — **broken today, must be fixed**

`--chart-1..5` are **oklch** values. Any call site writing `hsl(var(--chart-1))` produces
`hsl(oklch(...))`, an invalid color; the declaration is dropped and Recharts falls back to its own
default. **Rule:** reference chart tokens bare — `var(--chart-1)` — never wrapped in `hsl()`.

Semantic chart assignments for this product:

| Series | Token |
|---|---|
| Revenue / money in | `var(--chart-1)` |
| Outstanding / money owed | `var(--warning)` |
| Orders volume | `var(--chart-2)` |
| Comparison / prior period | `var(--muted-foreground)` at 40% opacity |

Never encode meaning in color alone — pair every status color with an icon or a text label.

## 2. Typography

Geist Sans (`--font-geist-sans`) for UI, Geist Mono (`--font-geist-mono`) for all numerics.

| Role | Class | Notes |
|---|---|---|
| Page title | `text-2xl font-semibold tracking-tight` | one `h1` per page |
| Section title | `text-base font-semibold` | `CardTitle` default |
| KPI value | `text-3xl font-semibold tabular-nums font-mono` | mono + `tabular-nums` so digits don't jitter on refetch |
| Body | `text-sm` | dashboard default, not `text-base` |
| Meta / caption | `text-xs text-muted-foreground` | floor is 12px — never smaller |
| IDs, phones, currency | `font-mono tabular-nums` | already the convention for order numbers |

Modular scale only: 12 · 14 · 16 · 18 · 24 · 30. No arbitrary sizes. Headings must not skip levels
(`h1` → `h2` → `h3`).

## 3. Spacing (density 8/10)

| Token | Tailwind | Use |
|---|---|---|
| xs | `gap-1` (4px) | icon↔label |
| sm | `gap-2` (8px) | inline groups, badge rows |
| md | `p-3` (12px) | list-row padding, compact card content |
| lg | `p-4` (16px) | card padding (default) |
| xl | `gap-4` (16px) | grid gutters |
| 2xl | `space-y-6` (24px) | section separation |

Page shell: `p-4 md:p-6`, content capped at `max-w-[1600px] mx-auto`. Grid gutter is `gap-4` at all
breakpoints — do not scale gutters responsively; it makes the grid feel unstable.

## 4. Elevation & shape

Radius comes from `--radius: 0.65rem`. Cards use `rounded-lg`.

Flat by default: `border` + `bg-card`, **no** resting shadow. Shadow is reserved for genuinely
floating layers — popover, dropdown, dialog, sheet, toast. A dashboard where every card is elevated
has no hierarchy left to spend.

Interactive cards get `transition-colors` + `hover:bg-accent/50` — never `translateY` or `scale`,
which shifts layout and fights list scanning.

## 5. Motion (3/10 — subtle)

- Hover / focus / color: **150ms** `ease-out`
- Enter (popover, dialog, sheet): **200ms** — use `tw-animate-css` presets already in the project
- Exit: **150ms** — always faster than enter
- Animate `opacity` and `transform` only. Never `width`/`height`/`top`/`left`.
- No scroll-triggered reveals. Dashboard data is readable on paint.
- Every non-essential transition must be dropped under
  `@media (prefers-reduced-motion: reduce)`.

## 6. Interaction & accessibility (non-negotiable)

- Contrast ≥ 4.5:1 for text, ≥ 3:1 for UI borders and chart strokes — **in both themes**.
- Focus is visible everywhere. The `outline-ring/50` base rule stays; never `outline-none` without a
  replacement ring.
- Touch targets ≥ 44×44px with ≥ 8px separation.
- Icon-only buttons require `aria-label`; decorative icons require `aria-hidden="true"`.
- Every async action gives feedback within 100ms (pending state, skeleton, or toast).
- Skeletons mirror the real layout's dimensions so there is no layout shift on load.
- Live-updating numbers need `aria-live="polite"` on their container.
- `cursor-pointer` on everything clickable.

## 7. Link styling — **global rule must go**

`globals.css` currently applies `a { @apply underline; color: #171717 }` globally with a `.dark a`
override, forcing a `.no-underline` escape hatch on navigation, cards, and rows (9 call sites and
growing). Two hardcoded hex values also bypass the token system entirely.

**Rule:** links inherit color by default and are **not** underlined by default. Scope the underline
to prose contexts only:

```css
.prose a, [data-prose] a { @apply underline underline-offset-2; }
```

Then delete `no-underline` from component call sites. This is the single highest-leverage cleanup in
the codebase — it removes a whole class of styling override.

## 8. Component conventions

- Compose shadcn primitives (`Card` + `CardHeader` + `CardContent`); do not build prop-bag wrappers.
- New shared dashboard primitives live in `src/components/dashboard/`: `StatCard`, `SectionCard`,
  `PageHeader`, `EmptyState`, `DeliveryRow`.
- Every data surface must define all four states: **loading** (skeleton), **empty** (icon + one-line
  explanation + primary action), **error** (message + retry), **loaded**.
- Currency formats through one shared `formatPKR()` helper in `src/lib/format.ts` — not redefined
  per page (`page.tsx` currently defines its own).
- Icons from lucide-react only. Never emoji.

## 9. Anti-patterns (do not ship)

- ❌ Raw Tailwind palette colors in app code (`text-orange-600`, `bg-orange-50/50`)
- ❌ `hsl(var(--chart-N))` — the tokens are oklch
- ❌ Hardcoded hex in `globals.css` (`#171717`, `#888888`)
- ❌ Resting shadows on cards
- ❌ Spinners where a skeleton belongs
- ❌ Color as the only carrier of status meaning
- ❌ Scroll-reveal animation on data
- ❌ `text-base` as dashboard body size — it wastes vertical density
- ❌ Trend/delta indicators the API cannot actually support (see `pages/dashboard.md`)

## 10. Pre-delivery checklist

- [ ] No emoji icons; all icons lucide-react
- [ ] `cursor-pointer` on every clickable element
- [ ] Hover transitions 150–300ms
- [ ] Text contrast ≥ 4.5:1 in **light and dark**
- [ ] Focus visible on all interactive elements
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive verified at 375 / 768 / 1024 / 1440px
- [ ] No horizontal scroll at 375px
- [ ] Loading / empty / error / loaded states all present
- [ ] No new raw palette colors introduced (`grep -rnE "(text|bg|border)-(orange|green|red|blue|amber)-[0-9]"`)
