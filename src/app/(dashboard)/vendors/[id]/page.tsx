'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Building2, Plus, Receipt } from 'lucide-react'
import { toast } from 'sonner'

import { RoleGuard } from '@/components/auth/role-guard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VendorBillDialog } from '@/components/dialogs/vendor-bill-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { MetricCard } from '@/components/dashboard/metric-card'
import { SearchInput } from '@/components/dashboard/search-input'
import { DateRangeFilter } from '@/components/dashboard/date-range-filter'
import { TableSkeleton, StatRowSkeleton } from '@/components/dashboard/table-skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ErrorState } from '@/components/dashboard/error-state'
import {
  SectionCard,
  SectionCardContent,
  SectionCardHeader,
  SectionCardTitle,
} from '@/components/dashboard/section-card'
import type { Vendor } from '@/lib/supabase-client'
import { formatDate, formatPKR } from '@/lib/format'

interface VendorLedgerEntry {
  id: string
  entry_date: string
  particulars: string
  notes?: string | null
  debit?: number | null
  credit?: number | null
  general_ledger_id?: string | null
  general_ledger?: { entry_type?: string } | null
}

const ENTRY_TYPE_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance',
  order_payment: 'Order payment',
  vendor_payment: 'Vendor payment',
  miscellaneous: 'Miscellaneous',
}

