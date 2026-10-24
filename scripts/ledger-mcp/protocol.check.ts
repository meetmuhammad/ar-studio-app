/**
 * The ledger MCP server, end to end over real HTTP with the official SDK client.
 * This demonstrates the protocol workflow; it is NOT a Claude or ChatGPT
 * connection (see docs/LEDGER-MCP.md for what a real client adds).
 *
 * Start the app first, against the LOCAL database only:
 *
 *   LEDGER_MCP_ENABLED=true LEDGER_MCP_PUBLIC_URL=http://localhost:3100 \
 *   BUSINESS_TIMEZONE=Asia/Karachi npx next dev -p 3100
 *
 * then, in another shell:
 *
 *   npx tsx --env-file=.env.local scripts/ledger-mcp/protocol.check.ts
 *
 * Needs migration 20261024000100_ledger_mcp_proposals.sql applied locally.
 * Synthetic users, vendors and entries only; everything is removed afterward
 * and the existing ledger is compared byte for byte before and after.
 */
import { createHmac } from 'node:crypto'
import { service, makeUser, rowCount, step, ensure, finish, cleanup, asUser, mintOAuthToken } from '../security/support'

const BASE = process.env.MCP_TEST_BASE ?? 'http://localhost:3100'
const MCP = `${BASE}/api/mcp`
const MARK = `SEC-MCP ${Math.random().toString(36).slice(2, 8)}`

type Tool = { name: string; annotations?: Record<string, unknown> }
type Result = { content: { type: string; text?: string }[]; structuredContent?: Record<string, any>; isError?: boolean }
const textOf = (r: Result) => r.content.map((c) => c.text ?? '').join('\n')

function forgedJwt(sub: string) {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const h = b64({ alg: 'HS256', typ: 'JWT' })
  const p = b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  return `${h}.${p}.${createHmac('sha256', 'wrong-secret').update(`${h}.${p}`).digest('base64url')}`
}

const rpc = (token: string | null) =>
  fetch(MCP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })

const rest = (path: string, token: string) => fetch(`${BASE}/api${path}`, { headers: { Authorization: `Bearer ${token}` } })

async function ledgerFingerprint(excluding: string[] = []) {
  const { data } = await service.from('general_ledger')
    .select('id, entry_date, particulars, debit, credit, balance').order('id')
  return JSON.stringify((data ?? []).filter((r) => !excluding.includes(r.id)))
}

