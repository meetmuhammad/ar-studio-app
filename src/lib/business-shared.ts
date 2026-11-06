/**
 * Business (shop) scoping constants shared by the browser and the API.
 * Safe to import from client components: no server-only code here.
 */

/** Request header naming the business a call acts on (a businesses.id uuid). */
export const BUSINESS_HEADER = 'X-Business-Id'

/**
 * Header value for the admin-only combined view. Read/report only: the API
 * refuses it on every write, and on every GET that has no combined form.
 */
export const ALL_BUSINESSES = 'all'

/** The business old clients (no header) fall back to. See business-context.ts. */
export const DEFAULT_BUSINESS_SLUG = 'atc'

export interface Business {
  id: string
  name: string
  slug: string
  /** Order-number prefix, e.g. "AR" -> AR-00001, "TL" -> TL-00001. */
  code: string | null
}

/** GET /api/me/businesses */
export interface MyBusinessesResponse {
  businesses: Business[]
  /** The business a request without the header acts on, or null (no ATC access). */
  defaultBusinessId: string | null
  /** Admin with more than one business: may use the read-only combined view. */
  canViewAll: boolean
}
