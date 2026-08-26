'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Building2, Plus, Search, X } from 'lucide-react'
import { RoleGuard } from '@/components/auth/role-guard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import type { VendorWithCategory, GeneralLedgerWithRelations } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { VendorBillDialog } from '@/components/dialogs/vendor-bill-dialog'

export default function VendorLedgerPage() {
  const router = useRouter()
  const params = useParams()
  const vendorId = params.id as string

  const [vendor, setVendor] = useState<VendorWithCategory | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [filteredEntries, setFilteredEntries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [billDialogOpen, setBillDialogOpen] = useState(false)

  useEffect(() => {
    fetchData()
  }, [vendorId])

  useEffect(() => {
    // Filter entries based on search query and date range
    let filtered = entries

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(entry => 
        entry.particulars.toLowerCase().includes(query) ||
        (entry.notes && entry.notes.toLowerCase().includes(query)) ||
        formatDate(entry.entry_date).toLowerCase().includes(query)
      )
    }

    // Apply date range filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter(entry => {
        const entryDate = new Date(entry.entry_date)
        entryDate.setHours(0, 0, 0, 0)
        
        if (dateFrom) {
          const fromDate = new Date(dateFrom)
          fromDate.setHours(0, 0, 0, 0)
          if (entryDate < fromDate) return false
        }
        
        if (dateTo) {
          const toDate = new Date(dateTo)
          toDate.setHours(23, 59, 59, 999)
          if (entryDate > toDate) return false
        }
        
        return true
      })
    }

    setFilteredEntries(filtered)
  }, [searchQuery, dateFrom, dateTo, entries])

  const fetchData = async () => {
    try {
      const [vendorRes, entriesRes] = await Promise.all([
        fetch(`/api/vendors/${vendorId}`),
        fetch(`/api/vendor-ledger?vendor_id=${vendorId}`),
      ])

      if (!vendorRes.ok || !entriesRes.ok) throw new Error('Failed to fetch data')

      const vendorData = await vendorRes.json()
      const entriesData = await entriesRes.json()

      setVendor(vendorData)
      setEntries(entriesData)
    } catch (error) {
      console.error('Error fetching vendor ledger:', error)
      toast.error('Failed to load vendor ledger')
    } finally {
      setIsLoading(false)
    }
  }

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

  // Calculate totals for vendor ledger (from ALL entries, not filtered)
  // In vendor ledger: Debit = money they receive from us (we pay them)
  //                   Credit = money they return/owe us (shouldn't happen often)
  const totalDebit = entries.reduce((sum, entry) => sum + (entry.debit || 0), 0)
  const totalCredit = entries.reduce((sum, entry) => sum + (entry.credit || 0), 0)
  const balance = totalDebit - totalCredit  // Positive = we owe vendor, Negative = vendor owes us

  if (isLoading) {
    return (
      <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div className="text-center py-12">Loading vendor ledger...</div>
      </div>
      </RoleGuard>
    )
  }

  if (!vendor) {
    return (
      <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Vendor not found</p>
          <Button onClick={() => router.push('/vendors')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Vendors
          </Button>
        </div>
      </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/vendors')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-muted-foreground" />
              <h1 className="text-3xl font-bold">{vendor.name}</h1>
              {vendor.vendor_categories && (
                <Badge variant="secondary">{vendor.vendor_categories.name}</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">Vendor Ledger</p>
          </div>
        </div>
        <Button onClick={() => setBillDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Bill
        </Button>
      </div>

      {/* Search and Date Range Filters */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by particulars, notes, or date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalDebit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Money received (from us)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalCredit)}</div>
            <p className="text-xs text-muted-foreground mt-1">Money returned</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${balance >= 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCurrency(Math.abs(balance))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {balance >= 0 ? 'We owe vendor' : 'Vendor owes us'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger Entries */}
      <Card>
        <CardHeader>
          <CardTitle>Ledger Entries ({filteredEntries.length})</CardTitle>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">
                    {formatDate(entry.entry_date)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.particulars}</div>
                      {entry.notes && (
                        <div className="text-xs text-muted-foreground">{entry.notes}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.general_ledger_id ? (
                      getEntryTypeBadge(entry.general_ledger?.entry_type || 'vendor_payment')
                    ) : (
                      <Badge variant="outline">Vendor Bill</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {entry.debit ? formatCurrency(entry.debit) : '-'}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    {entry.credit ? formatCurrency(entry.credit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {/* Calculate running balance */}
                    {formatCurrency(
                      entries
                        .slice(entries.findIndex(e => e.id === entry.id))
                        .reduce((sum, e) => sum + (e.debit || 0) - (e.credit || 0), 0)
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredEntries.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? 'No transactions match your search' : 'No transactions found for this vendor'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Bill Dialog */}
      <VendorBillDialog
        open={billDialogOpen}
        onOpenChange={setBillDialogOpen}
        vendorId={vendorId}
        vendorName={vendor.name}
        onSuccess={() => {
          toast.success('Bill created successfully')
          fetchData()
        }}
      />
    </div>
    </RoleGuard>
  )
}
