import type { VendorWithCategory } from './supabase-client'

/** Sentinel for "no category filter" (Radix Select cannot use ''). */
export const ALL_VENDOR_CATEGORIES = 'all'

/** Enough of a vendor category to match a search against its name. */
export type VendorCategoryRef = { id: string; name: string }

const normalize = (s: string) => s.trim().toLowerCase()

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
 * - categories: the full category list (pass archived ones too). A search is
 *   a category name if it names any category here, even one no vendor uses
 *   yet, so an empty category searches to 0 just as its filter does. Category
 *   names found on the vendors themselves also count.
 */
export function filterVendors(
  vendors: VendorWithCategory[],
  {
    categoryId = ALL_VENDOR_CATEGORIES,
    search = '',
    categories = [],
  }: { categoryId?: string; search?: string; categories?: VendorCategoryRef[] }
): VendorWithCategory[] {
  const query = normalize(search)
  const categoryOf = (v: VendorWithCategory) => v.category_id ?? v.vendor_categories?.id ?? null

  let result = categoryId === ALL_VENDOR_CATEGORIES ? vendors : vendors.filter((v) => categoryOf(v) === categoryId)
  if (!query) return result

  const namedIds = new Set<string>()
  for (const c of categories) if (normalize(c.name) === query) namedIds.add(c.id)
  for (const v of vendors) {
    const c = v.vendor_categories
    if (c && normalize(c.name) === query) namedIds.add(c.id)
  }
  if (namedIds.size > 0) {
    return result.filter((v) => {
      const id = categoryOf(v)
      return id !== null && namedIds.has(id)
    })
  }

  result = result.filter((v) =>
    [v.name, v.notes, v.contact_person, v.phone, v.vendor_categories?.name]
      .some((field) => field?.toLowerCase().includes(query))
  )
  return result
}
