'use client'

import { useSearchParams } from 'next/navigation'
import { Create, useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form } from 'antd'
import { WriteGuard } from '@/components/refine/write-guard'
import { EnterToSubmit, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { MeasurementFormFields, measurementNotifications } from '@/components/measurements/measurement-form-fields'
import { DEFAULT_MEASUREMENT_NAME, MEASUREMENTS, type MeasurementRow } from '@/components/measurements/types'
import type { MeasurementFormData } from '@/types/measurements'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** /measurements/create[?customer_id=<uuid>] */
export default function MeasurementCreatePage() {
  const customerId = useSearchParams().get('customer_id')
  const preset = customerId && UUID.test(customerId) ? customerId : undefined
  return (
    <WriteGuard resource={MEASUREMENTS} action="create" backHref={preset ? `/customers/show/${preset}` : '/measurements'}>
      <MeasurementCreateForm customerId={preset} />
    </WriteGuard>
  )
}

/** The data provider stamps the selected business and keeps one default per customer. */
function MeasurementCreateForm({ customerId }: { customerId?: string }) {
  const { formProps, saveButtonProps } = useForm<MeasurementRow, HttpError, MeasurementFormData>({
    resource: MEASUREMENTS,
    action: 'create',
    redirect: 'show',
    ...measurementNotifications('create'),
  })

  return (
    <Create
      title="New Measurement"
      headerProps={withSubtitle('Record a customer’s body measurements for accurate tailoring.')}
      contentProps={transparentContent}
      saveButtonProps={{ ...saveButtonProps, children: 'Create Measurement' }}
    >
      <Form
        {...formProps}
        layout="vertical"
        initialValues={{ name: DEFAULT_MEASUREMENT_NAME, is_default: false, customer_id: customerId }}
      >
        <MeasurementFormFields form={formProps.form} mode="create" />
        <EnterToSubmit />
      </Form>
    </Create>
  )
}
