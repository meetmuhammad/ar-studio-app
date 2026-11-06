import type { VendorWithCategory } from './supabase-client'

/** Sentinel for "no category filter" (Radix Select cannot use ''). */
export const ALL_VENDOR_CATEGORIES = 'all'

/**
 * The vendors list's category + search filter, pure so it can be reused and
 * checked without a browser.
 *
 * - categoryId: ALL_VENDOR_CATEGORIES, or a vendor_categories.id; matches the
 *   vendor's current category_id.
 * - search: a case-insensitive substring of name, notes, contact person, phone
 *   or category name. When the search is exactly a category's name it means
 *   that category, so typing "Fabric" gives the same vendors as choosing
 *   Fabric in the dropdown (and not also every vendor whose notes mention it).
 */
export function filterVendors(
  vendors: VendorWithCategory[],
  { categoryId = ALL_VENDOR_CATEGORIES, search = '' }: { categoryId?: string; search?: string }
): VendorWithCategory[] {
  const query = search.trim().toLowerCase()
  const inCategory = (v: VendorWithCategory, id: string) =>
    (v.category_id ?? v.vendor_categories?.id ?? null) === id

  let result = categoryId === ALL_VENDOR_CATEGORIES ? vendors : vendors.filter((v) => inCategory(v, categoryId))
  if (!query) return result

  const isCategoryName = vendors.some((v) => v.vendor_categories?.name.trim().toLowerCase() === query)
  if (isCategoryName) {
    return result.filter((v) => v.vendor_categories?.name.trim().toLowerCase() === query)
  }

  result = result.filter((v) =>
    [v.name, v.notes, v.contact_person, v.phone, v.vendor_categories?.name]
      .some((field) => field?.toLowerCase().includes(query))
  )
  return result
}
