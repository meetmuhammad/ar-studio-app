/**
 * CI guard: every API route export must be wrapped in withAuth/withAdmin/withRoles,
 * and the service-role module must never be importable from a client bundle.
 *
 * This exists because of a pattern in this codebase: the correct abstraction gets
 * written and then not wired up. `api-auth.ts` sat unused by all 16 routes;
 * `validators.ts` is imported by 4 of 16 and `CreatePaymentSchema` has no callers
 * at all. A convention that depends on remembering will be forgotten here.
 *
 * A grep for "requireAuth" would not be enough: a check placed after the data
 * fetch, or inside a branch, passes a grep and protects nothing. Requiring the
 * WRAPPED EXPORT FORM means an unprotected route cannot be written by accident —
 * it changes the shape of the export, and this check fails.
 *
 * Run: npx tsx scripts/check-route-guards.ts
 */
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = process.cwd()
const API_DIR = join(ROOT, 'src/app/api')
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const WRAPPERS = ['withAuth', 'withAdmin', 'withRoles']


interface Failure {
  file: string
  message: string
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry === 'route.ts' || entry === 'route.tsx') out.push(full)
  }
  return out
}

const failures: Failure[] = []
const routeFiles = walk(API_DIR)
let wrappedCount = 0

for (const file of routeFiles) {
  const rel = relative(ROOT, file)
  const src = readFileSync(file, 'utf8')

  for (const method of HTTP_METHODS) {
    // Unwrapped: `export async function GET(` or `export function GET(`
    const bare = new RegExp(`^\\s*export\\s+(async\\s+)?function\\s+${method}\\s*\\(`, 'm')
    if (bare.test(src)) {
      failures.push({
        file: rel,
        message:
          `${method} is exported as a bare function. Wrap it:\n` +
          `      async function ${method}Handler(...) { ... }\n` +
          `      export const ${method} = withAuth(${method}Handler)`,
      })
      continue
    }

    // Wrapped: `export const GET = withAuth(...)` / `withAuth<Ctx>(...)`
    const wrapped = new RegExp(
      `^\\s*export\\s+const\\s+${method}\\s*=\\s*(${WRAPPERS.join('|')})\\s*[<(]`,
      'm',
    )
    // Exported at all, but by some other means.
    const exportedAtAll = new RegExp(`^\\s*export\\s+(const|let|var|function|async function)\\s+${method}\\b`, 'm')

    if (wrapped.test(src)) {
      wrappedCount++
    } else if (exportedAtAll.test(src)) {
      failures.push({
        file: rel,
        message: `${method} is exported but not wrapped in ${WRAPPERS.join('/')}.`,
      })
    }
  }
}

// ── client/server boundary ───────────────────────────────────────────────────
// The dangerous thing is the SYMBOL, not the module. `@/lib/supabase` exports
// both `createServerSupabaseClient` (anon, cookie-scoped — safe, and used by
// api-auth.ts) and `createAdminSupabaseClient` (service role, bypasses every RLS
// policy). Only the latter is restricted.
//
// A first version of this check flagged the module and produced a false
// positive on api-auth.ts. Flagging the module would have trained everyone to
// ignore the check, which is worse than not having it.
const SERVICE_ROLE_SYMBOL = 'createAdminSupabaseClient'

/** Allowed to construct a service-role client. */
function isAllowedServiceRoleCaller(rel: string): boolean {
  return (
    rel === 'src/lib/supabase.ts' ||   // defines it
    rel === 'src/lib/database.ts' ||   // server-only data layer, used by routes
    rel.startsWith('src/app/api/')     // route handlers
  )
}

function walkTs(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walkTs(full))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
  }
  return out
}

for (const file of walkTs(join(ROOT, 'src'))) {
  const rel = relative(ROOT, file)
  if (isAllowedServiceRoleCaller(rel)) continue

  const src = readFileSync(file, 'utf8')

  // Match the IMPORT, not any mention. A file cannot use the symbol without
  // importing it, and matching bare occurrences flagged api-auth.ts for naming
  // it in a docstring — a false positive that would teach people to skip this
  // check.
  const importsServiceRole = new RegExp(
    `import\\s+[^;]*\\b${SERVICE_ROLE_SYMBOL}\\b[^;]*from`,
  ).test(src)
  if (!importsServiceRole) continue

  const isClientComponent = /^\s*['"]use client['"]/m.test(src)
  failures.push({
    file: rel,
    message:
      `references ${SERVICE_ROLE_SYMBOL}` +
      (isClientComponent ? ' from a CLIENT COMPONENT' : '') +
      '. That client is constructed with SUPABASE_SERVICE_ROLE_KEY and bypasses all ' +
      'RLS policies. It may only be used in src/app/api/** or src/lib/database.ts. ' +
      'Use @/lib/supabase-client for anything reachable from the browser.',
  })
}

// ── report ───────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error('\n  ✖ Route guard check failed\n')
  for (const f of failures) {
    console.error(`    ${f.file}`)
    console.error(`      ${f.message}\n`)
  }
  console.error(`  ${failures.length} problem(s).\n`)
  process.exit(1)
}

console.log(
  `\n  ✔ Route guard check passed — ${wrappedCount} wrapped handlers across ` +
    `${routeFiles.length} route files, service-role module not reachable from client code.\n`,
)
