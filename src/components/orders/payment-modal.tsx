'use client'

import { useEffect, useMemo } from 'react'
import { useSelect } from '@refinedev/antd'
import { useCreate, useList, useOne, useUpdate, type HttpError } from '@refinedev/core'
import { Alert, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Radio, Select, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { errorMessage } from '@/lib/refine/notifications'
import { joinSearchText } from '@/lib/refine/select-search'
import { useSearchSelect } from '@/components/refine/use-search-select'
import { ORDERS, PAYMENTS, PAYMENT_METHODS, paymentSummary, pkr, type OrderRow, type PaymentRow } from './constants'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  /** Fixed order (order page). Without it the modal asks for one (header "Add New Payment"). */
  orderId?: string
  /** Edit this payment instead of recording a new one. */
  payment?: PaymentRow | null
  onSaved?: () => void
}

interface PaymentFormValues {
  order_id?: string
  amount?: number
  payment_method?: string
  payment_date?: Dayjs
  notes?: string
}

/**
 * Record or edit a payment (admin only; RLS and the functions enforce it).
 * Mirrors the previous payment dialog and CreatePaymentSchema: amount > 0,
 * method cash / bank / other (default other), date today or earlier, notes
 * up to 500 characters. Saved through record_payment / update_payment, which
 * write the payment and its ledger row together. Shows the order's paid and
 * balance (advance + payments, as before).
 *
 * Accessible names: "Order" (picker), "Amount", "Payment Method",
 * "Payment Date", "Notes"; buttons "Add Payment" / "Update Payment", "Cancel".
 */
const orderSearchText = (o: OrderRow) => joinSearchText(o.customers?.phone)

