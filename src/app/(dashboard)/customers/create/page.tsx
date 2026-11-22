'use client'

import { Create, useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { CustomerFormFields, customerNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, type CustomerRow } from '@/components/customers/types'
import type { CreateCustomerInput } from '@/lib/validators'
import { WriteGuard } from '@/components/refine/write-guard'
import { EnterToSubmit, FormSection, transparentContent, withSubtitle } from '@/components/refine/page-parts'

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
    redirect: 'show',
    ...customerNotifications('create'),
  })

  return (
    <Create
      title="Create New Customer"
      headerProps={withSubtitle('Add a new customer to your database.')}
      contentProps={transparentContent}
      saveButtonProps={{ ...saveButtonProps, children: 'Create Customer' }}
    >
      <Form {...formProps} layout="vertical">
        <FormSection icon={<UserOutlined />} title="Customer details">
          <div style={{ maxWidth: 560 }}>
            <CustomerFormFields />
          </div>
        </FormSection>
        <EnterToSubmit />
      </Form>
    </Create>
  )
}
