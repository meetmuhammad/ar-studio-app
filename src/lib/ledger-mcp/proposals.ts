import { createAdminSupabaseClient } from '@/lib/supabase'
import { businessToday, normalizeEntry, previewEntry, toCents, type EntryInput, type NormalizedEntry } from './normalize'

/**
 * Prepare / commit for ledger entries made through the MCP server.
 *
 * Prepare normalizes the request, stores it as a short-lived proposal bound to
 * the authenticated user, and returns a preview. Commit saves exactly that
 * stored proposal, by calling one SQL function that does the whole job in one
 * transaction (supabase/migrations/20261024000100_ledger_mcp_proposals.sql).
 *
 * Nothing here proves a human read the preview. A tool call is made by the
 * assistant, and this server cannot tell a user's "yes" from the assistant
 * saying yes on their behalf; the real control is the client's approval prompt
 * for non-read-only tools (see docs/LEDGER-MCP.md for its limits).
 */

export const PROPOSAL_TTL_SECONDS = Number(process.env.LEDGER_PROPOSAL_TTL_SECONDS ?? 600)

/** What the audit trail records: ids and outcome codes, never amounts or text. */
async function audit(row: { user_id: string; action: string; outcome: string; proposal_id?: string; ledger_entry_id?: string }) {
  const { error } = await createAdminSupabaseClient().from('ledger_mcp_audit').insert(row)
  if (error) console.error('ledger_mcp_audit insert failed:', error.message)
}

interface Proposal {
  id: string
  payload: NormalizedEntry
  payload_hash: string
  status: 'pending' | 'committed'
  expires_at: string
  ledger_entry_id: string | null
}

export interface LedgerRow {
  id: string
  entry_date: string
  particulars: string
  debit: string | null
  credit: string | null
  balance: string
}

const ENTRY_KEYS = ['entry_date', 'particulars', 'debit', 'credit', 'entry_type', 'notes', 'vendor_id'] as const
const sameEntry = (a: NormalizedEntry, b: NormalizedEntry) => ENTRY_KEYS.every((k) => a[k] === b[k])

export type PrepareResult =
  | { ok: false; problems: string[] }
  | {
      ok: true
      proposalId: string
      expiresAt: string
      preview: string
      warnings: string[]
      /** The same idempotency key and entry came back: the original proposal is returned. */
      reused: boolean
      /** That proposal was already saved; there is nothing more to confirm. */
      alreadyCommitted: string | null
    }

export async function prepareEntry(userId: string, input: EntryInput, idempotencyKey?: string): Promise<PrepareResult> {
  const supabase = createAdminSupabaseClient()
  const today = businessToday(process.env.BUSINESS_TIMEZONE)

  // A vendor is only ever chosen by id, never by name: names are not unique.
  let vendorName: string | null = null
  if (typeof input.vendor_id === 'string' && input.vendor_id) {
    const { data: vendor } = await supabase.from('vendors').select('name').eq('id', input.vendor_id).maybeSingle()
    if (!vendor) return { ok: false, problems: ['vendor_id does not match any vendor; use find_vendors to look one up'] }
    vendorName = vendor.name
  }

  const result = normalizeEntry(input, { today, vendorName })
  if ('problems' in result) return { ok: false, problems: result.problems }
  const { entry, warnings } = result

  // Soft duplicate check: an identical entry may be a retry of something already saved.
  const { data: sameDay } = await supabase.from('general_ledger')
    .select('id, particulars, debit, credit')
    .eq('entry_date', entry.entry_date).eq('entry_type', entry.entry_type).limit(200)
  const twin = (sameDay ?? []).find((r) =>
    toCents(r.debit) === toCents(entry.debit) && toCents(r.credit) === toCents(entry.credit) &&
    (r.debit !== null) === (entry.debit !== null))
  if (twin) {
    warnings.push(`An entry with the same date, type and amount already exists ("${twin.particulars}", id ${twin.id}). Confirm with the user that this is not a duplicate.`)
  }

  // Idempotency: the same key with the same entry returns the same proposal.
  if (idempotencyKey) {
    const existing = await findByKey(userId, idempotencyKey)
    if (existing) return resolveExisting(userId, existing, entry, vendorName, warnings)
  }

  const expiresAt = new Date(Date.now() + PROPOSAL_TTL_SECONDS * 1000).toISOString()
  const { data: created, error } = await supabase
    .from('ledger_mcp_proposals')
    .insert({ user_id: userId, payload: entry, idempotency_key: idempotencyKey ?? null, expires_at: expiresAt })
    .select('id, payload, payload_hash, status, expires_at, ledger_entry_id')
    .single()

  if (error) {
    // Two concurrent prepares with one key: the unique index let one win. Treat the loser as a retry.
    if (error.code === '23505' && idempotencyKey) {
      const existing = await findByKey(userId, idempotencyKey)
      if (existing) return resolveExisting(userId, existing, entry, vendorName, warnings)
    }
    throw new Error(`Could not store the proposal: ${error.message}`)
  }

  await audit({ user_id: userId, action: 'prepare', outcome: 'prepared', proposal_id: created.id })
  return {
    ok: true,
    proposalId: created.id,
    expiresAt: created.expires_at,
    preview: previewEntry(entry, { vendorName, code: created.payload_hash.slice(0, 8) }),
    warnings,
    reused: false,
    alreadyCommitted: null,
  }
}

