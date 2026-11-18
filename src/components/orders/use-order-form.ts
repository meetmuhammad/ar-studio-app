'use client'

import { useEffect, useMemo } from 'react'
import { useForm } from '@refinedev/antd'
import type { HttpError } from '@refinedev/core'
import dayjs from 'dayjs'
import { saveNotifications } from '@/lib/refine/notifications'
import { ORDERS, ORDER_SHOW_SELECT, type OrderRow } from './constants'
import { toOrderVariables, type OrderFormValues } from './order-steps-form'

/** A loaded order as form values (dates as dayjs, items as plain pairs). */
export function toOrderFormValues(order: OrderRow): OrderFormValues {
  return {
    customer_id: order.customer_id,
    booking_date: order.booking_date ? dayjs(order.booking_date) : undefined,
    delivery_date: order.delivery_date ? dayjs(order.delivery_date) : undefined,
    status: order.status,
    comments: order.comments ?? '',
    order_items: (order.order_items ?? []).map((i) => ({ order_type: i.order_type, description: i.description })),
    measurement_id: order.measurement_id ?? undefined,
    fitting_preferences: order.fitting_preferences ?? '',
    payment_method: order.payment_method ?? 'other',
    total_amount: order.total_amount ?? 0,
    advance_paid: order.advance_paid ?? 0,
    balance: order.balance ?? 0,
  }
}

export const NEW_ORDER_DEFAULTS = (customerId?: string): OrderFormValues => ({
  customer_id: customerId,
  booking_date: dayjs(),
  delivery_date: dayjs().add(7, 'day'), // one week from today, as before
  status: 'In Process',
  comments: '',
  order_items: [],
  fitting_preferences: '',
  payment_method: 'other',
  total_amount: 0,
  advance_paid: 0,
})

/**
 * Order create / edit state. Saving goes through the data provider, which
 * calls create_order / update_order (one transaction each), then opens the
 * order page.
 */
export function useOrderForm(action: 'create' | 'edit', id?: string) {
  const result = useForm<OrderRow, HttpError, OrderFormValues>({
    resource: ORDERS,
    action,
    id,
    redirect: 'show',
    meta: { select: ORDER_SHOW_SELECT },
    ...saveNotifications('Order', action),
  })
  const record = result.query?.data?.data
  const formValues = useMemo(() => (record ? toOrderFormValues(record) : undefined), [record])

  // Replace Refine's raw values (date strings) with form values.
  const form = result.formProps.form
  useEffect(() => {
    if (formValues) form?.setFieldsValue(formValues)
  }, [formValues, form])

  const submit = () => {
    const values = form?.getFieldsValue(true) as OrderFormValues
    return result.onFinish(toOrderVariables(values) as never).catch(() => undefined)
  }

  return { ...result, record, formValues, submit }
}
