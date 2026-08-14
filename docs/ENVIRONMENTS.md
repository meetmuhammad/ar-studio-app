# Environments

Three tiers. The Supabase project you point at **is** the environment — there is
no other switch.

```
┌── LOCAL ────────────────────────────────────────────────────────────────┐
│  npx supabase start        Postgres in Docker on 127.0.0.1:54322        │
│  npm run dev               reads .env.local                             │
│                                                                          │
│  Touches no hosted database. Reset it as often as you like.             │
└──────────────────────────────────────────────────────────────────────────┘
                         │  push a feature branch, open a PR
                         ▼
┌── CI ───────────────────────────────────────────────────────────────────┐
│  .github/workflows/ci.yml                                                │
│    lint · typecheck · route guards · unit tests · build                 │
│    replay every migration from zero against throwaway Postgres          │
│    assert RLS on every table, no anon-readable SELECT policy            │
│                                                                          │
│  No secrets. No hosted project. Safe to run on every PR.                │
└──────────────────────────────────────────────────────────────────────────┘
                         │  merge to `staging`
                         ▼
┌── STAGING ──────────────────────────────────────────────────────────────┐
│  Supabase project:  ar-studio-staging   (own ref, own keys, own users)  │
│  Vercel:            custom environment `staging`, behind Vercel Auth    │
│  Data:              synthetic only, from scripts/seed-supabase.ts       │
└──────────────────────────────────────────────────────────────────────────┘
                         │  PR staging → main, + manual approval
                         ▼
┌── PRODUCTION ───────────────────────────────────────────────────────────┐
│  Supabase project:  drdnqsjjxmqiklwfadmk                                │
│  Data:              the client's real business records                  │
│  Schema changes:    only via .github/workflows/deploy-production.yml    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Code and migrations flow left to right. Data never flows at all.**

---

## Which database am I pointed at?

```bash
npm run env:check
```

Prints the resolved target and exits non-zero for `PRODUCTION` or `UNKNOWN`, so
you can chain it in front of anything destructive:

```bash
npm run env:check && npx supabase db reset
```

`npm run seed`, `npm run create-users` and `npm run setup-roles` all run this
first and refuse to continue against production. The guard is **default-deny**:
an unrecognised project is treated as dangerous, not safe. Set
`STAGING_PROJECT_REF` to allow a staging project explicitly.

---

## Local setup

```bash
npm install
npx supabase start        # prints an API URL and keys
cp .env.example .env.local
# paste the printed values into .env.local

npm run seed              # 60 customers, 80 orders, 181 ledger entries
npm run create-users      # admin@staging.local / staff@staging.local
npm run dev
```

Sign in with `admin@staging.local` / `staging-admin-pw`.

Useful:

```bash
npm run db:reset          # replay all migrations from zero, wiping data
npm run db:new <name>     # create a new migration file
npm run test              # unit tests
npm run check:guards      # every API route wrapped, service role not client-reachable
npx supabase stop         # shut the local stack down
```

---

## Changing the schema

The Supabase SQL Editor is not part of this workflow. See "Break glass" below
for the one exception.

```bash
npm run db:new add_something      # creates supabase/migrations/<ts>_add_something.sql
# edit it
npm run db:reset                  # replays everything from zero, locally
```

Then open a PR. CI replays your migration against a clean database. Merging to
`staging` applies it to staging; merging to `main` applies it to production
behind a manual approval.

### The expand / contract rule

**Every migration must be safe to apply while the currently deployed code is
still running.** Deploys and migrations are never perfectly simultaneous, and
whichever lands first must not break the other.

A destructive change is therefore three migrations across three deploys:

| Step | Migration | Application code |
|---|---|---|
| **Expand** | add a nullable column, or add a constraint `NOT VALID` | writes both old and new |
| **Backfill** | `UPDATE` in batches, on its own | unchanged |
| **Contract** | `SET NOT NULL`, `VALIDATE CONSTRAINT`, drop the old column | reads new only |

The hand-applied `add-payment-fields.sql` did all three in one file against live
data. See [SCHEMA-HISTORY.md](SCHEMA-HISTORY.md) for what it did and why it is the
example this rule exists to prevent.

This asymmetry is the reason the rule exists: **code rolls back instantly via
Vercel; migrations do not.** Under expand/contract a code rollback is always
safe, because the expanded schema still satisfies the older code.

---

## Break glass

During a **declared incident** — not for convenience — you may use the SQL
Editor against production. When you do:

1. Run the SQL.
2. Note it in the incident log: what, when, why.
3. **Within 24 hours**, capture it as a migration and open a PR:
   ```bash
   supabase db pull
   git add supabase/migrations && git commit -m "capture break-glass change"
   ```

`.github/workflows/schema-drift.yml` runs `supabase db diff --linked` against
production every morning at 06:00 UTC. Any object in production that is not in
`supabase/migrations/` fails the job and keeps failing until it is reconciled.

That is what makes the exception self-healing instead of silently permanent. A
ban with no exception gets broken; a ban with a detector gets repaired.

---

## Secrets

Exactly three variables. Which project they point at is the environment.

| Variable | Exposure | Local | Staging | Production |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **in the browser bundle** | local stack | staging ref | prod ref |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **in the browser bundle** | local demo key | staging anon | prod anon |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only, never** | local demo key | staging secret | prod secret |

- **Never set any of these to "All Environments" in Vercel.** A Supabase
  variable scoped to all environments means every preview deployment of every
  branch writes to production. That single mistake defeats this entire setup.
- Vercel Preview deployments must point at **staging**, never production.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses every RLS policy. It must never gain a
  `NEXT_PUBLIC_` prefix, and `npm run check:guards` fails the build if
  `createAdminSupabaseClient` is imported outside `src/app/api/**` or
  `src/lib/database.ts`.
- Set the variables by hand rather than relying on the Supabase–Vercel
  integration; it has a documented failure to sync variables for persistent git
  branches.

### GitHub secrets

| Secret | Used by |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | all deploy workflows |
| `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD` | `deploy-staging.yml` |
| `STAGING_ANON_KEY`, `STAGING_SERVICE_ROLE_KEY` | staging reseed job |
| `PRODUCTION_PROJECT_REF`, `PRODUCTION_DB_PASSWORD` | `deploy-production.yml`, `schema-drift.yml` |

Production secrets belong to a GitHub **Environment** named `production` with a
required reviewer. Without that reviewer configured, `deploy-production.yml`
migrates production automatically on every merge to `main`.

---

## Authorization

Every API route export is wrapped:

```ts
export const GET    = withAuth(GETHandler)                                    // any signed-in user
export const DELETE = withAdmin<{ params: Promise<{ id: string }> }>(DELETEHandler)  // admin only
```

`npm run check:guards` fails if any route exports a bare handler. This is a
shape check, not a grep: a check placed after the data fetch would pass a grep
and protect nothing, whereas an unwrapped export cannot be written by accident.

Routes use the **service-role** client, which bypasses RLS. The wrapper is
therefore the only authorization on the API path — that is a deliberate trade,
because authorization here is role-based (admin/staff) rather than row-based.
RLS is still enabled on all 10 tables and protects direct PostgREST access with
the public anon key.

`src/middleware.ts` is defense in depth and handles session refresh. It checks
authentication only, never roles — the role map lives with the routes so there
is one source of truth.

---

## What is deliberately not automated

- **Creating the staging Supabase project.** A human decides when to spend money
  on infrastructure.
- **Vercel environment configuration.** Set by hand, once, and verified.
- **Production data.** Never seeded, never reset, never copied anywhere.
