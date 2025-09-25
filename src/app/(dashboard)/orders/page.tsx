import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Orders</h2>
          <p className="text-muted-foreground">Manage all orders and measurements.</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Order
        </Button>
      </div>

      <div className="bg-white rounded-lg border p-6">
        <p className="text-muted-foreground">Order management interface will be implemented here.</p>
        <p className="text-sm text-gray-500 mt-2">
          This will include search, filters, pagination, and CRUD operations for orders with measurements.
        </p>
      </div>
    </div>
  )
}