async function main() {
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client')
  const connect = async (token: string) => {
    const client = new Client({ name: 'ledger-protocol-check', version: '1.0.0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(MCP), { authProvider: { token: async () => token } }))
    return client
  }
  const call = async (client: Awaited<ReturnType<typeof connect>>, name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as unknown as Result

  const admin = await makeUser('mcp-admin', 'admin')
  const admin2 = await makeUser('mcp-admin2', 'admin')
  const staff = await makeUser('mcp-staff', 'staff')
  // The MCP endpoint takes only OAuth-style tokens; web session tokens (admin.token) are used for /api calls.
  const oauth = (u: { id: string }) => mintOAuthToken(u.id, { audience: MCP })
  const adminMcp = await oauth(admin)
  const admin2Mcp = await oauth(admin2)
  const staffMcp = await oauth(staff)

  const createdLedger: string[] = []
  const createdVendors: string[] = []
  const baseline = await ledgerFingerprint()
  const baselineCount = await rowCount('general_ledger')

  // ============================================================ access
  await step('endpoint refuses a request with no token: 401 + discovery challenge', async () => {
    const res = await rpc(null)
    ensure(res.status === 401, `got ${res.status}`)
    const challenge = res.headers.get('www-authenticate') ?? ''
    ensure(/^Bearer/i.test(challenge) && challenge.includes('resource_metadata='), `challenge was: ${challenge}`)
    ensure(challenge.includes('/.well-known/oauth-protected-resource/api/mcp'), `challenge was: ${challenge}`)
  })

  await step('protected-resource metadata names this resource and the Supabase authorization server', async () => {
    const res = await fetch(`${BASE}/.well-known/oauth-protected-resource/api/mcp`)
    ensure(res.status === 200, `got ${res.status}`)
    const doc = await res.json()
    ensure(String(doc.resource).endsWith('/api/mcp'), `resource: ${doc.resource}`)
    ensure(Array.isArray(doc.authorization_servers) && doc.authorization_servers[0].endsWith('/auth/v1'), JSON.stringify(doc.authorization_servers))
    ensure(doc.bearer_methods_supported?.includes('header'), 'header method not advertised')
  })

  await step('garbage and forged tokens are 401', async () => {
    ensure((await rpc('not-a-jwt')).status === 401, 'garbage token was not 401')
    ensure((await rpc(forgedJwt(admin.id))).status === 401, 'forged JWT was not 401')
  })

  await step('an ordinary admin web-session token is refused (audience "authenticated", no OAuth client)', async () => {
    ensure((await rpc(admin.token)).status === 401, 'web session token was accepted by the MCP endpoint')
  })

  await step('a signed-in STAFF user is refused: 403 insufficient_scope', async () => {
    const res = await rpc(staffMcp)
    ensure(res.status === 403, `got ${res.status}`)
    ensure((res.headers.get('www-authenticate') ?? '').includes('insufficient_scope'), 'no insufficient_scope challenge')
  })

  await step('a browser Origin that is not allowed is rejected before auth is even considered', async () => {
    const res = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example', Authorization: `Bearer ${adminMcp}` }, body: '{}' })
    ensure(res.status >= 400 && res.status < 500 && res.status !== 401, `got ${res.status}`)
  })

  const client = await connect(adminMcp)

  // ============================================================ tools
  await step('exactly the five ledger tools are exposed, and nothing like SQL, edit or delete', async () => {
    const { tools } = (await client.listTools()) as unknown as { tools: Tool[] }
    const names = tools.map((t) => t.name).sort()
    ensure(JSON.stringify(names) === JSON.stringify(['commit_ledger_entry', 'find_vendors', 'get_ledger_summary', 'list_ledger_entries', 'prepare_ledger_entry']), names.join(','))
    ensure(!names.some((n) => /sql|query|delete|edit|update|refund|import/i.test(n)), 'a forbidden capability is exposed')
  })

  await step('read tools are annotated read-only; prepare and commit are not (so clients ask first)', async () => {
    const { tools } = (await client.listTools()) as unknown as { tools: Tool[] }
    const by = Object.fromEntries(tools.map((t) => [t.name, t.annotations ?? {}]))
    for (const n of ['list_ledger_entries', 'get_ledger_summary', 'find_vendors']) ensure(by[n].readOnlyHint === true, `${n} is not read-only`)
    for (const n of ['prepare_ledger_entry', 'commit_ledger_entry']) {
      ensure(by[n].readOnlyHint === false && by[n].destructiveHint === false, `${n} annotations: ${JSON.stringify(by[n])}`)
    }
  })

  // ============================================================ reads
  let today = ''
  await step('list_ledger_entries: bounded page, newest first, business date and timezone included', async () => {
    const r = await call(client, 'list_ledger_entries', { page_size: 5 })
    ensure(!r.isError, textOf(r))
    const s = r.structuredContent!
    ensure(s.entries.length === 5 && s.total >= 5, `entries ${s.entries.length} of ${s.total}`)
    ensure(/^\d{4}-\d{2}-\d{2}$/.test(s.business_today) && s.timezone, `business_today ${s.business_today}, tz ${s.timezone}`)
    const dates = s.entries.map((e: any) => e.date)
    ensure(dates.every((d: string, i: number) => i === 0 || dates[i - 1] >= d), `not newest first: ${dates}`)
    ensure(s.entries.every((e: any) => /^\d+\.\d{2}$/.test(e.amount) && ['debit', 'credit'].includes(e.side)), 'amount/side shape')
    today = s.business_today
  })

  await step('list_ledger_entries refuses an oversized page and a bad date', async () => {
    let threw = false
    let r: Result | undefined
    try { r = await call(client, 'list_ledger_entries', { page_size: 51 }) } catch { threw = true }
    ensure(threw || r?.isError, 'page_size 51 was accepted')
    const bad = await call(client, 'list_ledger_entries', { start_date: '2026-02-30' })
    ensure(bad.isError && /real calendar date/.test(textOf(bad)), textOf(bad))
  })

  await step('list_ledger_entries date filter returns only that range', async () => {
    const r = await call(client, 'list_ledger_entries', { start_date: '2000-01-01', end_date: '2000-01-02' })
    ensure(!r.isError && r.structuredContent!.total === 0, `total ${r.structuredContent?.total}`)
  })

  await step('get_ledger_summary matches the web app\'s own stats exactly', async () => {
    const r = await call(client, 'get_ledger_summary')
    ensure(!r.isError, textOf(r))
    const a = r.structuredContent!.all_time
    const web = await (await rest('/general-ledger/stats', admin.token)).json()
    ensure(Number(a.total_debit) === web.totalDebit && Number(a.total_credit) === web.totalCredit, `mcp ${a.total_debit}/${a.total_credit} vs web ${web.totalDebit}/${web.totalCredit}`)
    ensure(Number(a.current_balance) === web.currentBalance && a.entries === web.entryCount, 'balance or count differs from the web stats')
    ensure(/debit minus credit|balance/.test(JSON.stringify(r.content)), 'meaning not stated')
  })

  // ============================================================ vendors
  const tag = Math.random().toString(36).slice(2, 7)
  for (const n of ['A', 'B']) {
    const { data, error } = await service.from('vendors').insert({ name: `SEC-MCP Ambig ${tag} ${n}` }).select('id').single()
    ensure(data, `vendor fixture: ${error?.message}`)
    createdVendors.push(data.id)
  }

  await step('find_vendors returns every match with ids and flags the ambiguity', async () => {
    const r = await call(client, 'find_vendors', { query: `SEC-MCP Ambig ${tag}` })
    ensure(!r.isError && r.structuredContent!.vendors.length === 2, textOf(r))
    ensure(/ambiguous/.test(textOf(r)), 'ambiguity not called out')
  })

  await step('a vendor payment cannot be prepared by name, only by an id that exists', async () => {
    const r = await call(client, 'prepare_ledger_entry', { direction: 'expense', amount: '100', entry_date: today, description: 'x', entry_type: 'vendor_payment', vendor_id: '00000000-0000-4000-8000-000000000000' })
    ensure(r.isError && /does not match any vendor/.test(textOf(r)), textOf(r))
  })

  // ============================================================ prepare: refusals
  const proposalsBefore = async () => rowCount('ledger_mcp_proposals')
  await step('prepare refuses bad input and writes neither a proposal nor a ledger row', async () => {
    const p0 = await proposalsBefore(); const l0 = await rowCount('general_ledger')
    const base = { direction: 'receipt', amount: '5000', entry_date: today, description: 'x', entry_type: 'miscellaneous' }
    const cases: [string, Record<string, unknown>, RegExp][] = [
      ['3-decimal amount', { amount: '5000.123' }, /at most 2 decimals/],
      ['zero amount', { amount: '0' }, /greater than zero/],
      ['fake date', { entry_date: '2026-02-30' }, /real calendar date/],
      ['order_payment', { entry_type: 'order_payment' }, /derived|Payments screen/],
      ['opening_balance', { entry_type: 'opening_balance' }, /one-time/],
      ['vendor_payment w/o vendor', { entry_type: 'vendor_payment', direction: 'expense' }, /vendor_id is required/],
    ]
    for (const [label, over, re] of cases) {
      let r: Result | undefined; let threw = false
      try { r = await call(client, 'prepare_ledger_entry', { ...base, ...over }) } catch { threw = true }
      ensure(threw || (r?.isError && re.test(textOf(r))), `${label}: ${r ? textOf(r) : 'threw'}`)
    }
    // a field the schema requires, left out entirely
    let missing: Result | undefined; let threwMissing = false
    try { missing = await call(client, 'prepare_ledger_entry', { direction: 'receipt', amount: '5000', entry_type: 'miscellaneous' }) } catch { threwMissing = true }
    ensure(threwMissing || missing?.isError, 'missing entry_date and description was accepted')
    ensure((await proposalsBefore()) === p0 && (await rowCount('general_ledger')) === l0, 'a refused prepare changed data')
  })

  await step('proposal tables are unreachable from a signed-in user (RLS + revoked grants)', async () => {
    for (const t of ['ledger_mcp_proposals', 'ledger_mcp_audit']) {
      const { error } = await asUser(staff.token).from(t).select('id').limit(1)
      ensure(error, `${t} was readable by a signed-in user`)
    }
  })

  // ============================================================ the demo conversation
  const key = `check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const entry = { direction: 'receipt', amount: '5000', entry_date: today, description: `${MARK} Advance received from Ali (cash)`, entry_type: 'miscellaneous', idempotency_key: key }
  let proposalId = ''
  const statsBefore = await (await rest('/general-ledger/stats', admin.token)).json()

  await step('DEMO 1  prepare: a preview with every detail, and NOTHING is saved', async () => {
    const countBefore = await rowCount('general_ledger')
    const r = await call(client, 'prepare_ledger_entry', entry)
    ensure(!r.isError, textOf(r))
    const t = textOf(r)
    for (const needle of ['RECEIPT (money in)', 'PKR 5,000.00', today, 'miscellaneous', 'Advance received from Ali', 'NOT linked to any order or customer', 'No money moves', 'not saved yet']) {
      ensure(t.includes(needle), `preview is missing "${needle}"`)
    }
    proposalId = r.structuredContent!.proposal_id
    ensure(r.structuredContent!.status === 'pending' && r.structuredContent!.expires_at, 'no pending status / expiry')
    ensure((await rowCount('general_ledger')) === countBefore, 'prepare wrote a ledger row')
  })

  await step('DEMO 2  the same request retried returns the SAME proposal, not a second one', async () => {
    const p0 = await proposalsBefore()
    const r = await call(client, 'prepare_ledger_entry', entry)
    ensure(!r.isError && r.structuredContent!.proposal_id === proposalId && r.structuredContent!.reused === true, textOf(r))
    ensure((await proposalsBefore()) === p0, 'a retry created another proposal')
  })

  await step('DEMO 3  the same key with a DIFFERENT entry is a conflict', async () => {
    const r = await call(client, 'prepare_ledger_entry', { ...entry, amount: '6000' })
    ensure(r.isError && /already used for a different entry/.test(textOf(r)), textOf(r))
  })

  await step('another admin cannot commit this admin\'s proposal', async () => {
    const other = await connect(admin2Mcp)
    const r = await call(other, 'commit_ledger_entry', { proposal_id: proposalId })
    ensure(r.isError && /No such proposal/.test(textOf(r)), textOf(r))
    ensure((await rowCount('general_ledger')) === baselineCount, 'another user\'s commit wrote an entry')
  })

  let entryId = ''
  await step('DEMO 4  commit: saved exactly as previewed', async () => {
    const r = await call(client, 'commit_ledger_entry', { proposal_id: proposalId })
    ensure(!r.isError && r.structuredContent!.status === 'committed', textOf(r))
    entryId = r.structuredContent!.ledger_entry_id
    createdLedger.push(entryId)
    const { data } = await service.from('general_ledger').select('*').eq('id', entryId).single()
    ensure(data && Number(data.debit) === 5000 && data.credit === null, `row: ${JSON.stringify(data)}`)
    ensure(data.entry_date === today && data.entry_type === 'miscellaneous' && data.vendor_id === null && data.order_id === null, 'row differs from the preview')
    ensure(data.particulars === entry.description, 'description differs from the preview')
    ensure(String(Number(data.balance)) === String(Number(r.structuredContent!.balance_after)), 'balance reported does not match the stored balance')
  })

  await step('DEMO 5  repeated and CONCURRENT commits still leave exactly one entry', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => call(client, 'commit_ledger_entry', { proposal_id: proposalId })))
    ensure(results.every((r) => !r.isError && r.structuredContent!.ledger_entry_id === entryId), results.map(textOf).join(' / '))
    const { data } = await service.from('general_ledger').select('id').like('particulars', `${MARK}%`)
    ensure(data?.length === 1, `${data?.length} entries carry the marker`)
    ensure((await rowCount('general_ledger')) === baselineCount + 1, 'ledger count is not baseline + 1')
  })

  await step('DEMO 6  preparing it again after it was saved reports it, instead of a second proposal', async () => {
    const r = await call(client, 'prepare_ledger_entry', entry)
    ensure(!r.isError && r.structuredContent!.status === 'already_committed' && r.structuredContent!.ledger_entry_id === entryId, textOf(r))
  })

  await step('DEMO 7  a look-alike with a NEW key warns it may be a duplicate', async () => {
    const r = await call(client, 'prepare_ledger_entry', { ...entry, idempotency_key: `dup-${key}` })
    ensure(!r.isError && r.structuredContent!.warnings.some((w: string) => /already exists/.test(w)), textOf(r))
  })

  await step('DEMO 8  VERIFY in the web app\'s own API: the entry, the totals and the day all agree', async () => {
    const list = await (await rest(`/general-ledger?page=1&pageSize=5&search=${encodeURIComponent(MARK)}`, admin.token)).json()
    ensure(list.data.length === 1 && Number(list.data[0].debit) === 5000 && list.data[0].id === entryId, JSON.stringify(list))
    const after = await (await rest('/general-ledger/stats', admin.token)).json()
    ensure(Math.abs(after.totalDebit - statsBefore.totalDebit - 5000) < 0.005, `debit ${statsBefore.totalDebit} -> ${after.totalDebit}`)
    ensure(Math.abs(after.totalCredit - statsBefore.totalCredit) < 0.005, 'credit changed')
    ensure(Math.abs(after.currentBalance - (after.totalDebit - after.totalCredit)) < 0.005, 'web balance != debit - credit')
    ensure(after.entryCount === statsBefore.entryCount + 1, `count ${statsBefore.entryCount} -> ${after.entryCount}`)
    const sum = (await call(client, 'get_ledger_summary', { date: today })).structuredContent!
    ensure(Number(sum.all_time.current_balance) === after.currentBalance, 'MCP summary and web stats disagree after the save')
    ensure(Number(sum.day.money_in) >= 5000, `day money_in ${sum.day.money_in}`)
  })

  await step('running balances are intact end to end after the new entry', async () => {
    const { data } = await service.from('general_ledger').select('id, debit, credit, balance').order('entry_date').order('created_at').order('id')
    let running = 0
    for (const r of data ?? []) {
      running += Number(r.debit ?? 0) - Number(r.credit ?? 0)
      ensure(Math.abs(running - Number(r.balance)) < 0.005, `balance drift at ${r.id}`)
    }
  })

  // ============================================================ expiry
  await step('an expired proposal is refused and writes nothing', async () => {
    const r = await call(client, 'prepare_ledger_entry', { ...entry, description: `${MARK} will expire`, idempotency_key: `exp-${key}` })
    ensure(!r.isError, textOf(r))
    const id = r.structuredContent!.proposal_id
    await service.from('ledger_mcp_proposals').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', id)
    const c = await call(client, 'commit_ledger_entry', { proposal_id: id })
    ensure(c.isError && /expired/.test(textOf(c)), textOf(c))
    const { data } = await service.from('general_ledger').select('id').like('particulars', `${MARK} will expire%`)
    ensure(data?.length === 0, 'an expired proposal wrote an entry')
    const again = await call(client, 'prepare_ledger_entry', { ...entry, description: `${MARK} will expire`, idempotency_key: `exp-${key}` })
    ensure(again.isError && /expired/.test(textOf(again)), 'the expired idempotency key was silently revived')
  })

  // ============================================================ failure rolls back
  await step('a failing commit rolls back completely: no entry, the proposal stays pending', async () => {
    const vendorId = createdVendors[0]
    const r = await call(client, 'prepare_ledger_entry', { direction: 'expense', amount: '250', entry_date: today, description: `${MARK} vendor`, entry_type: 'vendor_payment', vendor_id: vendorId })
    ensure(!r.isError, textOf(r))
    const id = r.structuredContent!.proposal_id
    await service.from('vendors').delete().eq('id', vendorId) // the vendor vanishes between prepare and commit
    createdVendors.shift()
    const l0 = await rowCount('general_ledger'); const v0 = await rowCount('vendor_ledger')
    const c = await call(client, 'commit_ledger_entry', { proposal_id: id })
    ensure(c.isError && /nothing was written/.test(textOf(c)), textOf(c))
    ensure((await rowCount('general_ledger')) === l0 && (await rowCount('vendor_ledger')) === v0, 'a failed commit left rows behind')
    const { data } = await service.from('ledger_mcp_proposals').select('status, ledger_entry_id').eq('id', id).single()
    ensure(data?.status === 'pending' && data.ledger_entry_id === null, `proposal is ${JSON.stringify(data)}`)
  })

  await step('a vendor payment commits and mirrors into the vendor ledger via the existing trigger', async () => {
    const vendorId = createdVendors[0]
    // No description: a vendor payment is labelled "Payment to <vendor>", as the web form does.
    const prepared = await call(client, 'prepare_ledger_entry', { direction: 'expense', amount: '250.50', entry_date: today, entry_type: 'vendor_payment', vendor_id: vendorId })
    ensure(!prepared.isError && /Payment to SEC-MCP Ambig/.test(textOf(prepared)), textOf(prepared))
    const c = await call(client, 'commit_ledger_entry', { proposal_id: prepared.structuredContent!.proposal_id })
    ensure(!c.isError, textOf(c))
    createdLedger.push(c.structuredContent!.ledger_entry_id)
    const { data: row } = await service.from('general_ledger').select('credit, debit, vendor_id').eq('id', c.structuredContent!.ledger_entry_id).single()
    ensure(Number(row?.credit) === 250.5 && row?.debit === null && row?.vendor_id === vendorId, JSON.stringify(row))
    const { data: sub } = await service.from('vendor_ledger').select('id').eq('general_ledger_id', c.structuredContent!.ledger_entry_id)
    ensure(sub?.length === 1, `${sub?.length} vendor_ledger rows`)
  })

  await step('the audit trail records who and what, and holds no amounts, text or tokens', async () => {
    const { data, error } = await service.from('ledger_mcp_audit').select('*').eq('user_id', admin.id)
    ensure(!error && (data?.length ?? 0) >= 4, `audit rows: ${data?.length} ${error?.message ?? ''}`)
    const cols = Object.keys(data![0]).sort().join(',')
    ensure(cols === 'action,at,id,ledger_entry_id,outcome,proposal_id,user_id', `columns: ${cols}`)
    const blob = JSON.stringify(data)
    ensure(!blob.includes('5000') && !blob.includes('Advance') && !blob.includes(adminMcp.slice(0, 20)), 'audit contains financial detail or a token')
    const outcomes = new Set(data!.map((r) => `${r.action}:${r.outcome}`))
    for (const o of ['prepare:prepared', 'commit:committed', 'commit:already_committed', 'commit:expired', 'commit:failed']) ensure(outcomes.has(o), `no ${o} in ${[...outcomes]}`)
  })

  await client.close()

  // ============================================================ leave nothing behind
  await service.from('ledger_mcp_audit').delete().in('user_id', [admin.id, admin2.id, staff.id])
  await service.from('ledger_mcp_proposals').delete().in('user_id', [admin.id, admin2.id])
  const { data: leftovers } = await service.from('general_ledger').select('id').like('particulars', `${MARK}%`)
  await service.from('general_ledger').delete().in('id', [...new Set([...createdLedger, ...(leftovers ?? []).map((r) => r.id)])])
  await service.from('vendors').delete().like('name', `SEC-MCP Ambig ${tag}%`)

  await step('after cleanup the existing ledger is byte-for-byte what it was', async () => {
    ensure((await rowCount('general_ledger')) === baselineCount, 'row count differs from the baseline')
    ensure((await ledgerFingerprint()) === baseline, 'existing ledger rows (including balances) changed')
  })

  await finish('ledger-mcp protocol')
}

main().catch(async (e) => {
  console.error('FAILED:', e.message)
  await service.from('general_ledger').delete().like('particulars', 'SEC-MCP%')
  await service.from('vendors').delete().like('name', 'SEC-MCP%')
  await cleanup()
  process.exit(1)
})
