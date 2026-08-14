/**
 * Create the two synthetic sign-in accounts for local / staging.
 *
 * Replaces the original script, which:
 *   - hardcoded admin@example.com / admin123 (the password later found in a
 *     publicly-readable database dump),
 *   - logged errors and carried on, then exited 0 regardless, so a failed run
 *     looked identical to a successful one,
 *   - failed on a second run because the auth user already existed.
 *
 * This version is idempotent, exits non-zero on real failure, and is blocked
 * from production by requireNonProduction().
 *
 * Passwords are intentionally weak and printed to the console: these accounts
 * exist only in environments containing fabricated data, and a password nobody
 * can find is a password nobody can test with. They must never be created in an
 * environment holding real customer records — which is what the guard enforces.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })
config({ path: resolve(__dirname, '../.env') })

import { createClient } from '@supabase/supabase-js'
import { requireNonProduction } from './lib/env-guard'

const target = requireNonProduction('create-demo-users')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

interface DemoUser {
  email: string
  password: string
  name: string
  role: 'admin' | 'staff'
}

// .local addresses: reserved by RFC 6762, so these can never route real mail
// even if a staging environment is accidentally given a working SMTP config.
const USERS: DemoUser[] = [
  { email: 'admin@staging.local', password: 'staging-admin-pw', name: 'Staging Admin', role: 'admin' },
  { email: 'staff@staging.local', password: 'staging-staff-pw', name: 'Staging Staff', role: 'staff' },
]

/** Find an existing auth user by email, paging until found or exhausted. */
async function findAuthUserId(email: string): Promise<string | null> {
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (hit) return hit.id
    if (data.users.length < 200) return null
    page++
  }
}

async function upsertUser(user: DemoUser): Promise<void> {
  let id = await findAuthUserId(user.email)

  if (id) {
    // Idempotent: reset the password so the documented credentials always work,
    // even if someone changed them while poking at staging.
    const { error } = await supabase.auth.admin.updateUserById(id, {
      password: user.password,
      email_confirm: true,
    })
    if (error) throw new Error(`updateUser ${user.email}: ${error.message}`)
    console.log(`  = ${user.email.padEnd(22)} (existing, password reset)`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.name },
    })
    if (error) throw new Error(`createUser ${user.email}: ${error.message}`)
    id = data.user.id
    console.log(`  + ${user.email.padEnd(22)} (created)`)
  }

  // The public.users row may already exist via the handle_new_user trigger;
  // upsert covers both paths and keeps the role authoritative here.
  const { error: profileError } = await supabase
    .from('users')
    .upsert({ id, email: user.email, name: user.name, role: user.role })
  if (profileError) throw new Error(`profile ${user.email}: ${profileError.message}`)
}

async function main(): Promise<void> {
  console.log(`  provisioning sign-in accounts on ${target.label}\n`)

  for (const user of USERS) {
    await upsertUser(user)
  }

  console.log('\n  Sign in with:')
  for (const u of USERS) {
    console.log(`    ${u.role.padEnd(5)}  ${u.email}  /  ${u.password}`)
  }
  console.log('')
}

main().catch((error) => {
  console.error(`\n  ✖ ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
