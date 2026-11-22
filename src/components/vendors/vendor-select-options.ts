import { joinSearchText } from '@/lib/refine/select-search'

/** Columns a vendor picker loads: the label plus what the server "q" search also matches. */
export const VENDOR_PICKER_SELECT = 'id, name, notes, contact_person, phone, vendor_categories(name)'

export interface VendorPickerRow {
  id: string
  name: string
  notes?: string | null
  contact_person?: string | null
  phone?: string | null
  vendor_categories?: { name: string } | null
}

/**
 * Text a vendor option matches on besides its name, the same fields as the
 * server vendor search (src/lib/refine/data-provider.ts vendorSearch), so the
 * client filter never hides a row the server found.
 */
export const vendorSearchText = (v: VendorPickerRow) =>
  joinSearchText(v.notes, v.contact_person, v.phone, v.vendor_categories?.name)
