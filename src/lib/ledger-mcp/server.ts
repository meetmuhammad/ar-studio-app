import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { findVendors, getLedgerTotals, listLedgerEntries } from '@/lib/ledger-service'
import { businessToday, centsToDecimal, CURRENCY, formatMoney, isRealDate, toCents } from './normalize'
import { commitEntry, prepareEntry } from './proposals'

/**
 * The ledger-only MCP server. One instance is built per request, already bound
 * to the verified user (see route.ts), so a tool can never act for anyone else.
 *
 * Deliberately absent: edit, delete, refunds, payment capture, bulk import,
 * customer or order tools, and any way to run SQL.
 */

const text = (t: string, structured?: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: t }],
  ...(structured ? { structuredContent: structured } : {}),
})
const fail = (t: string) => ({ isError: true as const, content: [{ type: 'text' as const, text: t }] })

/** Anything unexpected is logged here and reported without internals. */
async function guarded<T>(fn: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  try {
    return await fn()
  } catch (e) {
    const message = (e as Error).message ?? ''
    console.error('ledger MCP tool error:', message)
    if (message.startsWith('BUSINESS_TIMEZONE')) {
      return fail(`Server configuration problem: ${message}. Ask the administrator to set it.`)
    }
    return fail('Something went wrong on the server. Nothing was saved. Try again, and tell the administrator if it keeps happening.')
  }
}

const dateParam = z.string().describe('YYYY-MM-DD')

