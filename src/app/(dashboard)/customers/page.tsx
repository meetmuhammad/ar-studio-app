import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customers</h2>
          <p className="text-muted-foreground">Manage all customers and their information.</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Customer
        </Button>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <p className="text-muted-foreground">Customer management interface will be implemented here.</p>
        <p className="text-sm text-gray-500 mt-2">
          This will include search, pagination, and CRUD operations for customers.
        </p>
      </div>
    </div>
  )
}