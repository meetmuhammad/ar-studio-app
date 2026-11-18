'use client'

import { useParams } from 'next/navigation'
import { Edit, useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import { Form, Result } from 'antd'
import { WriteGuard } from '@/components/refine/write-guard'
import { EnterToSubmit, PageSkeleton, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import {
  MeasurementFormFields,
  measurementDeleteNotifications,
  measurementNotifications,
} from '@/components/measurements/measurement-form-fields'
import { MEASUREMENTS, MEASUREMENT_SELECT, type MeasurementRow } from '@/components/measurements/types'
import type { MeasurementFormData } from '@/types/measurements'

export default function MeasurementEditPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <WriteGuard resource={MEASUREMENTS} action="edit" id={id} backHref={`/measurements/show/${id}`}>
      <MeasurementEditForm id={id} />
    </WriteGuard>
  )
}

/** Updates match id AND the selected business (data provider). */
function MeasurementEditForm({ id }: { id: string }) {
  const { formProps, saveButtonProps, query } = useForm<MeasurementRow, HttpError, MeasurementFormData>({
    resource: MEASUREMENTS,
    action: 'edit',
    id,
    redirect: 'show',
    meta: { select: MEASUREMENT_SELECT },
    ...measurementNotifications('edit'),
  })
  const loading = !!query?.isLoading
  const record = query?.data?.data
  const notFound = query?.error?.statusCode === 404

  return (
    <Edit
      title="Edit Measurement"
      headerProps={withSubtitle(record ? `${record.name}${record.customer ? ` · ${record.customer.name}` : ''}` : undefined)}
      contentProps={transparentContent}
      recordItemId={id}
      saveButtonProps={{ ...saveButtonProps, children: 'Update Measurement', disabled: loading || query?.isError }}
      deleteButtonProps={{
        confirmTitle: 'Delete this measurement? This cannot be undone and may affect related orders.',
        confirmOkText: 'Delete',
        ...measurementDeleteNotifications,
      }}
    >
      {loading && <PageSkeleton sections={3} />}
      {query?.isError && (
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Measurement not found in this business.' : "Couldn't load measurement"}
          subTitle={notFound ? undefined : query.error?.message}
        />
      )}
      {/* Stays mounted while loading so Refine can fill it. */}
      <div hidden={loading || query?.isError}>
        <Form {...formProps} layout="vertical">
          {!loading && <MeasurementFormFields form={formProps.form} mode="edit" />}
          <EnterToSubmit />
        </Form>
      </div>
    </Edit>
  )
}
