'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Edit, useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form, Result } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import { CustomerFormFields, customerNotifications, deleteNotifications } from '@/components/customers/customer-form-fields'
import { CUSTOMERS, type CustomerRow } from '@/components/customers/types'
import type { CreateCustomerInput } from '@/lib/validators'
import { WriteGuard } from '@/components/refine/write-guard'
import { EnterToSubmit, FormSection, PageSkeleton, transparentContent, withSubtitle } from '@/components/refine/page-parts'

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
  const { formProps, saveButtonProps, query } = useForm<CustomerRow, HttpError, CreateCustomerInput>({
    resource: CUSTOMERS,
    action: 'edit',
    id,
    redirect: 'show',
    ...customerNotifications('edit'),
  })
  const loading = !!query?.isLoading
  const record = query?.data?.data
  const form = formProps.form

  // The form is hidden while loading, so autoFocus cannot apply; focus once filled.
  useEffect(() => {
    if (!loading && record) form?.getFieldInstance('name')?.focus?.()
  }, [loading, record, form])

  return (
    <Edit
      title="Edit Customer"
      headerProps={withSubtitle(record?.name ?? 'Update the customer information below.')}
      contentProps={transparentContent}
      recordItemId={id}
      saveButtonProps={{ ...saveButtonProps, children: 'Update Customer', disabled: loading || query?.isError }}
      deleteButtonProps={{
        confirmTitle: 'Delete Customer',
        confirmOkText: 'Delete',
        ...deleteNotifications,
      }}
    >
      {loading && <PageSkeleton sections={1} />}
      {query?.isError && (
        <Result
          status={query.error?.statusCode === 404 ? '404' : 'warning'}
          title={query.error?.statusCode === 404 ? 'Customer not found in this business.' : "Couldn't load customer"}
          subTitle={query.error?.statusCode === 404 ? undefined : query.error?.message}
        />
      )}
      {/* The form stays mounted while loading so Refine can fill it. */}
      <div hidden={loading || query?.isError}>
        <Form {...formProps} layout="vertical">
          <FormSection icon={<UserOutlined />} title="Customer details">
            <div style={{ maxWidth: 560 }}>
              <CustomerFormFields />
            </div>
          </FormSection>
          <EnterToSubmit />
        </Form>
      </div>
    </Edit>
  )
}
