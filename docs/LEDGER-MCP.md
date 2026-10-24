# Ledger MCP pilot

An MCP server that lets an AI assistant read the AR Studio general ledger and record
**one ledger entry at a time, after the user has seen a preview and said yes**.
Ledger only: no measurements, customers, orders, payments, edits or deletes.

> **Status: a local slice, not deployed.** It is behind `LEDGER_MCP_ENABLED` (off by
> default, both routes 404). It has been exercised against the local database with the
> official SDK client. It has **not** been connected to Claude or ChatGPT.

## What the ledger means here (taken from the app, not invented)

| Fact | Where it comes from |
|---|---|
| A row has a **debit XOR a credit** (database check constraint) | `general_ledger.chk_debit_or_credit` |
| **Debit = money in**, raises the balance. **Credit = money out**, lowers it | `calculate_general_ledger_balance()` |
| The running balance is computed by database triggers, including for back-dated rows | `trg_calculate_*`, `trg_recalc_*` |
| Amounts are `numeric(12,2)`; currency is **PKR** in every screen, there is no currency column | schema, `ledger/page.tsx` |
| Entry types: `opening_balance`, `order_payment`, `vendor_payment`, `miscellaneous` | `general_ledger_entry_type_check` |
| A vendor payment is a credit and needs a vendor | `ledger-entry-form.tsx` |
| **The ledger has no customer column.** It references `order_id`, `vendor_id`, `tag_id` | schema |
| Totals = sum of debits, sum of credits, balance = debit − credit, entry count | `GET /api/general-ledger/stats` |

**Consequences for the pilot**

* The MCP creates only `miscellaneous` (standalone receipt or expense) and `vendor_payment`.
* `order_payment` is **refused with an explanation**. Those rows are derived: the Payments flow writes them, and
  `POST /api/general-ledger/sync-payments` deletes every one and rebuilds it from orders and payments. An assistant-made
  one would not update the order and would be deleted by the next sync. An advance or balance payment from a
  customer must go through the Payments screen.
* "Record 5,000 received from Ali as an advance" therefore cannot be a customer-linked record. The assistant is told to say so, and
  may record a clearly labelled **standalone** receipt only if the user explicitly wants that. The preview states it is not linked to any order or customer.
* No customer lookup tool: the ledger does not need a customer id. A vendor lookup exists because a vendor payment does, and
  vendors are only ever chosen **by id**, never by name.
* "Today" is the **business date** in `BUSINESS_TIMEZONE`. The app configures none (the web form uses the UTC date, which is
  yesterday for part of every night in Pakistan), so there is no default and the tools refuse to guess.

## Tools

All inputs are validated; money is **text** (`"5000.50"`), never a number, with at most 2 decimals.

| Tool | Input | Effect | Annotations |
|---|---|---|---|
| `list_ledger_entries` | `start_date?`, `end_date?`, `entry_type?`, `vendor_id?`, `search?`, `page` (≥1), `page_size` (1–50, default 20) | Reads, newest first. Returns `business_today` and `timezone` | read-only |
| `get_ledger_summary` | `date?` (default business today) | The day's money in / out / net / count, and the all-time totals, using the app's own definitions | read-only |
| `find_vendors` | `query` (2–80 chars) | Up to 10 vendors with ids; flags ambiguity | read-only |
| `prepare_ledger_entry` | `direction` (`receipt`\|`expense`), `amount`, `entry_date`, `description?`, `entry_type`, `vendor_id?`, `notes?`, `idempotency_key?` | Stores a short-lived **proposal** and returns a preview. **Writes nothing to the ledger** | not read-only, not destructive |
| `commit_ledger_entry` | `proposal_id` | Saves exactly that proposal. Safe to repeat | not read-only, not destructive |

Not exposed: SQL, arbitrary queries, edit, delete, refunds, payment capture, bulk import, customers, orders.

## Prepare → confirm → commit

1. **Prepare** normalizes the request (missing or ambiguous fields come back as questions to ask the user, never guesses),
   stores it in `ledger_mcp_proposals` bound to the authenticated user, and returns the preview: amount, currency, side, date,
   type, description, vendor, and that no money moves. A look-alike entry on the same day raises a duplicate **warning**.
