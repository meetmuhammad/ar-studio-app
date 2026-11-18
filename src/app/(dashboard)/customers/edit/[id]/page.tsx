'use client'

import { useParams } from 'next/navigation'
import { Edit, useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form } from 'antd'
import { CustomerFormFields, customerNotifications, deleteNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, type CustomerRow } from '@/components/customers/types'
import type { CreateCustomerInput } from '@/lib/validators'
import { WriteGuard } from '@/components/refine/write-guard'

export default function CustomerEditPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <WriteGuard resource={CUSTOMERS} action="edit" id={id} backHref={`/customers/show/${id}`}>
      <CustomerEditForm id={id} />
    </WriteGuard>
  )
}

/** Updates match id AND the selected business_id (data provider). */
function CustomerEditForm({ id }: { id: string }) {
  const { formProps, saveButtonProps, formLoading } = useForm<CustomerRow, HttpError, CreateCustomerInput>({
    resource: CUSTOMERS,
    action: 'edit',
    id,
    redirect: 'show',
    ...customerNotifications('edit'),
  })

  return (
    <Edit
      title="Edit Customer"
      recordItemId={id}
      isLoading={formLoading}
      saveButtonProps={{ ...saveButtonProps, children: 'Update Customer' }}
      deleteButtonProps={{
        confirmTitle: 'Delete Customer',
        confirmOkText: 'Delete',
        ...deleteNotifications,
      }}
    >
      <Form {...formProps} layout="vertical" style={{ maxWidth: 560 }}>
        <CustomerFormFields />
      </Form>
    </Edit>
  )
}
