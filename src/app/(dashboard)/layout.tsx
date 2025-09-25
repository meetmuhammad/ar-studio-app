import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { RouteGuard } from '@/components/auth/route-guard'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RouteGuard requireAuth={true} requiredRoles={['admin', 'staff']}>
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-muted/40 p-6">
            {children}
          </main>
        </div>
      </div>
    </RouteGuard>
  )
}
