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

// Order schemas
export const CreateOrderSchema = z.object({
  customerId: z.string().uuid("Invalid customer ID"),
  bookingDate: z.date(),
  deliveryDate: z.date(), // Now mandatory
  comments: z.string().max(1000, "Comments too long").optional().or(z.literal("")),
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
  to: z.string().transform(val => val ? new Date(val) : undefined).optional()
})

export type CustomerQuery = z.infer<typeof CustomerQuerySchema>
export type OrderQuery = z.infer<typeof OrderQuerySchema>