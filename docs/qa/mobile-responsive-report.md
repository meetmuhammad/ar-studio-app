# Mobile-first web app: implementation and verification report

Branch `feat/mobile-first-pwa` (from `docs/ledger-mcp-timezone-confirmed`). **Nothing committed, pushed or deployed.**
Status words: **PASS**, **FAIL**, **BLOCKED**, **NOT TESTED**, **N/A**. "Implemented" never means "tested", and a
rendering engine at a phone-sized viewport is **not** a phone.

## 1. What was done

- Mobile reference (read-only): `/Users/Ammar/development/custom-projects/ar-studio-mobile` (Expo). Adopted its
  *structure*: bottom tabs (Home / Orders / Customers / Finance / More), compact header, card rows, 44px targets.
  **Decision for the owner:** its colours were not adopted. The mobile app declares an independent warm "cotton and
  indigo" palette; the web keeps its existing tokens so desktop is unchanged. A palette swap is one file (`globals.css`).
- Shell: phone bottom tab bar + More sheet (`bottom-nav.tsx`); iPad portrait icon rail and landscape/desktop full
  sidebar (`sidebar.tsx`); compact header with one "Create" menu on phones; one nav source (`nav-items.ts`) so a role
  cannot see a link on one surface that another hides; `h-dvh`, safe-area insets, `viewport-fit=cover`, zoom left on.
- Tables: `Table stack` turns rows into labelled cards using a **container query** (not a viewport breakpoint), because
  an iPad landscape has 1024px but a table only ~700px beside the sidebar. Thresholds are measured minimum table widths
  (ledger 869, customers 785, vendors 775, orders 702). Two-up cards where there is room. Every cell, total and action is kept.
- Dialogs: phone bottom sheets (`dvh`, safe area, scroll), fixed the inline `style={{width:'70vw'}}` that clipped the
  order, payment, order-details, customer-detail and measurement dialogs; compact order stepper; native `confirm()`
  replaced by the existing in-app delete dialog for vendor, ledger entry and payment deletes.
- Touch: `pointer-coarse` sizing on buttons/inputs/selects/icon buttons/sidebar links; checkbox hit-areas grown without
  changing their look; `prefers-reduced-motion` honoured.
- Defects found by testing and fixed (all UI-side): ledger totals did not refresh after saving an entry; a failed list
  load was silent (now an error state with Retry on Customers, Orders, Ledger); unnamed icon buttons (orders, vendors,
  ledger, vendor back, item remove, password toggle, three payment amount fields); More sheet did not return focus;
  toasts covered the tab bar; checkboxes rendered as tall pills.
- Home screen: `src/app/manifest.ts`, `public/icons/*`, apple-touch-icon, theme colours, `appleWebApp`. **No service worker.**
  See `docs/HOME-SCREEN-INSTALL.md`. **Icons are placeholders** (gold "AR" on black): the mobile docs name a gold panther
  on black as the brand mark, but that artwork is in neither repo and the mobile app still ships Expo's template icon.
  Replace the files in `public/icons/` (or edit `scripts/pwa/generate-icons.mjs`) when the artwork exists.

Backend, auth, permissions, MCP and migrations were **not changed** (`git status` shows no file under `src/app/api`,
`src/lib/ledger-mcp`, `src/lib/api-auth.ts`, `supabase/`).

## 2. Screen / module checklist

| Module (route) | Roles | Responsive layout | Workflow tested (real UI, writes cleaned up) |
|---|---|---|---|
| Sign in (`/sign-in`) | all | done | PASS: validation, wrong password, success |
| Dashboard (`/`) | admin | done | load only (read-only screen); staff redirected |
| Customers (`/customers`) | admin, staff | done (cards, error state) | PASS create, search, reload, edit, delete; staff too |
| Orders (`/orders`) | admin, staff | done (cards, pagination, error state) | PASS create (double-submit = 1), details, edit, add payment, search |
| Measurements (`/measurements`) | admin, staff | done | PASS create (double-submit = 1), filter, edit, delete |
| General ledger (`/ledger`) | admin | done (wide cards, stacking filters, totals) | PASS add (double-submit = 1), totals move by exactly the amount and back, delete |
| Vendors (`/vendors`) | admin | done | PASS create, delete with in-app confirmation |
| Vendor ledger (`/vendors/[id]`) | admin | done | PASS bill create, totals |
| OAuth consent (`/oauth/consent`) | signed-in | viewport unit fixed only | **NOT TESTED** (needs a live authorization id; MCP flow itself untouched) |
| Settings | n/a | **no such screen exists** | N/A |

## 3. Commands and results

