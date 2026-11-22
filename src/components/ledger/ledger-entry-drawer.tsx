'use client'

import { useEffect } from 'react'
import { useSelect } from '@refinedev/antd'
import { useCreate, useUpdate, type HttpError } from '@refinedev/core'
import { Alert, Button, DatePicker, Drawer, Flex, Form, Grid, Input, InputNumber, Radio, Select, Space, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { errorMessage } from '@/lib/refine/notifications'
import { useSearchSelect } from '@/components/refine/use-search-select'
import { VENDOR_PICKER_SELECT, vendorSearchText, type VendorPickerRow } from '@/components/vendors/vendor-select-options'
import { GENERAL_LEDGER, MANUAL_ENTRY_TYPES, type LedgerEntryValues, type ManualEntryType } from './constants'

interface FormValues {
  entry_type: ManualEntryType
  vendor_id?: string | null
  side: 'debit' | 'credit'
  amount?: number
  entry_date?: Dayjs
  particulars?: string
  notes?: string
}

interface LedgerEntryDrawerProps {
  open: boolean
  onClose: () => void
  /** Edit this entry; otherwise a new one. */
  entry?: LedgerEntryValues | null
  /** New vendor payment for this vendor (vendor page "Record payment"). */
  vendor?: { id: string; name: string } | null
  onSaved?: () => void
}

/**
 * Add or edit a manual general-ledger entry (admin only; the functions in
 * 20261119000300_ledger_entry_functions.sql enforce it). Same rules as the
 * previous form and POST/PUT /api/general-ledger:
 * - types: Vendor payment (default; needs a vendor, always money out, the
 *   particulars default to the vendor's name), Miscellaneous (money in or out,
 *   optional vendor), Opening balance;
 * - amount greater than zero, on the debit (money in) or credit (money out) side;
 * - a vendor's entry is mirrored into its vendor ledger by the function.
 *
 * Accessible names: "Entry type", "Vendor", "Direction", "Amount", "Date",
 * "Particulars", "Notes"; buttons "Add Entry" / "Update Entry", "Cancel".
 */
export function LedgerEntryDrawer({ open, onClose, entry, vendor, onSaved }: LedgerEntryDrawerProps) {
  const [form] = Form.useForm<FormValues>()
  const screens = Grid.useBreakpoint()
  const editing = !!entry
  const type = Form.useWatch('entry_type', form) ?? 'vendor_payment'

  // All vendors load in one request so typing filters them instantly; the
  // server search still covers any vendor past the read cap.
  const vendorSelect = useSearchSelect(
    useSelect<VendorPickerRow>({
      resource: 'vendors',
      optionLabel: 'name',
      optionValue: 'id',
      onSearch: (term) => [{ field: 'q', operator: 'contains', value: term }],
      sorters: [{ field: 'name', order: 'asc' }],
      pagination: { mode: 'off' },
      defaultValue: entry?.vendor_id ?? vendor?.id ?? undefined,
      meta: { select: VENDOR_PICKER_SELECT },
      queryOptions: { enabled: open },
    }),
    { searchText: vendorSearchText, open },
  )

  const { mutateAsync: create, mutation: createState } = useCreate<LedgerEntryValues, HttpError>()
  const { mutateAsync: update, mutation: updateState } = useUpdate<LedgerEntryValues, HttpError>()
  const saving = createState.isPending || updateState.isPending

  useEffect(() => {
    if (!open) return
    form.resetFields()
    if (entry) {
      form.setFieldsValue({
        entry_type: (MANUAL_ENTRY_TYPES.some((t) => t.value === entry.entry_type) ? entry.entry_type : 'miscellaneous') as ManualEntryType,
        vendor_id: entry.vendor_id,
        side: entry.debit ? 'debit' : 'credit',
        amount: Number(entry.debit || entry.credit || 0) || undefined,
        entry_date: dayjs(entry.entry_date),
        particulars: entry.particulars,
        notes: entry.notes ?? '',
      })
    } else {
      form.setFieldsValue({
        entry_type: 'vendor_payment',
        vendor_id: vendor?.id ?? null,
        side: 'credit',
        entry_date: dayjs(),
        particulars: '',
        notes: '',
      })
    }
  }, [open, entry, vendor, form])

  const save = async () => {
    const v = await form.validateFields()
    const side = v.entry_type === 'vendor_payment' ? 'credit' : v.side
    const body = {
      entry_type: v.entry_type,
      entry_date: v.entry_date?.format('YYYY-MM-DD'),
      particulars: v.particulars ?? '',
      debit: side === 'debit' ? v.amount : null,
      credit: side === 'credit' ? v.amount : null,
      vendor_id: v.entry_type === 'opening_balance' ? null : v.vendor_id ?? null,
      notes: v.notes ?? '',
    }
    try {
      if (entry) {
        await update({
          resource: GENERAL_LEDGER,
          id: entry.id,
          values: body,
          successNotification: { message: 'Ledger entry updated successfully', type: 'success' },
          errorNotification: (e) => ({ message: errorMessage(e, 'Failed to update ledger entry'), type: 'error' }),
        })
      } else {
        await create({
          resource: GENERAL_LEDGER,
          values: body,
          successNotification: {
            message: v.entry_type === 'vendor_payment' ? 'Payment recorded successfully' : 'Ledger entry created successfully',
            type: 'success',
          },
          errorNotification: (e) => ({ message: errorMessage(e, 'Failed to create ledger entry'), type: 'error' }),
        })
      }
      onSaved?.()
      onClose()
    } catch {
      // The notification explains the failure; the drawer stays open.
    }
  }

  const title = editing ? 'Edit ledger entry' : vendor ? `Record payment to ${vendor.name}` : 'Add ledger entry'

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      width={screens.sm ? 520 : '100%'}
      destroyOnClose
      footer={
        <Flex justify="end">
          <Space>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" loading={saving} onClick={() => void save()}>
              {editing ? 'Update Entry' : 'Add Entry'}
            </Button>
          </Space>
        </Flex>
      }
    >
      <Form form={form} layout="vertical" onFinish={() => void save()} requiredMark="optional">
        <Form.Item name="entry_type" label="Entry type" rules={[{ required: true, message: 'Entry type is required' }]}>
          <Select
            aria-label="Entry type"
            disabled={!!vendor && !editing}
            options={MANUAL_ENTRY_TYPES.map(({ value, label }) => ({ value, label }))}
          />
        </Form.Item>

        {type !== 'opening_balance' && (
          <Form.Item
            name="vendor_id"
            label="Vendor"
            rules={type === 'vendor_payment' ? [{ required: true, message: 'Please select a vendor' }] : []}
            extra={type === 'vendor_payment' ? 'The vendor name is used as the particulars when you leave them empty.' : 'Optional: links the entry to the vendor ledger.'}
          >
            <Select
              aria-label="Vendor"
              allowClear={type !== 'vendor_payment'}
              {...vendorSelect}
              placeholder="Search vendors"
              disabled={!!vendor && !editing}
            />
          </Form.Item>
        )}

        {type === 'vendor_payment' ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Vendor payments are money out (credit)"
            description="The payment also appears in the vendor's ledger as paid."
          />
        ) : (
          <Form.Item name="side" label="Direction" rules={[{ required: true }]}>
            <Radio.Group
              aria-label="Direction"
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'debit', label: 'Debit (money in)' },
                { value: 'credit', label: 'Credit (money out)' },
              ]}
            />
          </Form.Item>
        )}

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

        <Form.Item name="entry_date" label="Date" rules={[{ required: true, message: 'Entry date is required' }]}>
          <DatePicker aria-label="Date" format="MMM D, YYYY" style={{ width: '100%' }} allowClear={false} />
        </Form.Item>

        <Form.Item
          name="particulars"
          label="Particulars"
          rules={type === 'vendor_payment' ? [] : [{ required: true, whitespace: true, message: 'Particulars is required' }]}
        >
          <Input aria-label="Particulars" placeholder={type === 'vendor_payment' ? 'Defaults to the vendor name' : 'e.g. Rent for November'} />
        </Form.Item>

        <Form.Item name="notes" label="Notes">
          <Input.TextArea aria-label="Notes" rows={3} placeholder="Optional" />
        </Form.Item>

        {editing && entry?.vendor_id && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Saving rewrites this entry&apos;s line in the vendor ledger.
          </Typography.Text>
        )}
      </Form>
    </Drawer>
  )
}
