import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to AR Dashboard</h2>
        <p className="text-muted-foreground">Manage customers, orders, and measurements efficiently.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">View and manage all customers.</p>
            <Link href="/customers" className="text-blue-600 hover:underline text-sm">Go to Customers →</Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Track and manage all orders.</p>
            <Link href="/orders" className="text-blue-600 hover:underline text-sm">Go to Orders →</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
