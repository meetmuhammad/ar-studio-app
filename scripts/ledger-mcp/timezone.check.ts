/**
 * With the MCP enabled but BUSINESS_TIMEZONE unset, the tools must refuse rather
 * than guess which day "today" is: the app configures no timezone, the web form
 * uses the UTC date, and a wrong guess silently misdates entries.
 *
 * Start the app WITHOUT BUSINESS_TIMEZONE, local database only:
 *
 *   LEDGER_MCP_ENABLED=true LEDGER_MCP_PUBLIC_URL=http://localhost:3107 npx next dev -p 3107
 *
 *   MCP_TEST_BASE=http://localhost:3107 npx tsx --env-file=.env.local scripts/ledger-mcp/timezone.check.ts
 */
import { makeUser, service, rowCount, step, ensure, finish, cleanup, mintOAuthToken } from '../security/support'

const MCP = `${process.env.MCP_TEST_BASE ?? 'http://localhost:3107'}/api/mcp`
type Result = { content: { text?: string }[]; isError?: boolean }
const textOf = (r: Result) => r.content.map((c) => c.text ?? '').join(' ')

async function main() {
  const { Client, StreamableHTTPClientTransport } = await import('@modelcontextprotocol/client')
  const admin = await makeUser('notz', 'admin')
  const client = new Client({ name: 'timezone-check', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP), { authProvider: { token: async () => mintOAuthToken(admin.id, { audience: MCP }) } }))
  const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as unknown as Result

  await step('list_ledger_entries refuses and names the missing setting', async () => {
    const r = await call('list_ledger_entries', { page_size: 2 })
    ensure(r.isError && /BUSINESS_TIMEZONE is not set/.test(textOf(r)), textOf(r))
  })

  await step('get_ledger_summary refuses too (no guessed "today")', async () => {
    const r = await call('get_ledger_summary', {})
    ensure(r.isError && /BUSINESS_TIMEZONE is not set/.test(textOf(r)), textOf(r))
  })

  await step('prepare_ledger_entry refuses even with an explicit date, and stores nothing', async () => {
    const before = await rowCount('ledger_mcp_proposals')
    const r = await call('prepare_ledger_entry', { direction: 'receipt', amount: '5000', entry_date: '2026-10-24', description: 'timezone check', entry_type: 'miscellaneous' })
    ensure(r.isError && /BUSINESS_TIMEZONE is not set/.test(textOf(r)), textOf(r))
    ensure((await rowCount('ledger_mcp_proposals')) === before, 'a proposal was stored without a timezone')
  })

  await step('the refusal is a configuration message, not a stack trace', async () => {
    const r = await call('get_ledger_summary', {})
    ensure(/Ask the administrator/.test(textOf(r)) && !/at .*\.ts|node_modules/.test(textOf(r)), textOf(r))
  })

  await client.close()
  await service.from('ledger_mcp_audit').delete().eq('user_id', admin.id)
  await finish('ledger-mcp timezone')
}

main().catch(async (e) => {
  console.error('FAILED:', e.message)
  await cleanup()
  process.exit(1)
})