2. The assistant shows the preview and asks. **Only after an explicit yes** it calls commit.
3. **Commit** runs one SQL function, `commit_ledger_proposal`, in one transaction under a row lock: it re-checks that the user is an admin,
   that the proposal belongs to them, is unexpired and unsaved, then inserts the row (the existing triggers compute the balance and mirror
   vendor entries) and marks the proposal committed. Any failure rolls the whole thing back and leaves the proposal pending.

**Retries.** The same `idempotency_key` with the same entry returns the same proposal; with a different entry it is a conflict; an expired one
is refused (use a new key). Committing twice, or six times at once, writes one row (the lock serialises them). A proposal outlives nothing:
default 10 minutes (`LEDGER_PROPOSAL_TTL_SECONDS`).

**Audit.** `ledger_mcp_audit` records who, which action, the outcome code and the ids. It holds **no amounts, descriptions or tokens**.

### The limit of "confirmation"

A tool argument cannot prove a human agreed: the assistant makes the call, and this server cannot tell a user's "yes" from the
assistant saying yes for them. What actually protects you:

* `commit_ledger_entry` and `prepare_ledger_entry` are **not** marked read-only, which is what makes a client such as Claude show its own
  per-tool approval prompt. Anthropic's guidance is to use "Allow always" only for tools you trust to run unsupervised, and notes that in
  Research mode connector tools can run without further approval. **Do not choose "Allow always" for `commit_ledger_entry`** during the pilot.
* Proposals expire, are bound to one user, and the entry is the stored one, so a commit can never save something other than what was previewed.
* Nothing is irreversible in a way the web ledger cannot see: every saved entry is an ordinary ledger row.

## Authentication

* Every request needs `Authorization: Bearer <Supabase access token>`. It is **verified by Supabase Auth** (`auth.getUser`), the role is read from
  `public.users` by the server, and only `admin` is allowed (staff get 403, a bad token 401 with a `WWW-Authenticate` challenge pointing at
  `/.well-known/oauth-protected-resource/api/mcp`).
* Secrets stay server-side. The service-role key is never sent anywhere; the user's token is verified, never forwarded.
* Browsers are refused (no CORS, `Origin`/`Host` allow-listed).
* **Unverified:** Supabase's docs do not state support for RFC 8707 resource indicators, so the token's audience cannot be bound to this endpoint.
  Any valid admin token from the same Supabase project is accepted. Mitigations available: `LEDGER_MCP_REQUIRE_OAUTH_CLIENT=true` (rejects ordinary
  web-session tokens) once the OAuth server issues the tokens. Confirm what claims Supabase puts in OAuth tokens before relying on that flag.

## Run it locally (isolated database only)

```bash
# 0. confirm the target is local: .env.local must point at http://127.0.0.1:54321
# 1. apply the migrations to the LOCAL database
docker exec -i supabase_db_ar-studio-app psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < supabase/migrations/20261024000100_ledger_mcp_proposals.sql
#    (20261024000000_close_role_escalation_and_ledger_direct_access.sql must already be applied)

# 2. start the app with the endpoint on (pick any free port)
LEDGER_MCP_ENABLED=true LEDGER_MCP_PUBLIC_URL=http://localhost:3107 \
BUSINESS_TIMEZONE=Asia/Karachi npx next dev -p 3107

# 3. run the checks, each on its own
npx tsx scripts/ledger-mcp/normalize.check.ts                       # no database, no server
npx tsx scripts/check-order-validators.ts                           # no database, no server
MCP_TEST_BASE=http://localhost:3107 npx tsx --env-file=.env.local scripts/ledger-mcp/protocol.check.ts   # 30 checks

# 4. two negative configurations, each needs the app restarted:
#    - no LEDGER_MCP_ENABLED at all: both routes must 404 (default-off)
#    - enabled but no BUSINESS_TIMEZONE: scripts/ledger-mcp/timezone.check.ts (tools must refuse)
```

The security checks are separate: `scripts/security/{db-privileges,api-auth,auth-fetch}.check.ts`.

You can also point the MCP Inspector at it (`npx @modelcontextprotocol/inspector`, Streamable HTTP, URL `http://localhost:3107/api/mcp`, header
`Authorization: Bearer <a local admin's access token>`). That demonstrates the protocol. It is **not** a Claude or ChatGPT connection.

