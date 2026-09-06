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
import type { GeneralLedgerWithRelations } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { useLedgerEntries, useLedgerStats, useCreateLedgerEntry, useUpdateLedgerEntry, useDeleteLedgerEntry, useSyncOrderPayments, useVendorCategories } from '@/hooks/use-api'

// Sentinel for "no filter" -- Radix Select cannot use an empty string as an
// item value.
const ALL_CATEGORIES = 'all'

export default function LedgerPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<GeneralLedgerWithRelations | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)

  const { data: categories = [] } = useVendorCategories()

  // React Query hooks
  const { data: entriesResult, isLoading, refetch: fetchData } = useLedgerEntries({
    page: currentPage,
    pageSize: itemsPerPage,
    search: debouncedSearch,
    startDate: dateFrom?.toISOString().split('T')[0],
    endDate: dateTo?.toISOString().split('T')[0],
    // Filters by the LEDGER SNAPSHOT category, not the vendor's current
    // category -- see supabase/migrations/20260827000000_vendor_categories.sql.
    vendorCategoryId: categoryFilter === ALL_CATEGORIES ? undefined : categoryFilter,
  })
  const { data: stats = { totalDebit: 0, totalCredit: 0, currentBalance: 0, entryCount: 0 } } = useLedgerStats()
  const syncMutation = useSyncOrderPayments()
  const deleteMutation = useDeleteLedgerEntry()
  
  const entries = (entriesResult?.data || []).map((entry: any) => ({
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

  // Reset page when date or category filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [dateFrom, dateTo, categoryFilter])

  const syncOrderPayments = async () => {
    await syncMutation.mutateAsync()
  }
  const isSyncing = syncMutation.isPending

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

  const exportToCSV = () => {
    try {
      // CSV headers
      const headers = ['Date', 'Particulars', 'Type', 'Debit', 'Credit', 'Balance', 'Vendor', 'Vendor Category', 'Order Number', 'Notes']
      
      // Convert entries to CSV rows
      const rows = entries.map(entry => [
        new Date(entry.entry_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
        `"${entry.particulars.replace(/"/g, '""')}"`, // Escape double quotes
        entry.entry_type.replace('_', ' '),
        entry.debit || 0,
        entry.credit || 0,
        entry.calculatedBalance || entry.balance,
        entry.vendors?.name ? `"${entry.vendors.name.replace(/"/g, '""')}"` : '',
        // The ledger SNAPSHOT category (what the books said when this row was
        // written), not the vendor's current category.
        entry.vendor_id ? `"${(entry.vendor_category_name || 'Uncategorized').replace(/"/g, '""')}"` : '',
        entry.orders?.order_number ? `"${entry.orders.order_number.replace(/"/g, '""')}"` : '',
        entry.notes ? `"${entry.notes.replace(/"/g, '""')}"` : '',
      ])
      
      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n')
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      
      link.setAttribute('href', url)
      link.setAttribute('download', `ledger_entries_${new Date().toISOString().split('T')[0]}.csv`)
      link.style.visibility = 'hidden'
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      toast.success(`Exported ${entries.length} ledger entries to CSV`)
    } catch (error) {
      console.error('Error exporting CSV:', error)
      toast.error('Failed to export CSV')
    }
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
            disabled={entries.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Search, Category, and Date Range Filters */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_auto_auto_auto]">
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
          <Label className="text-sm text-muted-foreground whitespace-nowrap">Category</Label>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                          {/* Ledger SNAPSHOT category -- what the books said at the
                              time, not the vendor's current category. */}
                          {' · '}{entry.vendor_category_name || 'Uncategorized'}
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