async function findByKey(userId: string, key: string): Promise<Proposal | null> {
  const { data } = await createAdminSupabaseClient()
    .from('ledger_mcp_proposals')
    .select('id, payload, payload_hash, status, expires_at, ledger_entry_id')
    .eq('user_id', userId).eq('idempotency_key', key).maybeSingle()
  return (data as Proposal | null) ?? null
}

async function resolveExisting(
  userId: string, existing: Proposal, entry: NormalizedEntry, vendorName: string | null, warnings: string[],
): Promise<PrepareResult> {
  if (!sameEntry(existing.payload, entry)) {
    await audit({ user_id: userId, action: 'prepare', outcome: 'idempotency_conflict', proposal_id: existing.id })
    return { ok: false, problems: ['idempotency_key was already used for a different entry. Use a new key for a new entry, or repeat the original details exactly to retry it.'] }
  }

  const reuse = {
    ok: true as const,
    proposalId: existing.id,
    expiresAt: existing.expires_at,
    preview: previewEntry(entry, { vendorName, code: existing.payload_hash.slice(0, 8) }),
    warnings,
    reused: true,
  }
  if (existing.status === 'committed') return { ...reuse, alreadyCommitted: existing.ledger_entry_id }

  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    return { ok: false, problems: ['That idempotency_key belongs to a proposal that has expired and was never saved. Prepare the entry again with a new idempotency_key.'] }
  }
  await audit({ user_id: userId, action: 'prepare', outcome: 'reused', proposal_id: existing.id })
  return { ...reuse, alreadyCommitted: null }
}

export type CommitResult =
  | { status: 'committed' | 'already_committed'; entry: LedgerRow }
  | { status: 'not_found' | 'expired' | 'forbidden' | 'failed' }

export async function commitEntry(userId: string, proposalId: string): Promise<CommitResult> {
  const supabase = createAdminSupabaseClient()
  const { data, error } = await supabase.rpc('commit_ledger_proposal', { p_proposal_id: proposalId, p_user_id: userId })

  if (error) {
    // The function raises on any failure and the whole call rolls back: the
    // proposal is still pending and the ledger is untouched. Record it (the
    // function's own audit row was rolled back with it), without the cause.
    console.error('commit_ledger_proposal failed:', error.message)
    await audit({ user_id: userId, action: 'commit', outcome: 'failed', proposal_id: proposalId })
    return { status: 'failed' }
  }

  const { status, ledger_entry_id } = data as { status: string; ledger_entry_id?: string }
  if (status !== 'committed' && status !== 'already_committed') return { status } as CommitResult

  const { data: row, error: rowError } = await supabase.from('general_ledger')
    .select('id, entry_date, particulars, debit, credit, balance')
    .eq('id', ledger_entry_id as string).single()
  if (rowError || !row) return { status: 'failed' }
  return { status, entry: row as LedgerRow }
}
