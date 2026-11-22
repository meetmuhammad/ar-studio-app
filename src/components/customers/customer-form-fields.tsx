'use client'

import { Form, Input } from 'antd'
import { CreateCustomerSchema } from '@/lib/validators'
import { zodRule } from '@/lib/refine/zod-rule'
import { deleteNotificationsFor, saveNotifications } from '@/lib/refine/notifications'

const { name, phone, address } = CreateCustomerSchema.shape

/**
 * Customer fields: same labels, placeholders and validation as the previous
 * form (src/components/forms/customer-form.tsx): name 2–100 characters, phone
 * in the international format (max 20), optional address (max 500). Rules
 * come from the API's own zod schema. The first field takes focus.
 */
export function CustomerFormFields() {
  return (
    <>
      <Form.Item label="Name" name="name" required rules={[zodRule(name)]}>
        <Input placeholder="Enter customer name" autoComplete="off" autoFocus />
      </Form.Item>
      <Form.Item label="Phone" name="phone" required rules={[zodRule(phone)]}>
        <Input placeholder="+1234567890" inputMode="tel" autoComplete="off" />
      </Form.Item>
      <Form.Item label="Address (Optional)" name="address" rules={[zodRule(address)]}>
        <Input.TextArea placeholder="Enter customer address" autoSize={{ minRows: 3, maxRows: 6 }} />
      </Form.Item>
    </>
  )
}

/** Delete notifications matching the previous toasts ("Customer has orders; ..." etc.). */
export const deleteNotifications = deleteNotificationsFor('Customer')

/** Notifications matching the previous toasts, including the duplicate-phone message. */
export const customerNotifications = (action: 'create' | 'edit') => saveNotifications('Customer', action)
