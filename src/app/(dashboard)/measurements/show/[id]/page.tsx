'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Show } from '@refinedev/antd'
import { useShow, type HttpError } from '@refinedev/core'
import { Button, Col, Descriptions, Result, Row, Tag, Typography } from 'antd'
import { ColumnHeightOutlined, FileTextOutlined, PrinterOutlined, StarFilled, UserOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { openMeasurementPrintPreview } from '@/lib/print-utils'
import { FormSection, PageSkeleton, Sections, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { measurementDeleteNotifications } from '@/components/measurements/measurement-form-fields'
import {
  MEASUREMENTS,
  MEASUREMENT_CATEGORIES,
  MEASUREMENT_SELECT,
  fieldsIn,
  formatReading,
  type MeasurementRow,
} from '@/components/measurements/types'

export default function MeasurementShowPage() {
  const { id } = useParams<{ id: string }>()
  const { query } = useShow<MeasurementRow, HttpError>({ resource: MEASUREMENTS, id, meta: { select: MEASUREMENT_SELECT } })
  const record = query.data?.data
  const notFound = query.error?.statusCode === 404

  if (query.isError) {
    return (
      <Show title="Measurement" headerButtons={() => null} contentProps={transparentContent}>
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Measurement not found in this business.' : "Couldn't load measurement"}
          subTitle={notFound ? undefined : query.error?.message}
          extra={
            <Link href="/measurements">
              <Button>Back to measurements</Button>
            </Link>
          }
        />
      </Show>
    )
  }

  const print = (
    <Button
      icon={<PrinterOutlined />}
      disabled={!record}
      onClick={() => record && openMeasurementPrintPreview({ measurement: record })}
    >
      Print
    </Button>
  )

  return (
    <Show
      title={record?.name ?? 'Measurement'}
      headerProps={withSubtitle(
        record?.is_default ? (
          <Tag icon={<StarFilled />} color="gold">
            Default
          </Tag>
        ) : undefined
      )}
      recordItemId={id}
      contentProps={transparentContent}
      headerButtons={({ defaultButtons }) => (
        <>
          {print}
          {defaultButtons}
        </>
      )}
      deleteButtonProps={{
        confirmTitle: 'Delete this measurement? This cannot be undone and may affect related orders.',
        confirmOkText: 'Delete',
        ...measurementDeleteNotifications,
      }}
    >
      {query.isLoading || !record ? (
        <PageSkeleton sections={3} />
      ) : (
        <Sections>
          <FormSection icon={<UserOutlined />} title="Customer & set">
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} colon={false} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Customer">
                {record.customer ? (
                  <Link href={`/customers/show/${record.customer.id}`}>{record.customer.name}</Link>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                <Typography.Text style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                  {record.customer?.phone ?? '—'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Created">{dayjs(record.created_at).format('MMM D, YYYY')}</Descriptions.Item>
            </Descriptions>
          </FormSection>

          <Row gutter={[16, 16]}>
            {MEASUREMENT_CATEGORIES.map((category) => (
              <Col key={category} xs={24} lg={12}>
                <FormSection icon={<ColumnHeightOutlined />} title={category}>
                  <Descriptions
                    column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
                    size="small"
                    bordered
                    style={{ marginBottom: 16 }}
                  >
                    {fieldsIn(category).map((field) => (
                      <Descriptions.Item key={field.key} label={field.label}>
                        <Typography.Text style={{ fontFamily: 'var(--font-geist-mono), monospace', whiteSpace: 'nowrap' }}>
                          {formatReading(record, field.key)}
                        </Typography.Text>
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </FormSection>
              </Col>
            ))}
          </Row>

          <FormSection icon={<FileTextOutlined />} title="Notes">
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }} type={record.notes ? undefined : 'secondary'}>
              {record.notes || 'No notes.'}
            </Typography.Paragraph>
          </FormSection>
        </Sections>
      )}
    </Show>
  )
}
