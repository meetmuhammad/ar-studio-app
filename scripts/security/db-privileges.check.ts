/**
 * Role escalation and direct-ledger access, checked through PostgREST with a
 * signed-in user's own JWT and the public anon key, which is all an attacker
 * has. Asserts the CLOSED state: run it before
 * supabase/migrations/20261024000000_close_role_escalation_and_ledger_direct_access.sql
 * to see each hole open (red), and after to see it shut (green).
 *
 *   npx tsx --env-file=.env.local scripts/security/db-privileges.check.ts
 *
 * Local database only. Synthetic users, removed afterward.
 */
import { service, asUser, makeUser, roleOf, rowCount, step, ensure, finish, cleanup } from './support'

async function main() {
const staff = await makeUser('staff', 'staff')
const admin = await makeUser('admin', 'admin')
const fresh = await makeUser('fresh', null) // signed up, no users row yet

const ledgerBefore = await rowCount('general_ledger')
const vendorLedgerBefore = await rowCount('vendor_ledger')

await step('staff cannot promote themselves to admin (UPDATE)', async () => {
  await asUser(staff.token).from('users').update({ role: 'admin' }).eq('id', staff.id)
  ensure((await roleOf(staff.id)) === 'staff', `role is now ${await roleOf(staff.id)}`)
})

await step('staff cannot change their own id or email either (UPDATE)', async () => {
  await asUser(staff.token).from('users').update({ email: 'changed@example.test' }).eq('id', staff.id)
  const { data } = await service.from('users').select('email').eq('id', staff.id).single()
  ensure(data?.email === staff.email, 'a client-side UPDATE changed the row')
})

await step('a fresh signup cannot insert themselves as admin (INSERT)', async () => {
  await asUser(fresh.token).from('users').insert({ id: fresh.id, email: fresh.email, role: 'admin' })
  ensure((await roleOf(fresh.id)) === null, `a users row was created with role ${await roleOf(fresh.id)}`)
})

await step('a fresh signup cannot insert themselves as staff either (INSERT)', async () => {
  await asUser(fresh.token).from('users').insert({ id: fresh.id, email: fresh.email, role: 'staff' })
  ensure((await roleOf(fresh.id)) === null, 'a client-side INSERT created a users row')
})

await step('a user can still read their own role (the dashboard depends on it)', async () => {
  const { data, error } = await asUser(staff.token).from('users').select('role').eq('id', staff.id).single()
  ensure(!error && data?.role === 'staff', `own-row select failed: ${error?.message}`)
})

await step('a user cannot read another user\'s row', async () => {
  const { data } = await asUser(staff.token).from('users').select('role').eq('id', admin.id)
  ensure((data ?? []).length === 0, 'staff could read the admin row')
})

for (const table of ['general_ledger', 'vendor_ledger']) {
  await step(`staff cannot read ${table} through PostgREST`, async () => {
    const { data, error } = await asUser(staff.token).from(table).select('id').limit(1)
    ensure(error, `read succeeded and returned ${data?.length ?? 0} row(s)`)
  })

  await step(`staff cannot write ${table} through PostgREST`, async () => {
    const { error } = await asUser(staff.token).from(table).insert(
      table === 'general_ledger'
        ? { entry_date: '2026-01-01', particulars: 'SEC-CHECK direct insert', debit: 1, entry_type: 'miscellaneous' }
        : { vendor_id: '00000000-0000-0000-0000-000000000001', entry_date: '2026-01-01', particulars: 'SEC-CHECK', debit: 1 },
    )
    ensure(error, 'insert was accepted')
  })

  await step(`anonymous cannot read ${table}`, async () => {
    const anon = asUser('')
    const { data, error } = await anon.from(table).select('id').limit(1)
    ensure(error || (data ?? []).length === 0, 'anonymous read returned rows')
  })
}

await step('rejected writes left both ledgers untouched', async () => {
  ensure((await rowCount('general_ledger')) === ledgerBefore, 'general_ledger row count changed')
  ensure((await rowCount('vendor_ledger')) === vendorLedgerBefore, 'vendor_ledger row count changed')
})

await step('the service role (the API) still reads and writes the ledger', async () => {
  const { error } = await service.from('general_ledger').select('id').limit(1)
  ensure(!error, `service-role read failed: ${error?.message}`)
})

await finish('db-privileges')
}

main().catch(async (e) => {
  console.error('FAILED:', e.message)
  await cleanup()
  process.exit(1)
})