export function buildLedgerMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: 'ar-studio-ledger', version: '0.1.0' })

  // ------------------------------------------------------------ read: entries
  server.registerTool(
    'list_ledger_entries',
    {
      title: 'List ledger entries',
      description:
        `List entries of the AR Studio general ledger, newest first, ${CURRENCY}. ` +
        'Use it to read the ledger for a day or a date range. "side" is "debit" for money in and "credit" for money out. ' +
        'Results are paged: at most 50 per page. The response includes business_today, the shop\'s current date, ' +
        'which is what "today" means for dates.',
      inputSchema: z.object({
        start_date: dateParam.optional(),
        end_date: dateParam.optional(),
        entry_type: z.enum(['opening_balance', 'order_payment', 'vendor_payment', 'miscellaneous']).optional(),
        vendor_id: z.string().uuid().optional(),
        search: z.string().max(100).optional().describe('Matches the entry description'),
        page: z.number().int().min(1).max(10000).default(1),
        page_size: z.number().int().min(1).max(50).default(20),
      }),
      annotations: { title: 'List ledger entries', readOnlyHint: true, openWorldHint: false },
    },
    async (a) => guarded(async () => {
      for (const [k, v] of [['start_date', a.start_date], ['end_date', a.end_date]] as const) {
        if (v && !isRealDate(v)) return fail(`${k} "${v}" is not a real calendar date in YYYY-MM-DD form`)
      }
      const { entries, count } = await listLedgerEntries({
        startDate: a.start_date, endDate: a.end_date, entryType: a.entry_type,
        vendorId: a.vendor_id, search: a.search, page: a.page, pageSize: a.page_size,
      })
      const rows = entries.map((e: any) => ({
        id: e.id,
        date: e.entry_date,
        description: e.particulars,
        side: e.debit !== null ? 'debit' : 'credit',
        amount: centsToDecimal(toCents(e.debit ?? e.credit)),
        balance_after: centsToDecimal(toCents(e.balance)),
        entry_type: e.entry_type,
        vendor: e.vendors?.name ?? null,
        order_number: e.orders?.order_number ?? null,
        notes: e.notes ?? null,
      }))
      const today = businessToday(process.env.BUSINESS_TIMEZONE)
      const pages = Math.max(1, Math.ceil(count / a.page_size))
      const lines = rows.map((r) =>
        `${r.date} | ${r.side === 'debit' ? 'IN ' : 'OUT'} ${formatMoney(r.amount)} | ${r.description}${r.vendor ? ` (${r.vendor})` : ''} | balance ${formatMoney(r.balance_after)}`)
      return text(
        `Business date today: ${today}. ${count} matching entr${count === 1 ? 'y' : 'ies'}; page ${a.page} of ${pages}.\n` +
          (lines.join('\n') || '(no entries on this page)'),
        { business_today: today, timezone: process.env.BUSINESS_TIMEZONE, currency: CURRENCY, total: count, page: a.page, pages, entries: rows },
      )
    }),
  )

  // ------------------------------------------------------------ read: totals
  server.registerTool(
    'get_ledger_summary',
    {
      title: 'Ledger summary',
      description:
        'Totals for one day and for the whole ledger, with the meanings the AR Studio ledger already uses: ' +
        'money_in is the sum of debit entries, money_out the sum of credit entries, and the balance is debit minus credit. ' +
        'date defaults to the shop\'s current date.',
      inputSchema: z.object({ date: dateParam.optional() }),
      annotations: { title: 'Ledger summary', readOnlyHint: true, openWorldHint: false },
    },
    async (a) => guarded(async () => {
      const today = businessToday(process.env.BUSINESS_TIMEZONE)
      const date = a.date ?? today
      if (!isRealDate(date)) return fail(`date "${date}" is not a real calendar date in YYYY-MM-DD form`)
      const [day, all] = await Promise.all([getLedgerTotals({ date }), getLedgerTotals()])
      const dayNet = centsToDecimal(toCents(day.totalDebit) - toCents(day.totalCredit))
      return text(
        `Ledger summary (${CURRENCY}). Business date today: ${today}.\n` +
          `${date}: money in ${formatMoney(day.totalDebit)}, money out ${formatMoney(day.totalCredit)}, net ${formatMoney(dayNet)}, ${day.entryCount} entr${day.entryCount === 1 ? 'y' : 'ies'}.\n` +
          `All time: total debit ${formatMoney(all.totalDebit)}, total credit ${formatMoney(all.totalCredit)}, current balance ${formatMoney(all.currentBalance)}, ${all.entryCount} entries.`,
        {
          currency: CURRENCY, business_today: today, date,
          day: { money_in: day.totalDebit, money_out: day.totalCredit, net: dayNet, entries: day.entryCount },
          all_time: { total_debit: all.totalDebit, total_credit: all.totalCredit, current_balance: all.currentBalance, entries: all.entryCount },
        },
      )
    }),
  )

  // ------------------------------------------------------------ read: vendors
  server.registerTool(
    'find_vendors',
    {
      title: 'Find vendors',
      description:
        'Look up vendors by name, for a vendor_payment. Returns up to 10 with their ids. Vendor names are not unique: ' +
        'if more than one comes back, show them to the user and let them pick. Never choose one yourself.',
      inputSchema: z.object({ query: z.string().min(2).max(80) }),
      annotations: { title: 'Find vendors', readOnlyHint: true, openWorldHint: false },
    },
    async (a) => guarded(async () => {
      const rows = (await findVendors(a.query)).map((v: any) => ({ id: v.id, name: v.name, category: v.vendor_categories?.name ?? null }))
      if (!rows.length) return text(`No vendor matches "${a.query}".`, { vendors: [] })
      return text(
        `${rows.length} vendor${rows.length === 1 ? '' : 's'} match "${a.query}"${rows.length > 1 ? ' (ambiguous: ask the user which one)' : ''}:\n` +
          rows.map((v) => `- ${v.name}${v.category ? ` [${v.category}]` : ''}  id ${v.id}`).join('\n'),
        { vendors: rows },
      )
    }),
  )

  // ------------------------------------------------------------ write: prepare
  server.registerTool(
    'prepare_ledger_entry',
    {
      title: 'Prepare a ledger entry',
      description:
        `Prepare ONE ledger entry for the user to confirm. Nothing is saved to the ledger by this tool. ` +
        'It returns a preview and a proposal_id. Show the preview to the user exactly as returned, ask whether to save it, ' +
        'and call commit_ledger_entry only after they clearly say yes. Never guess a missing detail: if the amount, the day, ' +
        'what it is for, or which vendor is unclear, ask the user first. Currency is always ' + CURRENCY + '. ' +
        'entry_type "miscellaneous" is a standalone receipt or expense. "vendor_payment" is money paid to a vendor (needs vendor_id from find_vendors). ' +
        'A payment against a customer\'s ORDER (an advance, a balance payment) is NOT recorded here: it must go through the Payments screen so the order is updated, ' +
        'so tell the user that instead of recording it as a miscellaneous entry unless they explicitly want a standalone ledger line. ' +
        'Pass an idempotency_key (any unique string of 8+ characters) so a retried request cannot create a second proposal.',
      inputSchema: z.object({
        direction: z.enum(['receipt', 'expense']).describe('receipt = money received (debit), expense = money paid out (credit)'),
        amount: z.string().describe('Decimal text with at most 2 decimals, e.g. "5000" or "5000.50". Not a number.'),
        entry_date: dateParam.describe('YYYY-MM-DD. Use the business date from list_ledger_entries or get_ledger_summary for "today".'),
        description: z.string().max(500).optional().describe('What the entry is for, in the user\'s words, e.g. "Advance received from Ali (cash)". Required, except for a vendor_payment, where it defaults to "Payment to <vendor name>" as in the web form.'),
        // All four ledger types are accepted by the schema so that a refused one
        // comes back with the reason and what to do instead (normalize.ts), not a
        // bare "expected one of ..." that tells the assistant nothing.
        entry_type: z.enum(['miscellaneous', 'vendor_payment', 'order_payment', 'opening_balance'])
          .describe('Only miscellaneous and vendor_payment can be created here. order_payment and opening_balance are refused with an explanation.'),
        vendor_id: z.string().uuid().optional().describe('Required for vendor_payment; an id from find_vendors'),
        notes: z.string().max(1000).optional(),
        idempotency_key: z.string().min(8).max(128).optional(),
      }),
      annotations: { title: 'Prepare a ledger entry', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => guarded(async () => {
      const r = await prepareEntry(userId, a, a.idempotency_key)
      if (!r.ok) {
        return fail(`Not prepared. Fix or ask the user about:\n${r.problems.map((p) => `- ${p}`).join('\n')}\nNothing was saved.`)
      }
      if (r.alreadyCommitted) {
        return text(`This entry was already saved earlier (ledger entry ${r.alreadyCommitted}). Nothing more to confirm and nothing new was written.\n\n${r.preview}`,
          { proposal_id: r.proposalId, status: 'already_committed', ledger_entry_id: r.alreadyCommitted })
      }
      const warn = r.warnings.length ? `\n\nWARNINGS:\n${r.warnings.map((w) => `- ${w}`).join('\n')}` : ''
      return text(
        `PREVIEW (not saved yet)${r.reused ? ' [same request as before, same proposal]' : ''}\n\n${r.preview}${warn}\n\n` +
          `Show this to the user and ask: save this entry? Only after an explicit yes, call commit_ledger_entry with proposal_id "${r.proposalId}". ` +
          `This proposal expires at ${r.expiresAt}.`,
        { proposal_id: r.proposalId, expires_at: r.expiresAt, status: 'pending', warnings: r.warnings, reused: r.reused },
      )
    }),
  )

  // ------------------------------------------------------------ write: commit
  server.registerTool(
    'commit_ledger_entry',
    {
      title: 'Save the confirmed ledger entry',
      description:
        'Save a prepared ledger entry, exactly as previewed. Call it only after the user has seen the preview and explicitly said to save it. ' +
        'Calling it again for the same proposal is safe: it never writes a second entry. It records an accounting entry only: no money moves and no one is charged.',
      inputSchema: z.object({ proposal_id: z.string().uuid() }),
      annotations: { title: 'Save the confirmed ledger entry', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => guarded(async () => {
      const r = await commitEntry(userId, a.proposal_id)
      switch (r.status) {
        case 'committed':
        case 'already_committed': {
          const e = r.entry
          const side = e.debit !== null ? 'money in' : 'money out'
          return text(
            `${r.status === 'committed' ? 'Saved.' : 'Already saved earlier; nothing new was written.'} ` +
              `${e.entry_date}: ${side} ${formatMoney(centsToDecimal(toCents(e.debit ?? e.credit)))}, "${e.particulars}". Ledger balance after this entry: ${formatMoney(centsToDecimal(toCents(e.balance)))}.`,
            { status: r.status, ledger_entry_id: e.id, entry_date: e.entry_date, balance_after: centsToDecimal(toCents(e.balance)) },
          )
        }
        case 'expired': return fail('That proposal has expired and was not saved. Prepare the entry again and ask the user to confirm the new preview.')
        case 'not_found': return fail('No such proposal for this user. Nothing was saved. Prepare the entry again.')
        case 'forbidden': return fail('Only admin users can save ledger entries. Nothing was saved.')
        default: return fail('The entry could not be saved and nothing was written. It is safe to try again with the same proposal_id.')
      }
    }),
  )

  return server
}