## Demo conversation

> **You:** What's in the ledger today?
> *(assistant → `get_ledger_summary`)* "Business date 2026-10-24. Money in PKR 0.00, out PKR 0.00, 0 entries today. All time: balance PKR 903,500.00."
> **You:** Record 5,000 rupees received from Ali as an advance, today.
> *(assistant explains an advance against an order belongs in Payments; you say "just a standalone receipt" → `prepare_ledger_entry`)*
> "RECEIPT (money in) PKR 5,000.00 · 2026-10-24 · miscellaneous · 'Advance received from Ali (cash)' · not linked to any order or customer · no money moves. Save it?"
> **You:** Yes. *(approval prompt → `commit_ledger_entry`)* "Saved. Ledger balance after this entry: PKR 908,500.00."
> *(open the web ledger: the entry is there, the Total Debit card is up by 5,000, balances are consistent.)*

## Release blockers (not shortcuts to be waived)

1. **No audience binding.** The access token's audience cannot be tied to this endpoint (see Authentication). Until that is resolved or an
   equivalent control is in place and tested, any valid admin token from the Supabase project is accepted here.
2. **The real client OAuth flow is untested.** Everything above was exercised with the SDK client and Supabase session tokens against the local
   database. The local auth server has its OAuth endpoints disabled, so discovery → dynamic registration → consent → token → call has never run.
3. **The production timezone is unconfirmed.** `Asia/Karachi` was used for local tests only; the owner must confirm the production value.

## What a real phone pilot still needs

Connecting Claude needs a **publicly reachable HTTPS** endpoint: Anthropic's connectors call your server from Anthropic's cloud, so `localhost` cannot work.
Per Anthropic's custom-connector guide: Pro/Max add one under *Customize → Connectors → + Add → Add custom connector* (Team/Enterprise: an owner adds it under
Organization settings → Connectors), then choose how sign-in works. The guide describes connector use across clients including the mobile apps but gives
**no mobile-specific steps and says nothing about voice**: whether writes work from a phone or by voice is **untested** and must be checked on the real account.

1. **Review and approve this branch**, then deploy it. Nothing is exposed until step 5.
2. **Apply the migrations to the right database, with explicit approval each**: staging first (`ohgqgkraybpvnfdbgmvl`), capture current grants with
   `scripts/security/capture-grants.sql` first, then production (`drdnqsjjxmqiklwfadmk`). The role-escalation migration is a security fix needed on production regardless of the MCP.
3. **Enable Supabase's OAuth 2.1 server** (Dashboard → Authentication → OAuth Server) and dynamic client registration. Supabase's docs warn DCR lets any MCP client register;
   require user approval, watch registrations, validate redirect URIs. Agent sign-ins count toward Monthly Active Users.
4. **Build the consent page** the OAuth server redirects to (client name, requested scopes, approve/deny, revoke later). `@supabase/supabase-js` is 2.57.4 here and has no OAuth helpers; upgrade and verify.
   Not buildable or testable locally: the local auth server has the OAuth endpoints disabled.
5. **Set the environment** (`.env.ledger-mcp.template`) on the deployed environment: `LEDGER_MCP_ENABLED=true`, `LEDGER_MCP_PUBLIC_URL`, `BUSINESS_TIMEZONE` (**confirm the zone with the owner**).
6. **Add the connector in Claude**, sign in as an admin, and run the demo against a **staging** database first. Never test writes on production data.
7. Decide `LEDGER_MCP_REQUIRE_OAUTH_CLIENT` after inspecting a real OAuth token's claims.
8. Close the remaining open API routes (customers, measurements, vendors, categories, tags, `dashboard-stats`): they are still unauthenticated and are outside this pilot.

## Files

`src/app/api/mcp/route.ts` · `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts` · `src/lib/ledger-mcp/{config,auth,normalize,proposals,server}.ts` ·
`src/lib/ledger-service.ts` (shared by the REST routes and the MCP) · `supabase/migrations/20261024000100_ledger_mcp_proposals.sql` · `scripts/ledger-mcp/*.check.ts`
