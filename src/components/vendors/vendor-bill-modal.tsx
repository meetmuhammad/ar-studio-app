'use client'

import { useEffect } from 'react'
import { useCreate, useUpdate, type HttpError } from '@refinedev/core'
import { DatePicker, Form, Input, InputNumber, Modal, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { errorMessage } from '@/lib/refine/notifications'
import { VENDOR_BILLS } from '@/components/ledger/constants'
import type { VendorLedgerRow } from '@/lib/refine/reporting'

interface FormValues {
  entry_date?: Dayjs
  particulars?: string
  amount?: number
  notes?: string
}

interface VendorBillModalProps {
  open: boolean
  onClose: () => void
  vendor: { id: string; name: string }
  /** Edit this bill (a bill-only row); otherwise a new bill. */
  bill?: VendorLedgerRow | null
  onSaved?: () => void
}

/**
 * Add or edit a vendor bill: a row in the vendor's ledger only (no general
 * ledger entry), billed = credit, as the previous bill form and POST
 * /api/vendor-ledger. Saved through record_vendor_bill / update_vendor_bill.
 *
 * Accessible names: "Date", "Particulars", "Amount", "Notes"; buttons
 * "Add Bill" / "Update Bill", "Cancel".
 */
export function VendorBillModal({ open, onClose, vendor, bill, onSaved }: VendorBillModalProps) {
  const [form] = Form.useForm<FormValues>()
  const { mutateAsync: create, mutation: createState } = useCreate<VendorLedgerRow, HttpError>()
  const { mutateAsync: update, mutation: updateState } = useUpdate<VendorLedgerRow, HttpError>()
  const editing = !!bill

  useEffect(() => {
    if (!open) return
    form.resetFields()
    form.setFieldsValue(
      bill
        ? {
            entry_date: dayjs(bill.entry_date),
            particulars: bill.particulars,
            amount: Number(bill.credit || bill.debit || 0) || undefined,
            notes: bill.notes ?? '',
          }
        : { entry_date: dayjs(), particulars: '', notes: '' }
    )
  }, [open, bill, form])

  const save = async () => {
    const v = await form.validateFields()
    // A bill is a credit; an old debit-side row keeps its side when edited.
    const side = bill?.debit ? 'debit' : 'credit'
    const values = {
      vendor_id: vendor.id,
      entry_date: v.entry_date?.format('YYYY-MM-DD'),
      particulars: v.particulars ?? '',
      debit: side === 'debit' ? v.amount : null,
      credit: side === 'credit' ? v.amount : null,
      notes: v.notes ?? '',
    }
    try {
      if (bill) {
        await update({
          resource: VENDOR_BILLS,
          id: bill.id,
          values,
          successNotification: { message: 'Bill updated successfully', type: 'success' },
          errorNotification: (e) => ({ message: errorMessage(e, 'Failed to update bill'), type: 'error' }),
        })
      } else {
        await create({
          resource: VENDOR_BILLS,
          values,
          successNotification: { message: 'Bill created successfully', type: 'success' },
          errorNotification: (e) => ({ message: errorMessage(e, 'Failed to create bill'), type: 'error' }),
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
      title={editing ? 'Edit bill' : `Add bill from ${vendor.name}`}
      okText={editing ? 'Update Bill' : 'Add Bill'}
      cancelText="Cancel"
      onOk={() => void save()}
      confirmLoading={createState.isPending || updateState.isPending}
      destroyOnClose
      width={520}
    >
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        A bill is what the vendor charged you. It is added to the amount you owe them and does not appear in the general ledger
        until you record a payment.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={() => void save()} requiredMark="optional">
        <Form.Item name="entry_date" label="Date" rules={[{ required: true, message: 'Date is required' }]}>
          <DatePicker aria-label="Date" format="MMM D, YYYY" style={{ width: '100%' }} allowClear={false} />
        </Form.Item>
        <Form.Item name="particulars" label="Particulars" rules={[{ required: true, whitespace: true, message: 'Particulars is required' }]}>
          <Input aria-label="Particulars" placeholder="e.g. Fabric purchase, invoice 1042" />
        </Form.Item>
        <Form.Item
          name="amount"
          label="Amount"
          rules={[
            { required: true, message: 'Amount is required' },
            { type: 'number', min: 0.01, message: 'Amount must be greater than zero' },
          ]}
        >
          <InputNumber<number> aria-label="Amount" min={0} precision={2} style={{ width: '100%' }} addonAfter="PKR" placeholder="0.00" />
        </Form.Item>
        <Form.Item name="notes" label="Notes">
          <Input.TextArea aria-label="Notes" rows={3} placeholder="Optional" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
