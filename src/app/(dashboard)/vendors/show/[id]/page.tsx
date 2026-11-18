'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Show } from '@refinedev/antd'
import { useShow, type HttpError } from '@refinedev/core'
import { Button, Descriptions, Result, Tag, Typography } from 'antd'
import { ShopOutlined, TagsOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useBusiness } from '@/contexts/business-context'
import { ResourceGuard } from '@/components/refine/resource-guard'
import { FormSection, PageSkeleton, Sections, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { deleteNotificationsFor } from '@/lib/refine/notifications'
import { VENDORS, VENDOR_SELECT, type VendorRow } from '@/components/vendors/constants'
import { VendorTagsEditor } from '@/components/vendors/vendor-tags-editor'
import { VendorLedgerCard } from '@/components/vendors/vendor-ledger-card'

export default function VendorShowPage() {
  return (
    <ResourceGuard resource={VENDORS} action="show">
      <VendorShow />
    </ResourceGuard>
  )
}

function VendorShow() {
  const { id } = useParams<{ id: string }>()
  const { businesses } = useBusiness()
  const { query } = useShow<VendorRow, HttpError>({ resource: VENDORS, id, meta: { select: VENDOR_SELECT } })
  const vendor = query.data?.data
  const notFound = query.error?.statusCode === 404

  if (query.isError) {
    return (
      <Show title="Vendor" headerButtons={() => null} contentProps={transparentContent}>
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Vendor not found in this business.' : "Couldn't load vendor"}
          subTitle={notFound ? undefined : query.error?.message}
          extra={
            <Link href="/vendors">
              <Button>Back to Vendors</Button>
            </Link>
          }
        />
      </Show>
    )
  }

  const category = vendor?.vendor_categories
  const businessName = businesses.find((b) => b.id === vendor?.business_id)?.name

  return (
    <Show
      title={vendor?.name ?? 'Vendor'}
      headerProps={withSubtitle(businessName ? `${businessName} · Vendor Ledger` : undefined)}
      recordItemId={id}
      contentProps={transparentContent}
      deleteButtonProps={{
        confirmTitle: 'Delete this vendor? This cannot be undone.',
        confirmOkText: 'Delete',
        ...deleteNotificationsFor('Vendor'),
      }}
    >
      {query.isLoading || !vendor ? (
        <PageSkeleton sections={3} />
      ) : (
        <Sections>
          <FormSection icon={<ShopOutlined />} title="Details">
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} colon={false} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Category">
                {category ? (
                  <Tag>
                    {category.name}
                    {category.archived_at ? ' (archived)' : ''}
                  </Tag>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Contact Person">{vendor.contact_person || '—'}</Descriptions.Item>
              <Descriptions.Item label="Phone">
                {vendor.phone ? (
                  <Typography.Text copyable style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                    {vendor.phone}
                  </Typography.Text>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Email">{vendor.email || '—'}</Descriptions.Item>
              <Descriptions.Item label="Address">{vendor.address || '—'}</Descriptions.Item>
              <Descriptions.Item label="Added">{dayjs(vendor.created_at).format('MMM D, YYYY')}</Descriptions.Item>
              <Descriptions.Item label="Description" span={3}>
                <Typography.Text type={vendor.notes ? undefined : 'secondary'} style={{ whiteSpace: 'pre-wrap' }}>
                  {vendor.notes || 'No description.'}
                </Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </FormSection>

          <FormSection icon={<TagsOutlined />} title="Tags">
            <div style={{ paddingBottom: 16 }}>
              <VendorTagsEditor vendorId={vendor.id} tags={vendor.vendor_tags ?? []} />
            </div>
          </FormSection>

          <VendorLedgerCard vendorId={vendor.id} vendorName={vendor.name} />
        </Sections>
      )}
    </Show>
  )
}
