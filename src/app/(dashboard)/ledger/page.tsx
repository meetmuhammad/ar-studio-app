'use client'

import { useEffect, useState } from 'react'
import { useDebounce } from 'use-debounce'
import {
  BookOpen,
  Download,
  Edit,
  Plus,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
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
import { LedgerEntryDialog } from '@/components/dialogs/ledger-entry-dialog'
import { DeleteConfirmationDialog } from '@/components/dialogs/delete-confirmation-dialog'
import { PageHeader } from '@/components/dashboard/page-header'
import { MetricCard } from '@/components/dashboard/metric-card'
import { SearchInput } from '@/components/dashboard/search-input'
import { DateRangeFilter } from '@/components/dashboard/date-range-filter'
import { Pagination } from '@/components/dashboard/pagination'
import { TableSkeleton, StatRowSkeleton } from '@/components/dashboard/table-skeleton'
import { EmptyState } from '@/components/dashboard/empty-state'
import { ErrorState } from '@/components/dashboard/error-state'
import {
  SectionCard,
  SectionCardContent,
  SectionCardHeader,
  SectionCardTitle,
} from '@/components/dashboard/section-card'
import type { GeneralLedgerWithRelations } from '@/lib/supabase-client'
import { formatDate, formatPKR } from '@/lib/format'
import {
  useDeleteLedgerEntry,
  useLedgerEntries,
  useLedgerStats,
} from '@/hooks/use-api'

const ITEMS_PER_PAGE = 20

/**
 * Entry types are categories, not statuses.
 *
 * The previous mapping painted `miscellaneous` with the destructive variant, so
 * every routine uncategorised entry showed up red and read as a problem. These
 * are all neutral now; the label carries the distinction.
 */
const ENTRY_TYPE_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance',
  order_payment: 'Order payment',
  vendor_payment: 'Vendor payment',
  miscellaneous: 'Miscellaneous',
}

function entryTypeLabel(type: string): string {
  return ENTRY_TYPE_LABEL[type] ?? type.replace(/_/g, ' ')
}

