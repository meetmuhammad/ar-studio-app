# Environments

Three tiers. The Supabase project you point at **is** the environment — there is
no other switch.

| Tier | Supabase project | Ref |
|---|---|---|
| **Local** | Supabase Docker, `127.0.0.1:54321` | — |
| **Staging** | AR studio dummy database | `ohgqgkraybpvnfdbgmvl` |
| **Production** | AR studio | `drdnqsjjxmqiklwfadmk` |

Both refs are hardcoded in [`scripts/lib/env-guard.ts`](../scripts/lib/env-guard.ts)
on purpose. A guard has to work when the environment is already wrong, and
reading either ref from the environment would mean trusting the same file the
guard exists to protect against. Neither is a secret — `NEXT_PUBLIC_SUPABASE_URL`
ships inside the browser bundle, so both are already public. Secrecy is not what
protects the database; RLS and the absence of the service key from the client are.

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
                         │  any branch that is not `main`
                         ▼
┌── STAGING ──────────────────────────────────────────────────────────────┐
│  Supabase project:  ohgqgkraybpvnfdbgmvl  (own keys, own users)         │
│  Vercel:            Preview deployments, every non-main branch          │
│  Migrations:        merge to `staging` → deploy-staging.yml             │
│  Data:              synthetic only, from scripts/seed-supabase.ts       │
└──────────────────────────────────────────────────────────────────────────┘
                         │  PR → main, + manual approval
                         ▼
┌── PRODUCTION ───────────────────────────────────────────────────────────┐
│  Supabase project:  drdnqsjjxmqiklwfadmk                                │
│  Vercel:            Production deployments, `main` only                 │
│  Data:              the client's real business records                  │
│  Schema changes:    only via .github/workflows/deploy-production.yml    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Code and migrations flow left to right. Data never flows at all.**

---

## Safety rules

These are not aspirational; each one is enforced by something in this repo.

1. **Never run a schema- or data-changing command against production** without
   explicit, per-occasion human approval. Production migrations run only through
   `deploy-production.yml`, behind a GitHub Environment approval gate.
2. **Production is `drdnqsjjxmqiklwfadmk`.** Hardcoded as `PRODUCTION_REF`.
3. **Staging is `ohgqgkraybpvnfdbgmvl`.** Hardcoded as `STAGING_REF`.
4. **Migrations, seeds, resets, and destructive tests target local or staging
   only.** `requireNonProduction()` is default-deny: it permits `LOCAL` and
   `STAGING`, and exits non-zero on `PRODUCTION` *and* on anything unrecognised.
5. **State the target before any remote database-changing action**, in the form
   `TARGET DATABASE: STAGING - ohgqgkraybpvnfdbgmvl`. `npm run env:check` prints
   exactly this, so there is no reason to assert it from memory.
6. **A command that would target `drdnqsjjxmqiklwfadmk` stops and asks.**
7. **Never touch existing production records.**
8. **Never copy production customer, measurement, order, payment, ledger, vendor,
   or auth data into staging.** Staging data comes from
   `scripts/seed-supabase.ts` and is entirely synthetic. This is a privacy
   boundary, not a convenience one: the production tables hold a real business's
   real customers.
9. **No secrets in Git.** No key, password, database URL, or token belongs in a
   tracked file. `.gitignore` covers `.env`, `.env.staging`, and the whole
   `.env*.local` family.

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

### The three steps, in order

A migration is never applied to a tier it has not already survived on the tier
below.

**1 — Local.** Free, reversible, and the only place `db reset` is allowed.

```bash
npm run db:new add_something
npm run db:reset                  # replays everything from zero
npm run test                      # unit tests
```

**2 — Staging.** Preferred path: merge to `staging` and let
`deploy-staging.yml` apply it. It verifies the push actually applied, which
`supabase db push` does not reliably signal on its own.

To apply by hand instead, state the target first — out loud, in the PR, or in
the terminal — and confirm it with the tool rather than from memory:

```
TARGET DATABASE: STAGING - ohgqgkraybpvnfdbgmvl
```