All local. Server: `next start -p 3100` of the **production build**, `LEDGER_MCP_ENABLED=true`,
`LEDGER_MCP_ALLOWED_CLIENT_IDS=local-test-client`, `BUSINESS_TIMEZONE=Asia/Karachi`.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (baseline PASS) |
| `npx eslint src scripts e2e` | 34 errors, 65 warnings = **identical to baseline** (all pre-existing `no-explicit-any` / `no-unescaped-entities`). `eslint .` alone is not meaningful: stale `.next` output under `.claude/worktrees/` adds ~12,000 findings |
| `npx next build` | **PASS** (baseline PASS); `/manifest.webmanifest` route present |
| `npx playwright test --project=chromium` | 128 tests: 126 passed, 2 failed in the first full run |
| `npx playwright test --project=webkit` | 128 tests: 123 passed, 3 failed, 2 skipped (setup reused a fresh login) |
| the 5 failures | one **test-isolation bug of mine**: the sign-out test signed out the shared staff account, and Supabase sign-out is global, so it revoked sessions other tests were using. Fixed (dedicated `qa-signout@` account). Re-run of `nav` + `workflows`: **44/44 on Chromium, 44/44 on WebKit** |
| `normalize.check` / MCP `auth.check` / `check-order-validators` | 14/14, all passed, all passed |
| `protocol.check` (MCP over HTTP, SDK client) | **31/31** |
| `security/db-privileges`, `api-auth`, `auth-fetch` | 14/14, 95/95, 11/11 |
| `scripts/qa/api-matrix.check.ts` (real HTTP) | **185/186**; the one FAIL is pre-existing (section 6) |
| `scripts/ledger-mcp/timezone.check.ts` | **BLOCKED**: needs a server started *without* `BUSINESS_TIMEZONE` on another port |

Spec files (`e2e/`): `audit` (layout sweep), `nav`, `workflows`, `dialogs`, `states`, `pwa`. Helpers: `cleanup.mjs`,
`db-counts.mjs`, `contact-sheet.mjs`, `before-after.mjs`, `screenshot-index.mjs`.

## 4. Browser / device matrix

Engines: Chromium and WebKit through Playwright. **No physical device was used.** Viewports: 360, 390, 430, 639/640 and
767/768 (breakpoint edges), 768, 820, 1023/1024, 1180, 1440. Touch viewports run with touch emulation and a coarse pointer.

| Check | Roles | Viewports | Engines | Result |
|---|---|---|---|---|
| Layout sweep: 11 screens/states x roles x viewports, overflow, escaping elements, unnamed controls, touch targets <40px, console errors, failed requests, broken images | admin, staff, signed out | 12 (Chromium), 8 (WebKit) | both | **PASS**: 132 + 88 states, 0 issues, 0 page overflow, 0 small targets |
| Navigation surface per role (tab bar / rail / sidebar, clipping, content not hidden behind bar, More sheet, focus return) | admin, staff | 360/390/430/639, 820, 1024, 1180, 1440 | both | **PASS** |
| Denied access: staff to `/`, `/ledger`, `/vendors`; signed-out to every private route | staff, none | 390 | both | **PASS** |
| Deep link, reload, back, logout, invalid-session redirect, sign-in validation | admin, staff | 390 | both | **PASS** |
| Principal workflows (customers, orders+payments+edit, measurements, ledger, vendors+bill) | admin | 390, 820, 1440 | both | **PASS** |
| Staff workflow + staff APIs closed to ledger/vendor-ledger | staff | 390, 820 | both | **PASS** |
| 12 dialogs: fit, no inner overflow, main action reachable and not covered, Escape closes | admin | 360, 390, 820, 1180, 1440 | both | **PASS** (60 per engine) |
| Very long names, 999,999,999.99 amount, empty results, API failure + Retry | admin | 360, 430, 820 | Chromium | **PASS** (WebKit run of `states`: PASS) |
| Keyboard focus ring, reduced motion | admin | 390 | both | **PASS** |
| Real iPhone/iPad Safari, Android Chrome, Firefox, on-screen keyboard, pinch zoom by hand | n/a | n/a | n/a | **NOT TESTED** |

Evidence: 472 screenshots (132 before, 340 after), `docs/qa/screenshot-index.md` (screen, role, viewport, browser, file).
Files are under `qa-artifacts/` (git-ignored). Before/after sheets: `qa-artifacts/before-after/`. Reviewed by eye:
phone/tablet/desktop sheets for every module and the phone dialogs; the clipped tables, header collision and 70vw dialogs
seen there are what the fixes above address.

## 5. Home screen and standalone

