'use client'

import { useEffect, useState } from 'react'
import { Plus, Eye, Edit, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Vendor } from '@/lib/supabase-client'
import { toast } from 'sonner'
import { VendorDialog } from '@/components/dialogs/vendor-dialog'

export default function VendorsPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)

  useEffect(() => {
    fetchVendors()
  }, [])

  const fetchVendors = async () => {
    try {
      const response = await fetch('/api/vendors')
      if (!response.ok) throw new Error('Failed to fetch vendors')
      const data = await response.json()
      setVendors(data)
    } catch (error) {
      console.error('Error fetching vendors:', error)
      toast.error('Failed to load vendors')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = (vendor: Vendor) => {
    setEditingVendor(vendor)
    setDialogOpen(true)
  }

  const handleDelete = async (vendor: Vendor) => {
    if (!confirm(`Are you sure you want to delete ${vendor.name}?`)) return

    try {
      const response = await fetch(`/api/vendors/${vendor.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete vendor')

      toast.success('Vendor deleted successfully')
      fetchVendors()
    } catch (error) {
      console.error('Error deleting vendor:', error)
      toast.error('Failed to delete vendor')
    }
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditingVendor(null)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Vendors</h1>
        </div>
        <div className="text-center py-12">Loading vendors...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Vendors</h1>
          <p className="text-muted-foreground mt-1">
            Manage your vendors and supplier relationships
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Vendor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Vendors</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell className="font-medium">{vendor.name}</TableCell>
                  <TableCell className="max-w-md">{vendor.notes || '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/vendors/${vendor.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Ledger
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(vendor)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(vendor)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {vendors.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No vendors found</p>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Vendor
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <VendorDialog
        open={dialogOpen}
        onOpenChange={handleCloseDialog}
        vendor={editingVendor}
        onSuccess={() => {
          toast.success(editingVendor ? 'Vendor updated successfully' : 'Vendor created successfully')
          handleCloseDialog()
          fetchVendors()
        }}
      />
    </div>
  )
}
