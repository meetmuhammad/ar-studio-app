import { z } from 'zod'
import type { VendorCategory, VendorTag, VendorWithCategory } from '@/lib/supabase-client'

export const VENDORS = 'vendors'
export const VENDOR_TAGS = 'vendor_tags'
export const VENDOR_CATEGORIES = 'vendor_categories'

/**
 * Every vendor has exactly one category; "Uncategorized" is a real row with
 * this fixed id and is the column default
 * (supabase/migrations/20260827000300_vendor_category_uncategorized.sql).
 * It cannot be archived or deleted from the app.
 */
export const UNCATEGORIZED_ID = '00000000-0000-0000-0000-000000000000'

/** List and detail reads: the vendor, its current category and its tags. */
export const VENDOR_SELECT = '*, vendor_categories(id, name, archived_at), vendor_tags(id, tag_name)'

export type VendorRow = VendorWithCategory & { vendor_tags?: Pick<VendorTag, 'id' | 'tag_name'>[] }
export type CategoryRow = VendorCategory

/**
 * Vendor fields. Name rule mirrors the previous form and POST/PUT
 * /api/vendors ("Vendor name is required", whitespace-only rejected);
 * the contact fields are the optional columns the API accepts.
 */
export const VendorSchema = z.object({
  name: z.string().trim().min(1, 'Vendor name is required').max(200, 'Vendor name is too long'),
  category_id: z.string().optional(),
  contact_person: z.string().max(200, 'Too long').optional(),
  phone: z.string().max(30, 'Phone number too long').optional(),
  email: z.union([z.literal(''), z.string().email('Invalid email address')]).optional(),
  address: z.string().max(500, 'Address too long').optional(),
  notes: z.string().max(2000, 'Description too long').optional(),
})

/** Category name rule, as POST/PATCH /api/vendor-categories. */
export const CategoryNameSchema = z
  .string()
  .trim()
  .min(1, 'Category name is required')
  .max(120, 'Category name is too long (max 120)')

/** Tag name rule, as POST /api/vendor-tags (non-empty after trimming). */
export const TagNameSchema = z.string().trim().min(1, 'Tag name is required').max(60, 'Tag is too long')
