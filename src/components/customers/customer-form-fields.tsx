'use client'

import { Form, Input } from 'antd'
import type { Rule } from 'antd/es/form'
import type { ZodType } from 'zod'
import { CreateCustomerSchema } from '@/lib/validators'

/**
 * antd validation rule backed by the API's own zod schema, so the form and
 * POST/PATCH /api/customers can never disagree. Shows the schema's message.
 */
const zodRule = (schema: ZodType): Rule => ({
  validator: async (_rule, value) => {
    const result = schema.safeParse(value ?? '')
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'Invalid value')
  },
})

const { name, phone, address } = CreateCustomerSchema.shape

/**
 * Customer fields: same labels, placeholders and validation as the previous
 * form (src/components/forms/customer-form.tsx): name 2–100 characters, phone
 * in the international format (max 20), optional address (max 500).
 */
export function CustomerFormFields() {
  return (
    <>
      <Form.Item label="Name" name="name" required rules={[zodRule(name)]}>
        <Input placeholder="Enter customer name" autoComplete="off" />
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

const messageOf = (error: unknown, fallback: string): string => {
  const message = error && typeof error === 'object' && 'message' in error ? error.message : undefined
  return typeof message === 'string' && message ? message : fallback
}

/** Delete notifications matching the previous toasts ("Customer has orders; ..." etc.). */
export const deleteNotifications = {
  successNotification: () => ({ message: 'Customer deleted successfully', type: 'success' as const }),
  errorNotification: (error?: unknown) => ({ message: messageOf(error, 'Failed to delete customer'), type: 'error' as const }),
}

/** Notifications matching the previous toasts, including the duplicate-phone message. */
export const customerNotifications = (action: 'create' | 'edit') => ({
  successNotification: () => ({
    message: action === 'edit' ? 'Customer updated successfully' : 'Customer created successfully',
    type: 'success' as const,
  }),
  errorNotification: (error?: { message?: string }) => ({
    message: error?.message || (action === 'edit' ? 'Failed to update customer' : 'Failed to create customer'),
    type: 'error' as const,
  }),
})
