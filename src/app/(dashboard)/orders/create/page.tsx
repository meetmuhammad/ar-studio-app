'use client'

import { useSearchParams } from 'next/navigation'
import { Create } from '@refinedev/antd'
import { Form } from 'antd'
import { WriteGuard } from '@/components/refine/write-guard'
import { transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { OrderStepsForm } from '@/components/orders/order-steps-form'
import { NEW_ORDER_DEFAULTS, useOrderForm } from '@/components/orders/use-order-form'
import { ORDERS } from '@/components/orders/constants'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** /orders/create[?customer_id=<uuid>] */
export default function OrderCreatePage() {
  const customerId = useSearchParams().get('customer_id')
  const preset = customerId && UUID.test(customerId) ? customerId : undefined
  return (
    <WriteGuard resource={ORDERS} action="create" backHref="/orders">
      <OrderCreateForm customerId={preset} />
    </WriteGuard>
  )
}

function OrderCreateForm({ customerId }: { customerId?: string }) {
  const { formProps, submit, formLoading } = useOrderForm('create')
  return (
    <Create
      title="Create New Order"
      headerProps={withSubtitle('Customer, measurements and payment in three steps.')}
      contentProps={transparentContent}
      footerButtons={() => null}
    >
      <Form {...formProps} onFinish={() => void submit()} layout="vertical" initialValues={NEW_ORDER_DEFAULTS(customerId)}>
        <OrderStepsForm
          form={formProps.form!}
          mode="create"
          onSubmit={() => void submit()}
          submitting={formLoading}
          cancelHref="/orders"
        />
      </Form>
    </Create>
  )
}