```bash
npm run env:check                 # must print ✔ STAGING
supabase link --project-ref ohgqgkraybpvnfdbgmvl
supabase migration list --linked  # read this before pushing
supabase db push --linked
```

**3 — Production.** Only via `deploy-production.yml`, only on merge to `main`,
only after the GitHub Environment approval gate. The workflow runs a read-only
preflight first so the reviewer can see the exact diff they are approving.
Never `supabase db push` at production by hand — the break-glass exception below
is for incidents, and it is detected and reconciled, not silent.

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

---

## Vercel

Project `ar-studio-app` (`prj_v0fb2vtHkhlygYK99Y8CBqrFAeiD`), team
`arstudio-app's projects` (`team_xnIr3ZWHolrtTMgBaoIfl1Lz`).

### The build-time guard

The bullet above — "never set these to All Environments" — is the kind of rule
that is true, written down, and still broken eventually, because the mistake has
no symptom. A preview deployment wired to production looks like a working
preview right up until someone edits a real customer from a feature branch.

So it is also a build gate. [`scripts/check-deploy-env.ts`](../scripts/check-deploy-env.ts)
runs as `prebuild` and `predev`:

| Where | Requirement | On mismatch |
|---|---|---|
| `VERCEL_ENV=production` | must resolve to `drdnqsjjxmqiklwfadmk` | build fails |
| `VERCEL_ENV=preview` | must resolve to `ohgqgkraybpvnfdbgmvl` | build fails |
| local / CI | anything except production | build fails |

Preview is held to *is staging* rather than *is not production* for the same
reason `resolveTarget()` is default-deny: "not the one project I remembered to
name" is not the same as "safe".

`vercel.json` pins `buildCommand` to `npm run build` so the gate actually runs.
Left unset, Vercel may invoke `next build` directly, which skips npm lifecycle
scripts and silently skips the guard with it — a guard that no-ops is worse than
no guard, because you stop checking by hand.

To check any environment's wiring without deploying:

```bash
npm run env:deploy-check                                        # this machine
VERCEL_ENV=preview NEXT_PUBLIC_SUPABASE_URL=<url> npm run env:deploy-check
```

### One-time setup (manual, by a human)

Settings → Environment Variables. Add each variable **once per environment**,
never "All Environments":

| Environment | Variable | Value |
|---|---|---|
| Production | `NEXT_PUBLIC_SUPABASE_URL` | `https://drdnqsjjxmqiklwfadmk.supabase.co` |
| Production | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production anon key |
| Production | `SUPABASE_SERVICE_ROLE_KEY` | production service-role key |
| Preview | `NEXT_PUBLIC_SUPABASE_URL` | `https://ohgqgkraybpvnfdbgmvl.supabase.co` |
| Preview | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key |
| Preview | `SUPABASE_SERVICE_ROLE_KEY` | staging service-role key |

Then:

- Settings → Git → **Production Branch = `main`**. Every other branch is a
  Preview, and therefore staging.
- Settings → Deployment Protection → enable **Vercel Authentication** for
  Preview, so staging is not publicly reachable. Staging data is synthetic, but
  a preview URL is still a live, writable admin panel.

If a variable is currently scoped to All Environments, do not edit its scope —
delete it and recreate it per environment. An edited variable keeps its previous
value on already-built deployments.

**Verify**, rather than trusting that the above was done: push a branch, open the
build log, and confirm the `prebuild` line reads
`✔ build env OK — preview → staging (ohgqgkraybpvnfdbgmvl)`.

### GitHub secrets

| Secret | Used by |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | all deploy workflows |
| `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD` | `deploy-staging.yml` |
| `STAGING_ANON_KEY`, `STAGING_SERVICE_ROLE_KEY` | staging reseed job |
| `PRODUCTION_PROJECT_REF`, `PRODUCTION_DB_PASSWORD` | `deploy-production.yml`, `schema-drift.yml` |

`deploy-staging.yml` asserts `STAGING_PROJECT_REF == ohgqgkraybpvnfdbgmvl` before
linking — equality, not merely "is not production". A stale or mistyped secret
would otherwise migrate some third project, and a migration applied to the wrong
database is not undone by correcting the secret afterwards.

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
