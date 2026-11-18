'use client'

import Link from 'next/link'
import { CanAccess } from '@refinedev/core'
import { Button, Result } from 'antd'

interface ResourceGuardProps {
  resource: string
  action?: string
  children: React.ReactNode
}

/**
 * Renders a page only when the accessControlProvider allows `action` on
 * `resource`; otherwise a 403 result (e.g. staff opening /vendors directly).
 * The sidebar already hides the entry; this covers typed or shared URLs.
 */
export function ResourceGuard({ resource, action = 'list', children }: ResourceGuardProps) {
  return (
    <CanAccess
      resource={resource}
      action={action}
      fallback={
        <Result
          status="403"
          title="403"
          subTitle="Sorry, you are not authorized to access this page."
          extra={
            <Link href="/customers">
              <Button type="primary">Go to Customers</Button>
            </Link>
          }
        />
      }
      queryOptions={{ staleTime: 30_000 }}
    >
      {children}
    </CanAccess>
  )
}
