'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Show } from '@refinedev/antd'
import { useCan, useDelete, useList, useOne, useShow, type HttpError } from '@refinedev/core'
import {
  Button,
  Col,
  Descriptions,
  Empty,
  List as AntdList,
  Popconfirm,
  Result,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import {
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined,
  PrinterOutlined,
  ShoppingOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { openMeasurementPrintPreview, openPrintPreview } from '@/lib/print-utils'
import { deleteNotificationsFor, errorMessage } from '@/lib/refine/notifications'
import { FormSection, PageSkeleton, Sections, transparentContent, withSubtitle } from '@/components/refine/page-parts'
import { PaymentModal } from '@/components/orders/payment-modal'
import {
  ORDERS,
  ORDER_SHOW_SELECT,
  PAYMENTS,
  STATUS_COLOR,
  PAYMENT_STATUS_COLOR,
  orderTypeLabel,
  paymentMethodLabel,
  paymentSummary,
  pkr,
  type OrderRow,
  type PaymentRow,
} from '@/components/orders/constants'
import { MEASUREMENTS, type MeasurementRow } from '@/components/measurements/types'

const day = (value?: string | null) => (value ? dayjs(value).format('MMM D, YYYY') : '—')

export default function OrderShowPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = theme.useToken()
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; payment?: PaymentRow | null }>({ open: false })

  const { query } = useShow<OrderRow, HttpError>({ resource: ORDERS, id, meta: { select: ORDER_SHOW_SELECT } })
  const order = query.data?.data
  const notFound = query.error?.statusCode === 404

  const { result: paymentsResult, query: paymentsQuery } = useList<PaymentRow, HttpError>({
    resource: PAYMENTS,
    filters: [{ field: 'order_id', operator: 'eq', value: id }],
    sorters: [{ field: 'payment_date', order: 'desc' }],
    pagination: { mode: 'off' },
  })
  const payments = paymentsResult.data ?? []

  const { result: measurement } = useOne<MeasurementRow, HttpError>({
    resource: MEASUREMENTS,
    id: order?.measurement_id ?? undefined,
    meta: { select: '*, customer:customers(id, name, phone)' },
    queryOptions: { enabled: !!order?.measurement_id },
  })

  const { data: canRecord } = useCan({ resource: PAYMENTS, action: 'create' })
  const { data: canEditPayment } = useCan({ resource: PAYMENTS, action: 'edit' })
  const { data: canDeletePayment } = useCan({ resource: PAYMENTS, action: 'delete' })
  const { mutate: removePayment } = useDelete<PaymentRow, HttpError>()

  if (query.isError) {
    return (
      <Show title="Order" headerButtons={() => null} contentProps={transparentContent}>
        <Result
          status={notFound ? '404' : 'warning'}
          title={notFound ? 'Order not found in this business.' : "Couldn't load order"}
          subTitle={notFound ? undefined : query.error?.message}
          extra={
            <Link href="/orders">
              <Button>Back to orders</Button>
            </Link>
          }
        />
      </Show>
    )
  }

  const summary = order ? paymentSummary(order, payments) : null
  const denied = (d?: { can: boolean; reason?: string }) => (d?.can === false ? d.reason : undefined)

  const printButtons = order && (
    <>
      <Button icon={<PrinterOutlined />} onClick={() => openPrintPreview({ order, payments: payments.map(toPrintPayment) })}>
        Print Receipt
      </Button>
      {measurement && (
        <Button icon={<FileTextOutlined />} onClick={() => openMeasurementPrintPreview({ order, measurement })}>
          Print Measurement
        </Button>
      )}
    </>
  )

  return (
    <Show
      title={order ? `Order ${order.order_number}` : 'Order'}
      headerProps={withSubtitle(order?.customers?.name)}
      recordItemId={id}
      contentProps={transparentContent}
      headerButtons={({ defaultButtons }) => (
        <Space wrap>
          {printButtons}
          {defaultButtons}
        </Space>
      )}
      deleteButtonProps={{
        confirmTitle: 'Delete this order? Its items, payments and their ledger entries are removed too.',
        confirmOkText: 'Delete',
        ...deleteNotificationsFor('Order'),
      }}
    >
      {query.isLoading || !order || !summary ? (
        <PageSkeleton sections={3} />
      ) : (
        <Sections>
          <Row gutter={[16, 16]}>
            <Col xs={12} md={6}>
              <FormSection title="Total">
                <Statistic value={pkr(summary.total)} />
              </FormSection>
            </Col>
            <Col xs={12} md={6}>
              <FormSection title="Paid">
                <Statistic value={pkr(summary.paid)} valueStyle={{ color: token.colorSuccess }} />
              </FormSection>
            </Col>
            <Col xs={12} md={6}>
              <FormSection title="Balance">
                <Statistic value={pkr(summary.balance)} valueStyle={{ color: summary.balance > 0 ? token.colorWarning : token.colorSuccess }} />
              </FormSection>
            </Col>
            <Col xs={12} md={6}>
              <FormSection title="Payment">
                <Statistic
                  value={summary.status}
                  valueRender={() => (
                    <Tag color={PAYMENT_STATUS_COLOR[summary.status]} style={{ fontSize: 16, padding: '4px 10px' }}>
                      {summary.status}
                    </Tag>
                  )}
                />
              </FormSection>
            </Col>
          </Row>

          <FormSection icon={<ShoppingOutlined />} title="Order Details">
            <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} colon={false} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLOR[order.status]}>{order.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Booking Date">{day(order.booking_date)}</Descriptions.Item>
              <Descriptions.Item label="Delivery Date">{day(order.delivery_date)}</Descriptions.Item>
              <Descriptions.Item label="Customer">
                <Link href={`/customers/show/${order.customer_id}`}>{order.customers?.name}</Link>
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                <Typography.Text copyable style={{ fontFamily: 'var(--font-geist-mono), monospace' }}>
                  {order.customers?.phone}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Measurements">
                {order.measurement_id ? (
                  <Link href={`/measurements/show/${order.measurement_id}`}>{measurement?.name ?? 'View'}</Link>
                ) : (
                  'None linked'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Advance">
                {pkr(summary.advance)} {order.payment_method ? `(${paymentMethodLabel(order.payment_method)})` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="Fitting Preferences" span={2}>
                {order.fitting_preferences || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Comments" span={3}>
                <Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{order.comments || '—'}</Typography.Text>
              </Descriptions.Item>
            </Descriptions>
          </FormSection>

          <FormSection icon={<UnorderedListOutlined />} title={`Order Items (${order.order_items?.length ?? 0})`}>
            <AntdList
              dataSource={order.order_items ?? []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items." /> }}
              renderItem={(item) => (
                <AntdList.Item>
                  <AntdList.Item.Meta
                    title={<Tag color="blue">{orderTypeLabel(item.order_type)}</Tag>}
                    description={<Typography.Text style={{ whiteSpace: 'pre-wrap' }}>{item.description}</Typography.Text>}
                  />
                </AntdList.Item>
              )}
            />
          </FormSection>

          <FormSection
            icon={<DollarOutlined />}
            title={`Payments (${payments.length})`}
            extra={
              <Tooltip title={denied(canRecord)}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  disabled={canRecord?.can === false}
                  onClick={() => setPaymentModal({ open: true, payment: null })}
                >
                  Record Payment
                </Button>
              </Tooltip>
            }
          >
            <Table<PaymentRow>
              rowKey="id"
              size="middle"
              loading={paymentsQuery.isLoading}
              dataSource={payments}
              pagination={false}
              scroll={{ x: 640 }}
              style={{ marginBottom: 16 }}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={summary.advance > 0 ? 'No payments besides the advance.' : 'No payments yet.'}
                  />
                ),
              }}
              summary={() =>
                payments.length ? (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={2}>
                      <Typography.Text strong>Payments total</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>
                      <Typography.Text strong>{pkr(summary.payments)}</Typography.Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} colSpan={2} />
                  </Table.Summary.Row>
                ) : null
              }
              columns={[
                { key: 'date', title: 'Date', width: 130, render: (_, p) => day(p.payment_date) },
                { key: 'method', title: 'Method', width: 140, render: (_, p) => paymentMethodLabel(p.payment_method) },
                { key: 'amount', title: 'Amount', width: 150, render: (_, p) => <Typography.Text strong>{pkr(p.amount)}</Typography.Text> },
                { key: 'notes', title: 'Notes', ellipsis: true, render: (_, p) => p.notes || '—' },
                {
                  key: 'actions',
                  title: 'Actions',
                  width: 110,
                  fixed: 'right',
                  render: (_, p) => (
                    <Space size={4}>
                      <Tooltip title={denied(canEditPayment) ?? 'Edit payment'}>
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          aria-label={`Edit payment of ${pkr(p.amount)} on ${day(p.payment_date)}`}
                          disabled={canEditPayment?.can === false}
                          onClick={() => setPaymentModal({ open: true, payment: p })}
                        />
                      </Tooltip>
                      <Tooltip title={denied(canDeletePayment) ?? 'Delete payment'}>
                        <span>
                          <Popconfirm
                            title="Delete this payment?"
                            description="Its ledger entry is removed too."
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                            disabled={canDeletePayment?.can === false}
                            onConfirm={() =>
                              removePayment({
                                resource: PAYMENTS,
                                id: p.id,
                                successNotification: { message: 'Payment deleted successfully!', type: 'success' },
                                errorNotification: (e) => ({ message: errorMessage(e, 'Failed to delete payment'), type: 'error' }),
                              })
                            }
                          >
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              aria-label={`Delete payment of ${pkr(p.amount)} on ${day(p.payment_date)}`}
                              disabled={canDeletePayment?.can === false}
                            />
                          </Popconfirm>
                        </span>
                      </Tooltip>
                    </Space>
                  ),
                },
              ]}
            />
          </FormSection>
        </Sections>
      )}

      <PaymentModal
        open={paymentModal.open}
        orderId={id}
        payment={paymentModal.payment}
        onClose={() => setPaymentModal({ open: false })}
      />
    </Show>
  )
}

/** The receipt's payment shape (notes optional, not null). */
const toPrintPayment = (p: PaymentRow) => ({ ...p, notes: p.notes ?? undefined })