export default function VendorLedgerPage() {
  const router = useRouter()
  const params = useParams()
  const vendorId = params.id as string

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [entries, setEntries] = useState<VendorLedgerEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [billDialogOpen, setBillDialogOpen] = useState(false)

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId])

  const fetchData = async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [vendorRes, entriesRes] = await Promise.all([
        fetch(`/api/vendors/${vendorId}`),
        fetch(`/api/vendor-ledger?vendor_id=${vendorId}`),
      ])

      if (!vendorRes.ok || !entriesRes.ok) throw new Error('Failed to fetch vendor ledger')

      setVendor(await vendorRes.json())
      setEntries(await entriesRes.json())
    } catch (error) {
      console.error('Error fetching vendor ledger:', error)
      setLoadError(error instanceof Error ? error.message : 'Failed to load vendor ledger')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Running balance per entry: the cumulative net from this row through the end
   * of the list, which is what the running total means when rows arrive newest
   * first. Computed once as a suffix scan — the previous version re-scanned the
   * whole array inside the render loop, so a 500-row vendor did 125,000
   * reductions on every keystroke in the search field.
   */
  const balanceByEntryId = useMemo(() => {
    const balances = new Map<string, number>()
    let running = 0

    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      running += (entry.debit || 0) - (entry.credit || 0)
      balances.set(entry.id, running)
    }

    return balances
  }, [entries])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return entries.filter((entry) => {
      if (query) {
        const haystack = [entry.particulars, entry.notes, formatDate(entry.entry_date)]
        if (!haystack.some((field) => field?.toLowerCase().includes(query))) return false
      }

      if (dateFrom || dateTo) {
        const entryDate = new Date(entry.entry_date)
        entryDate.setHours(0, 0, 0, 0)

        if (dateFrom) {
          const from = new Date(dateFrom)
          from.setHours(0, 0, 0, 0)
          if (entryDate < from) return false
        }

        if (dateTo) {
          const to = new Date(dateTo)
          to.setHours(23, 59, 59, 999)
          if (entryDate > to) return false
        }
      }

      return true
    })
  }, [entries, searchQuery, dateFrom, dateTo])

  // Totals come from every entry, not the filtered view: a vendor's balance is
  // a fact about the relationship, not about the current search.
  const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0)
  const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0)
  const balance = totalDebit - totalCredit
  const weOweVendor = balance >= 0
  const isFiltered = Boolean(searchQuery || dateFrom || dateTo)

  const backButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Back to vendors"
      onClick={() => router.push('/vendors')}
      className="shrink-0"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
    </Button>
  )

  if (loadError) {
    return (
      <RoleGuard allowedRoles={['admin']}>
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div className="flex items-center gap-2">
            {backButton}
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Vendor Ledger</h1>
          </div>
          <ErrorState
            title="Couldn't load this vendor's ledger"
            detail={loadError}
            onRetry={fetchData}
          />
        </div>
      </RoleGuard>
    )
  }

  if (!isLoading && !vendor) {
    return (
      <RoleGuard allowedRoles={['admin']}>
        <div className="mx-auto max-w-[1600px] space-y-6">
          <div className="flex items-center gap-2">
            {backButton}
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Vendor Ledger</h1>
          </div>
          <SectionCard>
            <SectionCardContent>
              <EmptyState
                icon={Building2}
                message="This vendor no longer exists"
                action={
                  <Button variant="outline" size="sm" onClick={() => router.push('/vendors')}>
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Back to vendors
                  </Button>
                }
              />
            </SectionCardContent>
          </SectionCard>
        </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex items-start gap-2">
          {backButton}
          <PageHeader
            className="flex-1"
            title={vendor?.name ?? 'Vendor'}
            description="Vendor ledger"
            actions={
              <Button size="sm" onClick={() => setBillDialogOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Create Bill</span>
                <span className="sm:hidden">Bill</span>
              </Button>
            }
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
          <SearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            label="Search this vendor's transactions"
            placeholder="Search by particulars, notes, or date…"
          />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
        </div>

        {isLoading ? (
          <StatRowSkeleton count={3} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MetricCard
              label="Total Debit"
              value={formatPKR(totalDebit)}
              caption="Paid to this vendor"
              tone="positive"
              isZero={totalDebit === 0}
            />
            <MetricCard
              label="Total Credit"
              value={formatPKR(totalCredit)}
              caption="Returned by this vendor"
              tone="negative"
              isZero={totalCredit === 0}
            />
            <MetricCard
              label="Net Balance"
              value={formatPKR(Math.abs(balance))}
              caption={
                balance === 0
                  ? 'Settled'
                  : weOweVendor
                    ? 'We owe this vendor'
                    : 'This vendor owes us'
              }
              tone={weOweVendor ? 'warning' : 'positive'}
              isZero={balance === 0}
            />
          </div>
        )}

        {isLoading ? (
          <TableSkeleton columns={6} />
        ) : (
          <SectionCard>
            <SectionCardHeader>
              <SectionCardTitle className="text-base">
                Ledger Entries{' '}
                <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
                  ({filteredEntries.length})
                </span>
              </SectionCardTitle>
            </SectionCardHeader>

            <SectionCardContent>
              {filteredEntries.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  message={
                    isFiltered
                      ? 'No transactions match these filters'
                      : 'No transactions with this vendor yet'
                  }
                  action={
                    isFiltered ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSearchQuery('')
                          setDateFrom(undefined)
                          setDateTo(undefined)
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setBillDialogOpen(true)}>
                        <Plus className="size-4" aria-hidden="true" />
                        Create the first bill
                      </Button>
                    )
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => {
                      const type = entry.general_ledger_id
                        ? entry.general_ledger?.entry_type || 'vendor_payment'
                        : null

                      return (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                            {formatDate(entry.entry_date)}
                          </TableCell>
                          <TableCell className="min-w-[14rem]">
                            <div className="font-medium">{entry.particulars}</div>
                            {entry.notes ? (
                              <div className="text-xs text-muted-foreground">{entry.notes}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {type
                                ? ENTRY_TYPE_LABEL[type] ?? type.replace(/_/g, ' ')
                                : 'Vendor bill'}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-success-text">
                            {entry.debit ? formatPKR(entry.debit) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-destructive-text">
                            {entry.credit ? formatPKR(entry.credit) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono font-medium tabular-nums">
                            {formatPKR(balanceByEntryId.get(entry.id) ?? 0)}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </SectionCardContent>
          </SectionCard>
        )}

        <VendorBillDialog
          open={billDialogOpen}
          onOpenChange={setBillDialogOpen}
          vendorId={vendorId}
          vendorName={vendor?.name ?? ''}
          onSuccess={() => {
            toast.success('Bill created')
            fetchData()
          }}
        />
      </div>
    </RoleGuard>
  )
}
