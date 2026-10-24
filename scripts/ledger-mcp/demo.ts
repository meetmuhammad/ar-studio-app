/**
 * Demo of the ledger MCP through the official SDK client, local database only,
 * one synthetic entry. NOT a Claude connector. With DEMO_OAUTH_CLIENT_ID set, the token
 * comes from the local OAuth server (authorization code + PKCE, audience set by the hook);
 * without it, an OAuth-shaped token is minted locally with the local auth key.
 *
 *   LEDGER_MCP_ENABLED=true LEDGER_MCP_PUBLIC_URL=http://localhost:3107 BUSINESS_TIMEZONE=Asia/Karachi npx next dev -p 3107
 *   npx tsx --env-file=.env.local scripts/ledger-mcp/demo.ts
 */
import { service, makeUser, cleanup, mintOAuthToken, realOAuthToken } from '../security/support'

const MCP = `${process.env.MCP_TEST_BASE ?? 'http://localhost:3107'}/api/mcp`
const MARK = `SEC-MCP demo ${Math.random().toString(36).slice(2, 8)}`
type R = { content: { text?: string }[]; structuredContent?: Record<string, any>; isError?: boolean }
const say = (s: string) => console.log(s)

async function main() {
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client')
  const before = await service.from('general_ledger').select('id', { count: 'exact', head: true })
  const admin = await makeUser('demo', 'admin')
  const cid = process.env.DEMO_OAUTH_CLIENT_ID
  let accessToken: string | undefined
  const client = new Client({ name: 'ledger-demo', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP), { authProvider: { token: async () => (accessToken ??= cid ? await realOAuthToken(admin.token, cid, 'http://localhost:8765/callback') : await mintOAuthToken(admin.id, { audience: MCP })) } }))
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as unknown as R
  let entryId: string | undefined
  try {
    say('1. tools: ' + (await client.listTools()).tools.map((t) => t.name).join(', '))
    const s = await call('get_ledger_summary', {})
    say(`2. summary ok=${!s.isError} (existing ledger totals read, not printed)`)

    const args = { direction: 'expense', amount: '1234.50', entry_date: new Date().toLocaleDateString('en-CA', { timeZone: process.env.BUSINESS_TIMEZONE ?? 'Asia/Karachi' }), description: MARK, entry_type: 'miscellaneous', idempotency_key: `demo-${MARK}`.replace(/\s/g, '-') }
    const p = await call('prepare_ledger_entry', args)
    const pid = p.structuredContent?.proposal_id
    say(`3. prepare: status=${p.structuredContent?.status} proposal=${pid ? 'issued' : 'NONE'}`)
    say('   preview: ' + (p.content[0].text ?? '').split('\n').slice(0, 6).join(' | '))
    if (!pid) throw new Error('no proposal')
    const mid = await service.from('general_ledger').select('id').like('particulars', `${MARK}%`)
    say(`   rows saved before confirmation: ${mid.data?.length} (expect 0)`)

    const c1 = await call('commit_ledger_entry', { proposal_id: pid })
    entryId = c1.structuredContent?.ledger_entry_id
    say(`4. commit after explicit confirm: status=${c1.structuredContent?.status}`)
    const c2 = await call('commit_ledger_entry', { proposal_id: pid })
    say(`5. retry commit: status=${c2.structuredContent?.status}, same entry=${c2.structuredContent?.ledger_entry_id === entryId}`)
    const p2 = await call('prepare_ledger_entry', args)
    say(`6. retry prepare (same key): status=${p2.structuredContent?.status}, same proposal=${p2.structuredContent?.proposal_id === pid}`)
    const rows = await service.from('general_ledger').select('id').like('particulars', `${MARK}%`)
    say(`7. rows with this marker: ${rows.data?.length} (expect exactly 1)`)
    if (rows.data?.length !== 1) process.exitCode = 1
  } finally {
    await client.close()
    await service.from('ledger_mcp_audit').delete().eq('user_id', admin.id)
    await service.from('ledger_mcp_proposals').delete().eq('user_id', admin.id)
    await service.from('general_ledger').delete().like('particulars', `${MARK}%`)
    await cleanup()
    const after = await service.from('general_ledger').select('id', { count: 'exact', head: true })
    say(`cleanup: ledger rows before=${before.count} after=${after.count}`)
  }
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
