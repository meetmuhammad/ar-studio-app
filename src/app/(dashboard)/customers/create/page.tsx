'use client'

import { Create, useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form } from 'antd'
import { CustomerFormFields, customerNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, type CustomerRow } from '@/components/customers/types'
import type { CreateCustomerInput } from '@/lib/validators'
import { WriteGuard } from '@/components/refine/write-guard'

export default function CustomerCreatePage() {
  return (
    <WriteGuard resource={CUSTOMERS} action="create" backHref="/customers">
      <CustomerCreateForm />
    </WriteGuard>
  )
}

/** The data provider stamps the selected business_id on insert. */
function CustomerCreateForm() {
  const { formProps, saveButtonProps } = useForm<CustomerRow, HttpError, CreateCustomerInput>({
    resource: CUSTOMERS,
    action: 'create',
    redirect: 'list',
    ...customerNotifications('create'),
  })

  return (
    <Create title="Create New Customer" saveButtonProps={{ ...saveButtonProps, children: 'Create Customer' }}>
      <Form {...formProps} layout="vertical" style={{ maxWidth: 560 }}>
        <CustomerFormFields />
      </Form>
    </Create>
  )
}
