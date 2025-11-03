import { z } from "zod"

// Phone regex for international numbers
const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/

// Customer schemas
export const CreateCustomerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100, "Name too long"),
  phone: z.string().regex(phoneRegex, "Invalid phone number format").max(20, "Phone number too long"),
  address: z.string().max(500, "Address too long").optional().or(z.literal(""))
})

export const UpdateCustomerSchema = CreateCustomerSchema.partial()

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>

// This measurement validation is no longer needed - measurements are stored in separate table

// Payment method enum
const PaymentMethodSchema = z.enum(["cash", "bank", "other"])

// Order type enum for order items
const OrderTypeSchema = z.enum(["nikkah", "mehndi", "barat", "wallima", "other"])

// Order status enum
const OrderStatusSchema = z.enum(["In Process", "Delivered", "Cancelled"])

// Order item schema
export const OrderItemSchema = z.object({
  order_type: OrderTypeSchema,
  description: z.string().min(1, "Description is required").max(1000, "Description too long")
})

export type OrderItem = z.infer<typeof OrderItemSchema>

// Order schemas
export const CreateOrderSchema = z.object({
  customerId: z.string().uuid("Please select a customer"),
  bookingDate: z.date(),
  deliveryDate: z.date(), // Now mandatory
  status: OrderStatusSchema.optional().default("In Process"), // Default to 'In Process'
  comments: z.string().max(1000, "Comments too long").optional().or(z.literal("")),
  // Order items array with max 4 items
  orderItems: z.array(OrderItemSchema).max(4, "Maximum 4 order items allowed").optional().default([]),
  // Payment fields
  totalAmount: z.union([
    z.string().transform((val) => {
      if (!val || val === '') return 0
      const num = parseFloat(val)
      return isNaN(num) ? 0 : num
    }),
    z.number().min(0, "Total amount must be positive")
  ]),
  advancePaid: z.union([
    z.string().transform((val) => {
      if (!val || val === '') return 0
      const num = parseFloat(val)
      return isNaN(num) ? 0 : num
    }),
    z.number().min(0, "Advance paid cannot be negative")
  ]),
  balance: z.union([
    z.string().transform((val) => {
      if (!val || val === '') return 0
      const num = parseFloat(val)
      return isNaN(num) ? 0 : num
    }),
    z.number().min(0, "Balance cannot be negative")
  ]).optional(),
  paymentMethod: PaymentMethodSchema.optional(),
  // Reference to measurements table
  measurementId: z.string().uuid().optional(),
  // Fitting preferences moved to separate field
  fittingPreferences: z.string().max(1000, "Fitting preferences too long").optional().or(z.literal(""))
}).refine((data) => {
  // Delivery date must be on or after booking date
  return data.deliveryDate >= data.bookingDate
}, {
  message: "Delivery date must be on or after booking date",
  path: ["deliveryDate"]
}).refine((data) => {
  // If total amount and advance paid are provided, advance cannot exceed total
  if (data.totalAmount && data.advancePaid) {
    return data.advancePaid <= data.totalAmount
  }
  return true
}, {
  message: "Advance paid cannot exceed total amount",
  path: ["advancePaid"]
}).refine((data) => {
  // Order items must have unique order types
  if (data.orderItems && data.orderItems.length > 0) {
    const orderTypes = data.orderItems.map(item => item.order_type)
    const uniqueOrderTypes = new Set(orderTypes)
    return uniqueOrderTypes.size === orderTypes.length
  }
  return true
}, {
  message: "Each order type can only be used once",
  path: ["orderItems"]
})

export const UpdateOrderSchema = CreateOrderSchema.partial().extend({
  orderNumber: z.string().optional() // Allow order number on updates but don't require it
})

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>
export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>

// API query schemas for pagination and filtering
export const PaginationSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1).pipe(z.number().min(1)),
  pageSize: z.string().transform(val => {
    const size = parseInt(val) || 10
    return Math.min(Math.max(size, 1), 100) // Limit between 1-100
  }).pipe(z.number()),
  sortBy: z.string().optional(),
  sortDir: z.enum(["asc", "desc"]).optional()
})

export const CustomerQuerySchema = PaginationSchema.extend({
  q: z.string().optional() // Search query for name/phone
})

export const OrderQuerySchema = PaginationSchema.extend({
  q: z.string().optional(), // Search query for order number or customer name/phone
  customerId: z.string().uuid().optional(),
  from: z.string().transform(val => val ? new Date(val) : undefined).optional(),
  to: z.string().transform(val => val ? new Date(val) : undefined).optional(),
  status: OrderStatusSchema.optional() // Filter by order status
})

export type CustomerQuery = z.infer<typeof CustomerQuerySchema>
export type OrderQuery = z.infer<typeof OrderQuerySchema>

// Payment schemas
const PaymentMethodEnumSchema = z.enum(["cash", "bank", "other"])

export const CreatePaymentSchema = z.object({
  order_id: z.string().uuid("Please select an order"),
  customer_id: z.string().uuid("Invalid customer ID"),
  amount: z.number().positive("Amount must be positive"),
  payment_method: PaymentMethodEnumSchema.default("other"),
  payment_date: z.date(),
  notes: z.string().max(500, "Notes too long").optional().or(z.literal(""))
}).refine((data) => {
  // Payment date must be today or in the past
  const today = new Date()
  today.setHours(23, 59, 59, 999) // End of today
  return data.payment_date <= today
}, {
  message: "Payment date cannot be in the future",
  path: ["payment_date"]
})

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>
