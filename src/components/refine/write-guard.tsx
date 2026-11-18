'use client'

import Link from 'next/link'
import { CanAccess, useCan } from '@refinedev/core'
import { Button, Result } from 'antd'

interface WriteGuardProps {
  resource: string
  action: 'create' | 'edit'
  id?: string
  backHref: string
  children: React.ReactNode
}

/**
 * Renders a create/edit page only when the accessControlProvider allows it,
 * otherwise explains why (e.g. the read-only "All businesses" view).
 */
export function WriteGuard({ resource, action, id, backHref, children }: WriteGuardProps) {
  const { data } = useCan({ resource, action, params: id ? { id } : undefined })
  return (
    <CanAccess
      resource={resource}
      action={action}
      params={id ? { id } : undefined}
      fallback={
        <Result
          status="info"
          title="Read-only"
          subTitle={data?.reason ?? 'You cannot make this change.'}
          extra={
            <Link href={backHref}>
              <Button>Go back</Button>
            </Link>
          }
        />
      }
    >
      {children}
    </CanAccess>
  )
}
