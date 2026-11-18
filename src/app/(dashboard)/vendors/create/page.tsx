'use client'

import { Create } from '@refinedev/antd'
import { Form } from 'antd'
import { ResourceGuard } from '@/components/refine/resource-guard'
import { WriteGuard } from '@/components/refine/write-guard'
import { transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { NEW_VENDOR_DEFAULTS, VendorFormFields, useVendorForm } from '@/components/vendors/vendor-form'
import { VENDORS } from '@/components/vendors/constants'

export default function VendorCreatePage() {
  return (
    <ResourceGuard resource={VENDORS}>
      <WriteGuard resource={VENDORS} action="create" backHref="/vendors">
        <VendorCreateForm />
      </WriteGuard>
    </ResourceGuard>
  )
}

function VendorCreateForm() {
  const { formProps, saveButtonProps, onFinish } = useVendorForm('create')
  return (
    <Create
      title="Add Vendor"
      headerProps={withSubtitle('Add a supplier to this business.')}
      contentProps={transparentContent}
      saveButtonProps={{ ...saveButtonProps, children: 'Create Vendor' }}
    >
      <Form {...formProps} onFinish={onFinish} layout="vertical" initialValues={NEW_VENDOR_DEFAULTS}>
        <VendorFormFields />
      </Form>
    </Create>
  )
}
