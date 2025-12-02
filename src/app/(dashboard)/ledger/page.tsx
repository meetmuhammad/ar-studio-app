'use client'

import { useEffect, useState } from 'react'
import { Plus, BookOpen, TrendingUp, TrendingDown, DollarSign, RefreshCw, Edit, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import type { GeneralLedgerWithRelations } from '@/lib/supabase-client'
import { toast } from 'sonner'

export default function LedgerPage() {
  const [entries, setEntries] = useState<GeneralLedgerWithRelations[]>([])
  const [filteredEntries, setFilteredEntries] = useState<GeneralLedgerWithRelations[]>([])
  const [stats, setStats] = useState({ totalDebit: 0, totalCredit: 0, currentBalance: 0, entryCount: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<GeneralLedgerWithRelations | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    // Filter entries based on search query
    if (!searchQuery.trim()) {
      setFilteredEntries(entries)
    } else {
      const query = searchQuery.toLowerCase()
      const filtered = entries.filter(entry => 
        entry.particulars.toLowerCase().includes(query) ||
        entry.entry_type.toLowerCase().includes(query) ||
        entry.vendors?.name.toLowerCase().includes(query) ||
        entry.orders?.order_number.toLowerCase().includes(query) ||
        (entry.notes && entry.notes.toLowerCase().includes(query))
      )
      setFilteredEntries(filtered)
    }
    setCurrentPage(1) // Reset to first page on search
  }, [searchQuery, entries])

  const fetchData = async () => {
    try {
      const [entriesRes, statsRes] = await Promise.all([
        fetch('/api/general-ledger'),
        fetch('/api/general-ledger/stats'),
      ])

      if (!entriesRes.ok || !statsRes.ok) throw new Error('Failed to fetch data')

      const entriesData = await entriesRes.json()
      const statsData = await statsRes.json()

      setEntries(entriesData)
      setStats(statsData)
    } catch (error) {
      console.error('Error fetching ledger data:', error)
      toast.error('Failed to load ledger data')
    } finally {
      setIsLoading(false)
    }
  }

  const syncOrderPayments = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/general-ledger/sync-payments', {
        method: 'POST',
      })

      if (!response.ok) throw new Error('Failed to sync payments')

      const result = await response.json()
      toast.success(`Synced ${result.synced} order payments to ledger`)
      fetchData() // Refresh the data
    } catch (error) {
      console.error('Error syncing payments:', error)
      toast.error('Failed to sync order payments')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleEdit = (entry: GeneralLedgerWithRelations) => {
    setEditingEntry(entry)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingEntry(null)
  }

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedEntries = filteredEntries.slice(startIndex, endIndex)

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
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">General Ledger</h1>
        <div className="text-center py-12">Loading ledger...</div>
      </div>
    )
  }

  return (
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
            onClick={syncOrderPayments}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync Order Payments
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by particulars, vendor, order, type, or notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debit</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalDebit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Money out</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalCredit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Money in</p>
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
              {paginatedEntries.map((entry) => (
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
                  <TableCell className="text-right text-red-600">
                    {entry.debit ? formatCurrency(entry.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {entry.credit ? formatCurrency(entry.credit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(entry.balance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {entry.entry_type !== 'order_payment' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(entry)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredEntries.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? 'No entries match your search' : 'No ledger entries found'}
            </div>
          )}

          {/* Pagination */}
          {filteredEntries.length > 0 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredEntries.length)} of {filteredEntries.length} entries
                {searchQuery && ` (filtered from ${entries.length} total)`}
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
  )
}
