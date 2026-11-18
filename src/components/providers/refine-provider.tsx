'use client'

import { Suspense, useEffect, useRef } from 'react'
import { Refine, useInvalidateAuthStore } from '@refinedev/core'
import routerProvider from '@refinedev/nextjs-router'
import { useQueryClient } from '@tanstack/react-query'
import { queryClient } from '@/lib/query-client'
import { useAuth } from '@/contexts/auth-context'
import { useBusiness } from '@/contexts/business-context'
import { authProvider } from '@/lib/refine/auth-provider'
import { accessControlProvider } from '@/lib/refine/access-control'
import { dataProvider } from '@/lib/refine/data-provider'
import { useNotificationProvider } from '@refinedev/antd'
import { resources } from '@/lib/refine/resources'
import { setMembershipIds } from '@/lib/refine/business-scope'
import { AppLogo } from '@/components/refine/app-logo'

/**
 * Refine re-reads auth state whenever the Supabase session or the role changes
 * (sign-in/out here or in another tab, role refresh), so `<Authenticated>`,
 * permissions and access checks never act on a stale session.
 */
function AuthSync() {
  const { user } = useAuth()
  const invalidateAuthStore = useInvalidateAuthStore()
  const client = useQueryClient()
  const key = user ? `${user.id}:${user.role}` : ''
  const previous = useRef(key)

  useEffect(() => {
    if (previous.current === key) return
    previous.current = key
    void invalidateAuthStore()
    void client.invalidateQueries({ queryKey: ['access'] })
  }, [key, invalidateAuthStore, client])

  return null
}

/**
 * Hands the caller's business memberships to the Refine data provider (used by
 * the admin "All businesses" view). Renders before the page so the first
 * query already has them. Must sit inside BusinessProvider.
 */
export function BusinessScopeSync() {
  const { businesses } = useBusiness()
  setMembershipIds(businesses.map((b) => b.id))
  return null
}

/**
 * The app's Refine root. Shares the app-wide React Query client, so Refine
 * queries and the existing useQuery hooks live in one cache (and a business
 * switch, which clears that cache, resets both). Sits inside antd's <App>
 * (ColorModeProvider), which the antd notification provider needs.
 */
export function RefineProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <Refine
        routerProvider={routerProvider}
        dataProvider={dataProvider}
        authProvider={authProvider}
        accessControlProvider={accessControlProvider}
        notificationProvider={useNotificationProvider}
        resources={resources}
        options={{
          reactQuery: { clientConfig: queryClient },
          disableTelemetry: true,
          syncWithLocation: false,
          warnWhenUnsavedChanges: false,
          title: { text: 'AR Studio', icon: <AppLogo /> },
        }}
      >
        <AuthSync />
        {children}
      </Refine>
    </Suspense>
  )
}
