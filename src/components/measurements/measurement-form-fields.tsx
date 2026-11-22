'use client'

import { Col, Form, Input, InputNumber, Row, Switch, Typography, type FormInstance } from 'antd'
import { ColumnHeightOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons'
import { measurementSchema } from '@/types/measurements'
import { zodRule } from '@/lib/refine/zod-rule'
import { deleteNotificationsFor, saveNotifications } from '@/lib/refine/notifications'
import { FormSection, Sections } from '@/components/refine/page-parts'
import type { Customer } from '@/lib/supabase-client'
import { CustomerSelect } from './customer-select'
import { DEFAULT_MEASUREMENT_NAME, MEASUREMENT_CATEGORIES, fieldsIn, standardNameFor, unitFor } from './types'

interface MeasurementFormFieldsProps {
  form?: FormInstance
  mode: 'create' | 'edit'
}

const shape = measurementSchema.shape

/**
 * Measurement fields, grouped into card sections like the previous form
 * (src/components/forms/measurement-form.tsx): customer, set name, default
 * flag, the four reading categories in inches, and notes. Every rule comes
 * from measurementSchema, which the API validates with as well.
 *
 * On create, picking a customer names the set "<customer> - Standard
 * Measurements", as before.
 */
export function MeasurementFormFields({ form, mode }: MeasurementFormFieldsProps) {
  const onCustomer = (customer: Customer | undefined) => {
    if (mode !== 'create' || !customer || !form) return
    const current = form.getFieldValue('name')
    // Keep a name the user typed; replace the generated defaults.
    if (!current || current === DEFAULT_MEASUREMENT_NAME || / - Standard Measurements$/.test(current)) {
      form.setFieldValue('name', standardNameFor(customer.name))
    }
  }

  return (
    <Sections>
      <FormSection icon={<UserOutlined />} title="Customer & set">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Customer" name="customer_id" required rules={[zodRule(shape.customer_id)]}>
              <CustomerSelect onCustomer={onCustomer} autoFocus={mode === 'create'} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              label="Measurement Set Name"
              name="name"
              required
              rules={[zodRule(shape.name)]}
              extra="Give this measurement set a descriptive name"
            >
              <Input placeholder="e.g., Formal Wear Measurements" autoFocus={mode === 'edit'} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item
              label="Set as Default"
              name="is_default"
              valuePropName="checked"
              extra="Mark this as the default measurement set for this customer"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </FormSection>

      {MEASUREMENT_CATEGORIES.map((category) => (
        <FormSection
          key={category}
          icon={<ColumnHeightOutlined />}
          title={category}
          extra={<Typography.Text type="secondary">All measurements in inches</Typography.Text>}
        >
          <Row gutter={16}>
            {fieldsIn(category).map((field) => (
              <Col key={field.key} xs={12} md={8} xl={6}>
                <Form.Item label={field.label} name={field.key} tooltip={field.description} rules={[zodRule(shape[field.key])]}>
                  <InputNumber
                    min={0}
                    step={0.1}
                    placeholder="0.0"
                    inputMode="decimal"
                    addonAfter={unitFor(field.key) || undefined}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
            ))}
          </Row>
        </FormSection>
      ))}

      <FormSection icon={<FileTextOutlined />} title="Notes">
        <Form.Item name="notes" label="Notes" rules={[zodRule(shape.notes)]}>
          <Input.TextArea placeholder="Additional notes about these measurements..." autoSize={{ minRows: 3, maxRows: 8 }} />
        </Form.Item>
      </FormSection>
    </Sections>
  )
}

/** Notifications matching the previous toasts. */
export const measurementNotifications = (action: 'create' | 'edit') => saveNotifications('Measurement', action)
export const measurementDeleteNotifications = deleteNotificationsFor('Measurement')