export default function LedgerPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<GeneralLedgerWithRelations | null>(null)
  const [deletingEntry, setDeletingEntry] = useState<GeneralLedgerWithRelations | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch] = useDebounce(searchQuery, 300)
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)

  const {
    data: entriesResult,
    isLoading,
    isError,
    error,
    refetch: fetchData,
  } = useLedgerEntries({
    page: currentPage,
    pageSize: ITEMS_PER_PAGE,
    search: debouncedSearch,
    startDate: dateFrom?.toISOString().split('T')[0],
    endDate: dateTo?.toISOString().split('T')[0],
  })

  const { data: stats = { totalDebit: 0, totalCredit: 0, currentBalance: 0, entryCount: 0 } } =
    useLedgerStats()
  const deleteMutation = useDeleteLedgerEntry()

  const entries = (entriesResult?.data ?? []).map(
    (entry: GeneralLedgerWithRelations) => ({
      ...entry,
      calculatedBalance: entry.balance,
    })
  ) as GeneralLedgerWithRelations[]
  const totalEntries = entriesResult?.pagination?.total ?? 0
  const totalPages = entriesResult?.pagination?.pages ?? 1

  // Any change to what is being filtered invalidates the current page number.
  useEffect(() => {
    setCurrentPage(1)
  }, [dateFrom, dateTo, debouncedSearch])

  const handleEdit = (entry: GeneralLedgerWithRelations) => {
    setEditingEntry(entry)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingEntry) return
    await deleteMutation.mutateAsync(deletingEntry.id)
    setDeletingEntry(null)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingEntry(null)
  }

  const exportToCSV = () => {
    try {
      const headers = [
        'Date',
        'Particulars',
        'Type',
        'Debit',
        'Credit',
        'Balance',
        'Vendor',
        'Order Number',
        'Notes',
      ]

      const quote = (value: string) => `"${value.replace(/"/g, '""')}"`

      const rows = entries.map((entry) => [
        formatDate(entry.entry_date),
        quote(entry.particulars),
        entryTypeLabel(entry.entry_type),
        entry.debit || 0,
        entry.credit || 0,
        entry.calculatedBalance || entry.balance,
        entry.vendors?.name ? quote(entry.vendors.name) : '',
        entry.orders?.order_number ? quote(entry.orders.order_number) : '',
        entry.notes ? quote(entry.notes) : '',
      ])

      const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      link.setAttribute('href', url)
      link.setAttribute('download', `ledger_entries_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      // Revoking releases the blob; without it the export leaked one object URL
      // per download for the life of the tab.
      URL.revokeObjectURL(url)

      toast.success(`Exported ${entries.length} ledger entries to CSV`)
    } catch (err) {
      console.error('Error exporting CSV:', err)
      toast.error('Failed to export CSV')
    }
  }

  const isFiltered = Boolean(debouncedSearch || dateFrom || dateTo)

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="mx-auto max-w-[1600px] space-y-6">
        <PageHeader
          title="General Ledger"
          description="Every financial transaction and running balance"
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToCSV}
                disabled={entries.length === 0}
              >
                <Download className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Add Entry</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </>
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
          <SearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            label="Search ledger entries"
            placeholder="Search by particulars…"
          />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
          />
        </div>

        {isLoading ? (
          <StatRowSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Debit"
              value={formatPKR(stats.totalDebit)}
              caption="Money in"
              icon={TrendingUp}
              tone="positive"
              isZero={stats.totalDebit === 0}
            />
            <MetricCard
              label="Total Credit"
              value={formatPKR(stats.totalCredit)}
              caption="Money out"
              icon={TrendingDown}
              tone="negative"
              isZero={stats.totalCredit === 0}
            />
            <MetricCard
              label="Current Balance"
              value={formatPKR(stats.currentBalance)}
              caption="Net position"
              icon={Scale}
            />
            <MetricCard
              label="Total Entries"
              value={String(stats.entryCount)}
              caption="All transactions"
              icon={BookOpen}
            />
          </div>
        )}

        {isError ? (
          <ErrorState
            title="Couldn't load ledger entries"
            detail={error instanceof Error ? error.message : undefined}
            onRetry={() => fetchData()}
          />
        ) : isLoading ? (
          <TableSkeleton columns={7} />
        ) : (
          <SectionCard>
            <SectionCardHeader>
              <SectionCardTitle className="text-base">
                Ledger Entries{' '}
                <span className="font-mono text-sm font-normal tabular-nums text-muted-foreground">
                  ({totalEntries})
                </span>
              </SectionCardTitle>
            </SectionCardHeader>

            <SectionCardContent>
              {entries.length === 0 ? (
                <EmptyState
                  icon={BookOpen}
                  message={
                    isFiltered
                      ? 'No entries match these filters'
                      : 'No ledger entries yet'
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
                      <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="size-4" aria-hidden="true" />
                        Add the first entry
                      </Button>
                    )
                  }
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Particulars</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums">
                            {formatDate(entry.entry_date)}
                          </TableCell>
                          <TableCell className="min-w-[14rem]">
                            <div className="font-medium">{entry.particulars}</div>
                            {entry.vendors ? (
                              <div className="text-xs text-muted-foreground">
                                Vendor: {entry.vendors.name}
                              </div>
                            ) : null}
                            {entry.orders ? (
                              <div className="font-mono text-xs text-muted-foreground">
                                Order: {entry.orders.order_number}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="whitespace-nowrap">
                              {entryTypeLabel(entry.entry_type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-success-text">
                            {entry.debit ? formatPKR(entry.debit) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono tabular-nums text-destructive-text">
                            {entry.credit ? formatPKR(entry.credit) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono font-medium tabular-nums">
                            {formatPKR(entry.calculatedBalance || entry.balance)}
                          </TableCell>
                          <TableCell className="text-right">
                            {/* Order payments are written by the orders flow; editing
                                one here would drift it from its source record. */}
                            {entry.entry_type !== 'order_payment' ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Edit entry: ${entry.particulars}`}
                                  onClick={() => handleEdit(entry)}
                                >
                                  <Edit className="size-4" aria-hidden="true" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Delete entry: ${entry.particulars}`}
                                  onClick={() => setDeletingEntry(entry)}
                                  className="text-muted-foreground hover:text-destructive-text"
                                >
                                  <Trash2 className="size-4" aria-hidden="true" />
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalEntries}
                    pageItemCount={entries.length}
                    pageSize={ITEMS_PER_PAGE}
                    itemLabel="entries"
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </SectionCardContent>
          </SectionCard>
        )}

        <LedgerEntryDialog
          open={dialogOpen}
          onOpenChange={handleCloseDialog}
          entry={editingEntry}
          onSuccess={() => {
            toast.success(editingEntry ? 'Ledger entry updated' : 'Ledger entry created')
            handleCloseDialog()
            fetchData()
          }}
        />

        <DeleteConfirmationDialog
          open={Boolean(deletingEntry)}
          onOpenChange={(open) => {
            if (!open) setDeletingEntry(null)
          }}
          title="Delete ledger entry"
          description={`Delete "${deletingEntry?.particulars ?? ''}"? The matching vendor ledger entry, if there is one, is deleted with it. This cannot be undone.`}
          onConfirm={handleDelete}
        />
      </div>
    </RoleGuard>
  )
}