export function PaymentModal({ open, onClose, orderId, payment, onSaved }: PaymentModalProps) {
  const [form] = Form.useForm<PaymentFormValues>()
  const editing = !!payment
  const chosenOrder = Form.useWatch('order_id', form) ?? orderId ?? payment?.order_id

  const orderSelect = useSearchSelect(
    useSelect<OrderRow, HttpError>({
      resource: ORDERS,
      optionLabel: (o) => `${o.order_number} · ${o.customers?.name ?? ''}`,
      optionValue: 'id',
      onSearch: (term) => [{ field: 'q', operator: 'contains', value: term }],
      sorters: [{ field: 'created_at', order: 'desc' }],
      pagination: { pageSize: 20 },
      meta: { select: 'id, order_number, created_at, customers(name, phone)' },
      queryOptions: { enabled: open && !orderId && !editing },
    }),
    // The server search also matches the customer's phone, which the label does not show.
    { searchText: orderSearchText, open },
  )

  const { result: order } = useOne<OrderRow, HttpError>({
    resource: ORDERS,
    id: chosenOrder,
    meta: { select: 'id, order_number, customer_id, total_amount, advance_paid, customers(name)' },
    queryOptions: { enabled: open && !!chosenOrder },
  })
  const { result: payments } = useList<PaymentRow, HttpError>({
    resource: PAYMENTS,
    filters: [{ field: 'order_id', operator: 'eq', value: chosenOrder }],
    pagination: { mode: 'off' },
    meta: { select: 'id, amount' },
    queryOptions: { enabled: open && !!chosenOrder },
  })

  const summary = useMemo(() => {
    if (!order) return null
    // When editing, the payment's own amount is replaced by the new one.
    const others = (payments.data ?? []).filter((p) => p.id !== payment?.id)
    return paymentSummary(order, others)
  }, [order, payments.data, payment?.id])

  const { mutateAsync: create, mutation: createState } = useCreate<PaymentRow, HttpError>()
  const { mutateAsync: update, mutation: updateState } = useUpdate<PaymentRow, HttpError>()
  const saving = createState.isPending || updateState.isPending

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue(
      payment
        ? {
            order_id: payment.order_id,
            amount: payment.amount,
            payment_method: payment.payment_method,
            payment_date: dayjs(payment.payment_date),
            notes: payment.notes ?? '',
          }
        : { order_id: orderId, payment_method: 'other', payment_date: dayjs(), notes: '' }
    )
  }, [open, payment, orderId, form])

  const save = async () => {
    const values = await form.validateFields()
    const body = {
      amount: values.amount,
      payment_method: values.payment_method ?? 'other',
      payment_date: values.payment_date?.format('YYYY-MM-DD'),
      notes: values.notes ?? '',
    }
    try {
      if (payment) {
        await update({
          resource: PAYMENTS,
          id: payment.id,
          values: body,
          successNotification: { message: 'Payment updated successfully!', type: 'success' },
          errorNotification: (e) => ({ message: errorMessage(e, 'Failed to update payment'), type: 'error' }),
        })
      } else {
        await create({
          resource: PAYMENTS,
          values: { ...body, order_id: values.order_id ?? orderId, customer_id: order?.customer_id },
          successNotification: { message: 'Payment added successfully!', type: 'success' },
          errorNotification: (e) => ({ message: errorMessage(e, 'Failed to save payment'), type: 'error' }),
        })
      }
      onSaved?.()
      onClose()
    } catch {
      // The notification explains the failure; the modal stays open.
    }
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={editing ? 'Edit Payment' : 'Add New Payment'}
      okText={editing ? 'Update Payment' : 'Add Payment'}
      cancelText="Cancel"
      onOk={() => void save()}
      confirmLoading={saving}
      destroyOnClose
      width={560}
    >
      <Form form={form} layout="vertical" onFinish={() => void save()} preserve={false}>
        {!orderId && !editing && (
          <Form.Item label="Order" name="order_id" rules={[{ required: true, message: 'Please select an order' }]}>
            <Select
              {...orderSelect}
              placeholder="Search by order number, customer name or phone"
              aria-label="Order"
              autoFocus
            />
          </Form.Item>
        )}

        {order && summary && (
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Order" span={2}>
              {order.order_number} · {order.customers?.name}
            </Descriptions.Item>
            <Descriptions.Item label="Total">{pkr(summary.total)}</Descriptions.Item>
            <Descriptions.Item label="Paid">{pkr(summary.paid)}</Descriptions.Item>
            <Descriptions.Item label="Balance" span={2}>
              <Typography.Text type={summary.balance > 0 ? 'warning' : 'success'} strong>
                {pkr(summary.balance)}
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        )}

        <Form.Item
          label="Amount"
          name="amount"
          rules={[
            { required: true, message: 'Amount must be positive' },
            { type: 'number', min: 0.01, message: 'Amount must be positive' },
          ]}
        >
          <InputNumber min={0} step={100} addonAfter="PKR" style={{ width: '100%' }} autoFocus={!!orderId || editing} />
        </Form.Item>

        <Form.Item label="Payment Method" name="payment_method">
          <Radio.Group optionType="button" buttonStyle="solid" options={PAYMENT_METHODS.map((m) => ({ ...m }))} aria-label="Payment Method" />
        </Form.Item>

        <Form.Item
          label="Payment Date"
          name="payment_date"
          rules={[
            { required: true, message: 'Payment date is required' },
            {
              validator: async (_, value?: Dayjs) => {
                if (value && value.isAfter(dayjs(), 'day')) throw new Error('Payment date cannot be in the future')
              },
            },
          ]}
        >
          <DatePicker style={{ width: '100%' }} format="MMM D, YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} allowClear={false} />
        </Form.Item>

        <Form.Item label="Notes" name="notes" rules={[{ max: 500, message: 'Notes too long' }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Optional" />
        </Form.Item>

        {summary && summary.balance <= 0 && !editing && (
          <Alert type="info" showIcon message="This order is already fully paid." style={{ marginBottom: 8 }} />
        )}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </Form>
    </Modal>
  )
}