| Item | Result |
|---|---|
| Manifest: name, short_name, `start_url` `/`, scope `/`, `display: standalone`, colours, 3 icons | **PASS** (served 200) |
| Icon files exist, correct MIME, real pixel sizes match the manifest (192, 512, 512 maskable, 180 apple) | **PASS** |
| apple-touch-icon opaque RGB, linked, theme-color, mobile-web-app-capable, zoom not disabled | **PASS** |
| Signed-out launch goes to `/sign-in`; admin to dashboard; staff to `/customers`; no auth bypass | **PASS** |
| No service worker, no CacheStorage, API responses not cacheable | **PASS** |
| "Add to Home Screen" offered, standalone launch, session shared or not with the browser, status bar, keyboard in standalone | **NOT TESTED** (needs a device) |

Manual checklist for a real device: (1) install via `docs/HOME-SCREEN-INSTALL.md`; (2) launch from the icon, confirm no
browser bar and the sign-in screen; (3) sign in as admin, check Home/Orders/Customers/Ledger/More; (4) sign in as staff,
confirm Ledger/Vendors are absent; (5) rotate an iPad, try split view; (6) open a dialog and type in a field with the
keyboard up, confirm the field and the main button stay visible; (7) pinch to zoom a table; (8) sign out and relaunch.

## 6. Endpoints and MCP

Full matrix: `docs/qa/endpoint-matrix.md` (47 method+path pairs, **45 PASS, 1 FAIL, 1 split**; the split is
`sync-payments`: rejections PASS, admin path **BLOCKED** because it deletes and rebuilds every `order_payment` ledger row).
Real HTTP with real Supabase tokens against the local database; `qa-staff` / `qa-admin` / `qa-norole`. Tenant isolation is
**N/A** (the data model has no tenants). MCP: discovery metadata correct (resource, issuer, scopes `openid email profile`),
`/api/mcp` answers 401 without a token and for ordinary web tokens, `protocol.check` 31/31 including the synthetic
prepare, commit and idempotency flow. The MCP configuration was not touched. Real financial writes through MCP: not performed.

**Pre-existing findings, not fixed (backend, out of scope):**
1. `GET /api/measurements?search=` always returns 500 (PostgREST parse error on a flat `.or()`). The Measurements screen is
   unaffected because it filters client-side.
2. Customers, measurements, vendors, categories, tags, customer-measurements and `dashboard-stats` APIs have no auth guard
   (known release blocker in `docs/LEDGER-MCP.md`).
3. `PATCH /api/orders/[id]` with a partial body nulls `total_amount`. The UI always sends the full order, which the order edit test proves.
4. Payment edit/delete and order delete do not update or remove the mirrored ledger row (my tests had to remove the
   "Advance payment for Order #..." rows themselves).
5. `POST /api/general-ledger` accepts a negative debit; no idempotency on payments or orders. The UI blocks double-submit:
   one order, one payment, one ledger row, one measurement per double-click (all **PASS**).
6. Many validation failures and unknown ids return 500; `GET /api/orders?status=all` returns 500 (the UI never sends it).
7. **PKR is formatted differently per engine.** Chromium prints no decimals (1234.50 shows as Rs 1,235; 999,999,999.99 as
   Rs 1,000,000,000); WebKit prints Rs 1,234.50. A ledger should show the same amount everywhere; pin the fraction digits.
   The order-details dialog also prints raw `757500.00` while lists print `Rs 757,500`. Left as is, as instructed.
8. Pages use `<h2>` for titles on Customers/Orders/Measurements and `<h1>` elsewhere (heading order).

## 7. Test database and cleanup

- Target for every write: **LOCAL** Supabase `http://127.0.0.1:54321` (guards: `e2e/global-guard.ts`, `assertWritableDb`, URL
  checks in each script). **No production or staging access** during this task, no production writes, no migrations, no push, no deploy.
- Accounts: synthetic `qa-admin`, `qa-staff`, `qa-norole`, `qa-signout` `@arstudio.test` (`scripts/qa/provision-qa-users.ts`);
  real sign-in through the UI, no service-role pretence of authorization.
- All test records are tagged `QA-E2E` / `QA-API` and removed through the ordinary admin API in `finally`.
  `node e2e/db-counts.mjs check`: **all 11 tables equal the baseline** after the final runs
  (customers 20, orders 30, measurements 30, payments 22, general_ledger 30, vendors 6, vendor_ledger 17). The only change
  to the database from this work is the four synthetic QA accounts (users 6 to 7 for `qa-signout`; the others earlier).
  `node e2e/cleanup.mjs` found nothing left.
- `package.json`: added dev dependency `@playwright/test`; `playwright.config.ts`, `e2e/`, `.gitignore` entries added.
