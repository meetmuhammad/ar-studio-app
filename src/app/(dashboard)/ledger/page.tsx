'use client'

import { useEffect, useState, useRef } from 'react'
import { Plus, BookOpen, TrendingUp, TrendingDown, DollarSign, RefreshCw, Edit, Search, Download, Trash2, X } from 'lucide-react'
import { RoleGuard } from '@/components/auth/role-guard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { LedgerEntryDialog } from '@/components/dialogs/ledger-entry-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GeneralLedgerWithRelations, LedgerEntryType } from '@/lib/supabase-client'
import { LEDGER_ENTRY_TYPES } from '@/lib/ledger-query'
import { toast } from 'sonner'
import { useLedgerEntries, useLedgerStats, useCreateLedgerEntry, useUpdateLedgerEntry, useDeleteLedgerEntry, useExportLedgerCsv, useVendors } from '@/hooks/use-api'

/** Select cannot hold an empty-string value, so "no filter" needs a sentinel. */
const ALL = '__all__'

/**
 * A `Date` from the picker is local-midnight; `toISOString()` converts to UTC
 * first, which rolls the date back a day for anyone west of Greenwich and
 * silently drops a day's entries out of the filter. `entry_date` is a DATE
 * column, so format the local calendar date instead.
 */
function toDateParam(date: Date | undefined): string | undefined {
  if (!date) return undefined
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export default function LedgerPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<GeneralLedgerWithRelations | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [entryType, setEntryType] = useState<LedgerEntryType | typeof ALL>(ALL)
  const [vendorId, setVendorId] = useState<string>(ALL)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  // One filter object drives the table and the export, so the file a user
  // downloads is always the query they are looking at.
  const activeFilters = {
    search: debouncedSearch,
    startDate: toDateParam(dateFrom),
    endDate: toDateParam(dateTo),
    entryType: entryType === ALL ? undefined : entryType,
    vendorId: vendorId === ALL ? undefined : vendorId,
  }

  // React Query hooks
  const { data: entriesResult, isLoading, refetch: fetchData } = useLedgerEntries({
    ...activeFilters,
    page: currentPage,
    pageSize: itemsPerPage,
  })
  const { data: stats = { totalDebit: 0, totalCredit: 0, currentBalance: 0, entryCount: 0 } } = useLedgerStats()
  const { data: vendors = [] } = useVendors()
  const deleteMutation = useDeleteLedgerEntry()
  const exportMutation = useExportLedgerCsv()

  /**
   * `calculatedBalance` is a leftover from when the client recomputed a running
   * balance across the page it was holding. It is now just a mirror of the
   * stored `balance` column, which the database triggers maintain across the
   * WHOLE ledger in (entry_date, created_at) order -- so a filtered view still
   * shows each entry's true position, not a total of the visible rows. Kept
   * only because other code still reads the field.
   */
  const entries = (entriesResult?.data || []).map((entry) => ({
    ...entry,
    calculatedBalance: entry.balance,
  })) as GeneralLedgerWithRelations[]
  const totalEntries = entriesResult?.pagination?.total || 0
  const totalPages = entriesResult?.pagination?.pages || 1

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(value)
      setCurrentPage(1)
    }, 300)
  }

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [dateFrom, dateTo, entryType, vendorId])

  const handleEdit = (entry: GeneralLedgerWithRelations) => {
    setEditingEntry(entry)
    setDialogOpen(true)
  }

  const handleDelete = async (entry: GeneralLedgerWithRelations) => {
    if (!confirm(`Are you sure you want to delete this ledger entry? This will also delete the corresponding vendor ledger entry if any.`)) {
      return
    }
    await deleteMutation.mutateAsync(entry.id)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingEntry(null)
  }

  /**
   * Ask the server for every row matching the active filters.
   *
   * This used to serialise `entries`, which is one page of 20. Exporting a
   * 3000-row ledger produced a 20-row file with no warning, and the toast
   * confidently reported the number it had just written.
   */
  const exportToCSV = () => {
    exportMutation.mutate(activeFilters)
  }

  // Server handles pagination — use entries directly
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + entries.length, startIndex + itemsPerPage)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getEntryTypeBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
      opening_balance: 'default',
      order_payment: 'secondary',
      vendor_payment: 'outline',
      miscellaneous: 'destructive',
    }
    return <Badge variant={variants[type] || 'default'}>{type.replace('_', ' ')}</Badge>
  }

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">General Ledger</h1>
        <div className="text-center py-12">Loading ledger...</div>
      </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">General Ledger</h1>
          <p className="text-muted-foreground mt-1">
            Track all financial transactions and balances
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportToCSV}
            disabled={totalEntries === 0 || exportMutation.isPending}
          >
            <Download className="h-4 w-4 mr-2" />
            {exportMutation.isPending ? 'Exporting…' : 'Export CSV'}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Filters. Every control here is applied server-side and is included in
          the CSV export, so the file always matches what is on screen. */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
          placeholder="Search by particulars..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">From Date</Label>
          <DatePicker
            date={dateFrom}
            onDateChange={setDateFrom}
            placeholder="From date"
            className="w-[160px]"
            maxDate={dateTo || undefined}
          />
          {dateFrom && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDateFrom(undefined)}
              className="h-10 w-10 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">To Date</Label>
          <DatePicker
            date={dateTo}
            onDateChange={setDateTo}
            placeholder="To date"
            className="w-[160px]"
            minDate={dateFrom || undefined}
          />
          {dateTo && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDateTo(undefined)}
              className="h-10 w-10 flex-shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Type</Label>
          <Select
            value={entryType}
            onValueChange={(value) => setEntryType(value as LedgerEntryType | typeof ALL)}
          >
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {LEDGER_ENTRY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All vendors</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(entryType !== ALL || vendorId !== ALL || dateFrom || dateTo || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEntryType(ALL)
              setVendorId(ALL)
              setDateFrom(undefined)
              setDateTo(undefined)
              setSearchQuery('')
              setDebouncedSearch('')
              setCurrentPage(1)
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalDebit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Money in</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credit</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCredit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Money out</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.currentBalance)}</div>
            <p className="text-xs text-muted-foreground mt-1">Net position</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.entryCount}</div>
            <p className="text-xs text-muted-foreground mt-1">All transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Ledger Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {formatDate(entry.entry_date)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.particulars}</div>
                      {entry.vendors && (
                        <div className="text-xs text-muted-foreground">
                          Vendor: {entry.vendors.name}
                        </div>
                      )}
                      {entry.orders && (
                        <div className="text-xs text-muted-foreground">
                          Order: {entry.orders.order_number}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getEntryTypeBadge(entry.entry_type)}</TableCell>
                  <TableCell className="text-right text-green-600">
                    {entry.debit ? formatCurrency(entry.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    {entry.credit ? formatCurrency(entry.credit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(entry.calculatedBalance || entry.balance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.entry_type !== 'order_payment' && (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(entry)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(entry)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {entries.length === 0 && !isLoading && (
            <div className="text-center py-12 text-muted-foreground">
              {debouncedSearch ? 'No entries match your search' : 'No ledger entries found'}
            </div>
          )}

          {/* Pagination */}
          {totalEntries > 0 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, totalEntries)} of {totalEntries} entries
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(page => {
                      // Show first page, last page, current page, and pages around current
                      return page === 1 || 
                             page === totalPages || 
                             (page >= currentPage - 1 && page <= currentPage + 1)
                    })
                    .map((page, index, array) => (
                      <div key={page} className="flex items-center">
                        {index > 0 && array[index - 1] !== page - 1 && (
                          <span className="px-2 text-muted-foreground">...</span>
                        )}
                        <Button
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </Button>
                      </div>
                    ))
                  }
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <LedgerEntryDialog
        open={dialogOpen}
        onOpenChange={handleCloseDialog}
        entry={editingEntry}
        onSuccess={() => {
          toast.success(editingEntry ? 'Ledger entry updated successfully' : 'Ledger entry created successfully')
          handleCloseDialog()
          fetchData()
        }}
      />
    </div>
    </RoleGuard>
  )
}
