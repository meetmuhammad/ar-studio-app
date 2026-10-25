/**
 * Idempotently create the synthetic QA accounts used by the browser (e2e) and
 * endpoint tests. LOCAL database only: assertWritableDb refuses production and
 * anything it does not recognise, and the check below refuses any non-local URL.
 *
 *   npx tsx --env-file=.env.local scripts/qa/provision-qa-users.ts
 *
 * Accounts (all @arstudio.test, never real people):
 *   qa-admin@arstudio.test  / QA_PASSWORD  role admin
 *   qa-staff@arstudio.test  / QA_PASSWORD  role staff
 *   qa-norole@arstudio.test / QA_PASSWORD  signed up, no public.users row
 *   qa-signout@arstudio.test / QA_PASSWORD staff; used only by the sign-out test (sign-out is global)
 */
import { createClient } from '@supabase/supabase-js'
import { assertWritableDb } from '../assert-writable-db'

assertWritableDb('qa user provisioning')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
  throw new Error(`QA provisioning is local-only, got ${url}`)
}

export const QA_PASSWORD = 'QaLocal-2026!'
const accounts = [
  { email: 'qa-admin@arstudio.test', role: 'admin' as const },
  { email: 'qa-staff@arstudio.test', role: 'staff' as const },
  { email: 'qa-norole@arstudio.test', role: null },
  // dedicated to the sign-out test: signing out revokes every session of an account, so it must not be shared
  { email: 'qa-signout@arstudio.test', role: 'staff' as const },
]

async function main() {
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: list, error: listError } = await service.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (listError) throw listError

  for (const a of accounts) {
    let id = list.users.find((u) => u.email === a.email)?.id
    if (!id) {
      const { data, error } = await service.auth.admin.createUser({ email: a.email, password: QA_PASSWORD, email_confirm: true })
      if (error || !data.user) throw new Error(`${a.email}: ${error?.message}`)
      id = data.user.id
    } else {
      await service.auth.admin.updateUserById(id, { password: QA_PASSWORD })
    }
    if (a.role) {
      const { error } = await service.from('users').upsert({ id, email: a.email, name: a.email.split('@')[0], role: a.role })
      if (error) throw new Error(`users row ${a.email}: ${error.message}`)
    }
    console.log(`ok  ${a.email}  ${a.role ?? '(no role row)'}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
