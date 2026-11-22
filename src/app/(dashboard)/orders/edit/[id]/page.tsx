'use client'

import { useParams } from 'next/navigation'
import { Edit } from '@refinedev/antd'
import { Form, Result } from 'antd'
import { WriteGuard } from '@/components/refine/write-guard'
import { PageSkeleton, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { OrderStepsForm } from '@/components/orders/order-steps-form'
import { useOrderForm } from '@/components/orders/use-order-form'
import { ORDERS } from '@/components/orders/constants'

export default function OrderEditPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <WriteGuard resource={ORDERS} action="edit" id={id} backHref={`/orders/show/${id}`}>
      <OrderEditForm id={id} />
    </WriteGuard>
  )
}

/** Saved through update_order: fields, items and the advance ledger row together. */
function OrderEditForm({ id }: { id: string }) {
  const { formProps, submit, formLoading, query, record, formValues } = useOrderForm('edit', id)
  const loading = !!query?.isLoading
  const notFound = query?.error?.statusCode === 404

  return (
    <Edit
      title={record ? `Edit Order ${record.order_number}` : 'Edit Order'}
      headerProps={withSubtitle(record?.customers?.name)}
      contentProps={transparentContent}
      recordItemId={id}
      footerButtons={() => null}
      headerButtons={({ defaultButtons }) => defaultButtons}
    >
      {loading && <PageSkeleton sections={2} />}
      {query?.isError && (
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Order not found in this business.' : "Couldn't load order"}
          subTitle={notFound ? undefined : query.error?.message}
        />
      )}
      {/* Stays mounted while loading; fields render once the values are mapped. */}
      <div hidden={loading || query?.isError}>
        <Form {...formProps} onFinish={() => void submit()} layout="vertical" initialValues={formValues}>
          {formValues && (
            <OrderStepsForm
              form={formProps.form!}
              mode="edit"
              onSubmit={() => void submit()}
              submitting={formLoading}
              cancelHref={`/orders/show/${id}`}
            />
          )}
        </Form>
      </div>
    </Edit>
  )
}
