'use client'

import { useParams } from 'next/navigation'
import { Edit } from '@refinedev/antd'
import { Form, Result } from 'antd'
import { ResourceGuard } from '@/components/refine/resource-guard'
import { WriteGuard } from '@/components/refine/write-guard'
import { PageSkeleton, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { deleteNotificationsFor } from '@/lib/refine/notifications'
import { VendorFormFields, useVendorForm } from '@/components/vendors/vendor-form'
import { VENDORS } from '@/components/vendors/constants'

export default function VendorEditPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <ResourceGuard resource={VENDORS}>
      <WriteGuard resource={VENDORS} action="edit" id={id} backHref={`/vendors/show/${id}`}>
        <VendorEditForm id={id} />
      </WriteGuard>
    </ResourceGuard>
  )
}

/** Updates match id AND the selected business (data provider). */
function VendorEditForm({ id }: { id: string }) {
  const { formProps, saveButtonProps, onFinish, query, record } = useVendorForm('edit', id)
  const loading = !!query?.isLoading
  const notFound = query?.error?.statusCode === 404

  return (
    <Edit
      title="Edit Vendor"
      headerProps={withSubtitle(record?.name)}
      contentProps={transparentContent}
      recordItemId={id}
      saveButtonProps={{ ...saveButtonProps, children: 'Update Vendor', disabled: loading || query?.isError }}
      deleteButtonProps={{
        confirmTitle: 'Delete this vendor? This cannot be undone.',
        confirmOkText: 'Delete',
        ...deleteNotificationsFor('Vendor'),
      }}
    >
      {loading && <PageSkeleton sections={3} />}
      {query?.isError && (
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Vendor not found in this business.' : "Couldn't load vendor"}
          subTitle={notFound ? undefined : query.error?.message}
        />
      )}
      {/* Stays mounted while loading so Refine can fill it. */}
      <div hidden={loading || query?.isError}>
        <Form {...formProps} onFinish={onFinish} layout="vertical">
          {!loading && <VendorFormFields />}
        </Form>
      </div>
    </Edit>
  )
}
