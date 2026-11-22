'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useModalForm, useSelect } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Flex,
  Form,
  Grid,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  type FormInstance,
} from 'antd'
import {
  BankOutlined,
  ColumnHeightOutlined,
  DeleteOutlined,
  DollarOutlined,
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  StarFilled,
  UnorderedListOutlined,
  UserOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import type { Dayjs } from 'dayjs'
import { OrderItemSchema } from '@/lib/validators'
import { zodRule } from '@/lib/refine/zod-rule'
import { FormSection, Sections } from '@/components/refine/page-parts'
import { CustomerSelect } from '@/components/measurements/customer-select'
import { MeasurementFormFields, measurementNotifications } from '@/components/measurements/measurement-form-fields'
import { DEFAULT_MEASUREMENT_NAME, MEASUREMENTS, formatReading, type MeasurementRow } from '@/components/measurements/types'
import { MEASUREMENT_FIELDS } from '@/types/measurements'
import { MAX_ORDER_ITEMS, ORDER_STATUSES, ORDER_TYPES, PAYMENT_METHODS, pkr } from './constants'

export interface OrderFormValues {
  customer_id?: string
  booking_date?: Dayjs
  delivery_date?: Dayjs
  status?: string
  comments?: string
  order_items?: { order_type?: string; description?: string }[]
  measurement_id?: string
  fitting_preferences?: string
  payment_method?: string
  total_amount?: number | null
  advance_paid?: number | null
  balance?: number | null
}

/** The fields each step validates before moving on (as the previous form). */
const STEP_FIELDS: (keyof OrderFormValues)[][] = [
  ['customer_id', 'booking_date', 'delivery_date', 'status', 'comments', 'order_items'],
  ['measurement_id', 'fitting_preferences'],
  ['payment_method', 'total_amount', 'advance_paid'],
]

const STEPS = [
  { title: 'General Information', description: 'Customer, dates, and items' },
  { title: 'Measurements', description: 'Measurements and fitting preferences' },
  { title: 'Payment', description: 'Payment method and amounts' },
]

/** Form values -> what the data provider passes to create_order / update_order. */
export function toOrderVariables(values: OrderFormValues) {
  const total = Number(values.total_amount) || 0
  const advance = Number(values.advance_paid) || 0
  return {
    customer_id: values.customer_id,
    booking_date: values.booking_date?.format('YYYY-MM-DD'),
    delivery_date: values.delivery_date?.format('YYYY-MM-DD'),
    status: values.status ?? 'In Process',
    comments: values.comments ?? '',
    order_items: (values.order_items ?? []).map((i) => ({ order_type: i.order_type, description: i.description ?? '' })),
    measurement_id: values.measurement_id ?? null,
    fitting_preferences: values.fitting_preferences ?? '',
    payment_method: values.payment_method ?? 'other',
    total_amount: total,
    advance_paid: advance,
    balance: Math.max(total - advance, 0),
  }
}

interface OrderStepsFormProps {
  form: FormInstance<OrderFormValues>
  mode: 'create' | 'edit'
  /** Submits the whole form (Refine's onFinish). */
  onSubmit: () => void
  submitting?: boolean
  cancelHref: string
}

/**
 * The order form in three steps, mirroring the previous multi-step form
 * (src/components/forms/order-multistep-form.tsx): General Information,
 * Measurements, Payment. All steps stay mounted (hidden), so values survive
 * moving back and forth; Next validates the current step's fields only.
 */
export function OrderStepsForm({ form, mode, onSubmit, submitting, cancelHref }: OrderStepsFormProps) {
  const [step, setStep] = useState(0)
  const screens = Grid.useBreakpoint()

  const next = async () => {
    try {
      await form.validateFields(STEP_FIELDS[step], { recursive: true })
      setStep((s) => Math.min(s + 1, STEPS.length - 1))
    } catch {
      // Errors are shown on the fields.
    }
  }

  const submit = async () => {
    // Validate every step; jump to the first one with an error.
    for (let i = 0; i < STEPS.length; i++) {
      try {
        await form.validateFields(STEP_FIELDS[i], { recursive: true })
      } catch {
        setStep(i)
        return
      }
    }
    onSubmit()
  }

  return (
    <Sections>
      <Steps
        current={step}
        onChange={async (target) => {
          if (target < step) return setStep(target)
          // Moving forward validates every step in between.
          for (let i = step; i < target; i++) {
            try {
              await form.validateFields(STEP_FIELDS[i], { recursive: true })
            } catch {
              return setStep(i)
            }
          }
          setStep(target)
        }}
        items={STEPS.map((s) => ({ title: s.title, description: screens.md ? s.description : undefined }))}
        size={screens.md ? 'default' : 'small'}
        responsive={false}
        aria-label="Order steps"
      />

      <div hidden={step !== 0}>
        <GeneralStep form={form} />
      </div>
      <div hidden={step !== 1}>
        <MeasurementsStep form={form} mode={mode} active={step === 1} />
      </div>
      <div hidden={step !== 2}>
        <PaymentStep form={form} mode={mode} />
      </div>

      {/* Enter in a field moves on (or submits on the last step). */}
      <button
        type="submit"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onClick={(e) => {
          e.preventDefault()
          void (step < STEPS.length - 1 ? next() : submit())
        }}
      />

      <Flex justify="space-between" gap={8} wrap>
        <Space>
          {step > 0 && (
            <Button icon={<LeftOutlined />} onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              Previous
            </Button>
          )}
        </Space>
        <Space wrap>
          <Link href={cancelHref}>
            <Button disabled={submitting}>Cancel</Button>
          </Link>
          {step < STEPS.length - 1 ? (
            <Button type="primary" onClick={() => void next()} disabled={submitting}>
              Next <RightOutlined />
            </Button>
          ) : (
            <Button type="primary" onClick={() => void submit()} loading={submitting}>
              {mode === 'edit' ? 'Update Order' : 'Create Order'}
            </Button>
          )}
        </Space>
      </Flex>
    </Sections>
  )
}

/* ------------------------------------------------------------------ steps */

function GeneralStep({ form }: { form: FormInstance<OrderFormValues> }) {
  const items = Form.useWatch('order_items', form) ?? []
  const used = (index: number) => items.filter((_, i) => i !== index).map((i) => i?.order_type)

  return (
    <Sections>
      <FormSection icon={<UserOutlined />} title="General Information">
        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              label="Customer"
              name="customer_id"
              required
              rules={[{ required: true, message: 'Please select a customer' }]}
            >
              <CustomerSelect autoFocus />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Booking Date"
              name="booking_date"
              rules={[{ required: true, message: 'Booking date is required' }]}
            >
              <DatePicker style={{ width: '100%' }} format="MMM D, YYYY" allowClear={false} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item
              label="Delivery Date"
              name="delivery_date"
              dependencies={['booking_date']}
              rules={[
                { required: true, message: 'Delivery date is required' },
                ({ getFieldValue }) => ({
                  validator: async (_, value?: Dayjs) => {
                    const booking = getFieldValue('booking_date') as Dayjs | undefined
                    if (value && booking && value.isBefore(booking, 'day')) {
                      throw new Error('Delivery date must be on or after booking date')
                    }
                  },
                }),
              ]}
            >
              <DatePicker style={{ width: '100%' }} format="MMM D, YYYY" allowClear={false} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Order Status" name="status">
              <Select options={ORDER_STATUSES.map((s) => ({ value: s, label: s }))} aria-label="Order Status" />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item
              label="Comments"
              name="comments"
              rules={[{ max: 1000, message: 'Comments too long' }]}
            >
              <Input.TextArea placeholder="Notes about this order" autoSize={{ minRows: 2, maxRows: 5 }} />
            </Form.Item>
          </Col>
        </Row>
      </FormSection>

      <FormSection icon={<UnorderedListOutlined />} title="Order Items">
        <Form.List
          name="order_items"
          rules={[
            {
              validator: async (_, list?: { order_type?: string }[]) => {
                if ((list?.length ?? 0) > MAX_ORDER_ITEMS) throw new Error('Maximum 4 order items allowed')
                const types = (list ?? []).map((i) => i?.order_type).filter(Boolean)
                if (new Set(types).size !== types.length) throw new Error('Each order type can only be used once')
              },
            },
          ]}
        >
          {(fields, { add, remove }, { errors }) => (
            <>
              {fields.length === 0 && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items yet." style={{ margin: '8px 0 16px' }} />
              )}
              {fields.map((field, index) => (
                <Row key={field.key} gutter={12} align="top">
                  <Col xs={24} md={6}>
                    <Form.Item
                      label={`Item ${index + 1} type`}
                      name={[field.name, 'order_type']}
                      rules={[{ required: true, message: 'Select a type' }]}
                    >
                      <Select
                        aria-label={`Item ${index + 1} type`}
                        options={ORDER_TYPES.map((t) => ({
                          value: t.value,
                          label: t.label,
                          disabled: used(index).includes(t.value),
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={20} md={16}>
                    <Form.Item
                      label={`Item ${index + 1} description`}
                      name={[field.name, 'description']}
                      rules={[zodRule(OrderItemSchema.shape.description)]}
                    >
                      <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} placeholder="What to make" />
                    </Form.Item>
                  </Col>
                  <Col xs={4} md={2}>
                    <Form.Item label=" " colon={false}>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => remove(field.name)}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              ))}
              <Form.ErrorList errors={errors} />
              <Button
                icon={<PlusOutlined />}
                onClick={() => {
                  const free = ORDER_TYPES.find((t) => !items.some((i) => i?.order_type === t.value))
                  add({ order_type: free?.value ?? 'other', description: '' })
                }}
                disabled={fields.length >= MAX_ORDER_ITEMS}
                style={{ marginBottom: 16 }}
              >
                Add Item ({fields.length}/{MAX_ORDER_ITEMS})
              </Button>
            </>
          )}
        </Form.List>
      </FormSection>
    </Sections>
  )
}

function MeasurementsStep({ form, mode, active }: { form: FormInstance<OrderFormValues>; mode: 'create' | 'edit'; active: boolean }) {
  const customerId = Form.useWatch('customer_id', form)
  const measurementId = Form.useWatch('measurement_id', form)

  const { query } = useSelect<MeasurementRow, HttpError>({
    resource: MEASUREMENTS,
    optionLabel: 'name',
    optionValue: 'id',
    filters: [{ field: 'customer_id', operator: 'eq', value: customerId }],
    sorters: [{ field: 'created_at', order: 'desc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: !!customerId },
  })
  const measurements = useMemo(() => (customerId ? query.data?.data ?? [] : []), [customerId, query.data])
  const selected = measurements.find((m) => m.id === measurementId)

  // On create, pick the customer's default set (or the newest), like the
  // previous form; clear a set that belongs to another customer.
  useEffect(() => {
    if (!customerId || query.isFetching) return
    if (measurementId && !measurements.some((m) => m.id === measurementId)) {
      form.setFieldValue('measurement_id', undefined)
      return
    }
    if (mode === 'create' && !measurementId && measurements.length) {
      form.setFieldValue('measurement_id', (measurements.find((m) => m.is_default) ?? measurements[0]).id)
    }
  }, [customerId, measurements, measurementId, mode, form, query.isFetching])

  const { modalProps, formProps, show, close } = useModalForm<MeasurementRow, HttpError>({
    resource: MEASUREMENTS,
    action: 'create',
    redirect: false,
    ...measurementNotifications('create'),
    onMutationSuccess: (result) => {
      const id = (result.data as MeasurementRow | undefined)?.id
      if (id) form.setFieldValue('measurement_id', id)
      void query.refetch()
      close()
    },
  })

  return (
    <Sections>
      <FormSection
        icon={<ColumnHeightOutlined />}
        title="Measurements"
        extra={
          <Button
            icon={<PlusOutlined />}
            disabled={!customerId}
            onClick={() => {
              show()
              formProps.form?.setFieldsValue({
                customer_id: customerId,
                name: DEFAULT_MEASUREMENT_NAME,
                is_default: measurements.length === 0,
              })
            }}
          >
            New measurement
          </Button>
        }
      >
        {!customerId ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select a customer in step 1 to choose measurements." />
        ) : (
          <>
            <Form.Item label="Measurement set" name="measurement_id" extra="Optional. The customer's default set is chosen automatically.">
              <Select
                allowClear
                loading={query.isLoading}
                placeholder={measurements.length ? 'Choose measurement set' : 'No saved measurements for this customer'}
                aria-label="Measurement set"
                options={measurements.map((m) => ({
                  value: m.id,
                  label: (
                    <Space size={6}>
                      {m.name}
                      {m.is_default && (
                        <Tag icon={<StarFilled />} color="gold" style={{ marginInlineEnd: 0 }}>
                          Default
                        </Tag>
                      )}
                    </Space>
                  ),
                }))}
              />
            </Form.Item>
            {selected && active && (
              <Descriptions size="small" bordered column={{ xs: 2, sm: 3, lg: 4 }} style={{ marginBottom: 16 }}>
                {MEASUREMENT_FIELDS.filter((f) => selected[f.key] !== null && selected[f.key] !== undefined).map((f) => (
                  <Descriptions.Item key={f.key} label={f.label}>
                    {formatReading(selected, f.key)}
                  </Descriptions.Item>
                ))}
              </Descriptions>
            )}
          </>
        )}
      </FormSection>

      <FormSection icon={<ColumnHeightOutlined />} title="Fitting Preferences">
        <Form.Item
          label="Style Notes & Fitting Preferences"
          name="fitting_preferences"
          rules={[{ max: 1000, message: 'Fitting preferences too long' }]}
        >
          <Input.TextArea
            placeholder="Add any specific fitting preferences, style notes, or special requirements..."
            autoSize={{ minRows: 3, maxRows: 6 }}
          />
        </Form.Item>
      </FormSection>

      <Modal {...modalProps} title="New measurement" width={960} okText="Create Measurement" destroyOnClose>
        <Form {...formProps} layout="vertical">
          <MeasurementFormFields form={formProps.form} mode="create" />
        </Form>
      </Modal>
    </Sections>
  )
}

function PaymentStep({ form, mode }: { form: FormInstance<OrderFormValues>; mode: 'create' | 'edit' }) {
  const total = Number(Form.useWatch('total_amount', form)) || 0
  const advance = Number(Form.useWatch('advance_paid', form)) || 0
  const balance = Math.max(total - advance, 0)

  return (
    <FormSection icon={<DollarOutlined />} title="Payment">
      <Form.Item label="Payment Method" name="payment_method">
        <Radio.Group optionType="button" buttonStyle="solid" aria-label="Payment Method">
          {PAYMENT_METHODS.map((m) => (
            <Radio.Button key={m.value} value={m.value}>
              <Space size={6}>
                {m.value === 'cash' ? <WalletOutlined /> : m.value === 'bank' ? <BankOutlined /> : <DollarOutlined />}
                {m.label}
              </Space>
            </Radio.Button>
          ))}
        </Radio.Group>
      </Form.Item>
      <Row gutter={16}>
        <Col xs={24} md={8}>
          <Form.Item
            label="Total"
            name="total_amount"
            required
            rules={[{ type: 'number', min: 0, message: 'Total amount must be positive' }]}
          >
            <InputNumber min={0} step={100} style={{ width: '100%' }} addonAfter="PKR" placeholder="0" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            label="Advance"
            name="advance_paid"
            dependencies={['total_amount']}
            extra={mode === 'edit' ? 'Changing the advance updates its ledger entry.' : 'Recorded in the ledger on the booking date.'}
            rules={[
              { type: 'number', min: 0, message: 'Advance paid cannot be negative' },
              ({ getFieldValue }) => ({
                validator: async (_, value?: number | null) => {
                  const t = Number(getFieldValue('total_amount')) || 0
                  if (t && value && value > t) throw new Error('Advance paid cannot exceed total amount')
                },
              }),
            ]}
          >
            <InputNumber min={0} step={100} style={{ width: '100%' }} addonAfter="PKR" placeholder="0" />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item label="Balance (Calculated)">
            <InputNumber value={balance} readOnly style={{ width: '100%' }} addonAfter="PKR" aria-label="Balance (Calculated)" />
          </Form.Item>
        </Col>
      </Row>
      {total > 0 && (
        <Alert
          type={advance >= total ? 'success' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            advance >= total
              ? 'Fully paid in advance.'
              : `${pkr(advance)} paid in advance, ${pkr(balance)} remaining.`
          }
        />
      )}
      <Typography.Text type="secondary">Further payments are recorded on the order page after it is saved.</Typography.Text>
    </FormSection>
  )
}
