import type { BaseKey, DataProvider, HttpError } from '@refinedev/core'
import { dataProvider as supabaseDataProvider } from '@refinedev/supabase'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase-client'
import { ALL_BUSINESSES } from '@/lib/business-shared'
import { getActiveBusiness } from '@/lib/business-store'
import { COMBINED_VIEW_READ_ONLY } from './access-control'
import { getMembershipIds } from './business-scope'

/**
 * Refine data provider: @refinedev/supabase on the shared browser client (the
 * user's JWT, so RLS applies), wrapped so every business-scoped table behaves
 * like the API routes (src/lib/business-context.ts):
 *
 * - reads are filtered to the selected business, or to every membership in
 *   the admin "All businesses" view;
 * - inserts are stamped with the selected business_id (never the caller's);
 * - updates and deletes match id AND business_id, so another business's row
 *   is "not found";
 * - writes are refused in the "All businesses" view.
 *
 * RLS (current_user_business_ids()) restricts the same rows server-side; this
 * layer keeps the UI to the business the user picked.
 *
 * Resource-specific rules (error wording, delete preconditions) mirror the
 * matching API route and live in RULES below.
 */

const SCOPED_TABLES = new Set([
  'customers',
  'measurements',
  'vendors',
  'orders',
  'payments',
  'general_ledger',
  'vendor_ledger',
])

const httpError = (statusCode: number, message: string): HttpError => ({ statusCode, message })

interface ResourceRules {
  /** Message for a unique-constraint violation (Postgres 23505). */
  duplicate?: string
  /** Form field the unique constraint is on, so forms can show it inline. */
  duplicateField?: string
  notFound?: string
  /** Throws an HttpError when the row may not be deleted. */
  beforeDelete?: (id: BaseKey, businessId: string) => Promise<void>
  /** Normalises create/update variables (e.g. empty strings to null). */
  prepare?: (variables: Record<string, unknown>) => Record<string, unknown>
}

const emptyToNull = (keys: string[]) => (variables: Record<string, unknown>) => {
  const out = { ...variables }
  for (const key of keys) if (out[key] === '') out[key] = null
  return out
}

const RULES: Record<string, ResourceRules> = {
  // Mirrors src/app/api/customers/** and src/lib/database.ts.
  customers: {
    // Unique (business_id, phone): the same phone may exist in another business.
    duplicate: 'Phone number already exists',
    duplicateField: 'phone',
    notFound: 'Customer not found',
    prepare: emptyToNull(['address']),
    beforeDelete: async (id, businessId) => {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', id)
        .eq('business_id', businessId)
      if (error) throw toHttpError(error)
      if (count && count > 0) {
        throw httpError(400, 'Customer has orders; reassign or delete orders first')
      }
    },
  },
}

function toHttpError(error: PostgrestError, rules?: ResourceRules): HttpError {
  if (error.code === '23505' && rules?.duplicate) {
    return {
      ...httpError(400, rules.duplicate),
      ...(rules.duplicateField ? { errors: { [rules.duplicateField]: rules.duplicate } } : {}),
    }
  }
  if (error.code === '42501') return httpError(403, error.message)
  return { ...error, message: error.message, statusCode: 500 }
}

/** Business ids a read may return rows from. */
function readScope(): string[] {
  const active = getActiveBusiness()
  if (!active) throw httpError(400, 'Select a business first')
  if (active === ALL_BUSINESSES) return getMembershipIds()
  return [active]
}

/** The one business a write acts on. */
function writeScope(): string {
  const active = getActiveBusiness()
  if (!active) throw httpError(400, 'Select a business first')
  if (active === ALL_BUSINESSES) throw httpError(400, COMBINED_VIEW_READ_ONLY)
  return active
}

const withoutBusiness = (variables: unknown): Record<string, unknown> => {
  const out = { ...(variables as Record<string, unknown>) }
  delete out.business_id
  return out
}

const base = supabaseDataProvider(supabase)

const scoped: Pick<
  Required<DataProvider>,
  'getList' | 'getOne' | 'getMany' | 'create' | 'update' | 'deleteOne'
> = {
  getList: (params) =>
    base.getList({
      ...params,
      filters: [...(params.filters ?? []), { field: 'business_id', operator: 'in', value: readScope() }],
    }),

  getOne: async ({ resource, id, meta }) => {
    const { data, error } = await supabase
      .from(resource)
      .select(meta?.select ?? '*')
      .eq('id', id)
      .in('business_id', readScope())
      .maybeSingle()
    if (error) throw toHttpError(error, RULES[resource])
    if (!data) throw httpError(404, RULES[resource]?.notFound ?? 'Not found')
    return { data: data as never }
  },

  getMany: async ({ resource, ids, meta }) => {
    const { data, error } = await supabase
      .from(resource)
      .select(meta?.select ?? '*')
      .in('id', ids)
      .in('business_id', readScope())
    if (error) throw toHttpError(error, RULES[resource])
    return { data: (data ?? []) as never[] }
  },

  create: async ({ resource, variables, meta }) => {
    const rules = RULES[resource]
    const businessId = writeScope()
    const values = { ...(rules?.prepare?.(withoutBusiness(variables)) ?? withoutBusiness(variables)), business_id: businessId }
    const { data, error } = await supabase
      .from(resource)
      .insert([values])
      .select(meta?.select ?? '*')
      .single()
    if (error) throw toHttpError(error, rules)
    return { data: data as never }
  },

  update: async ({ resource, id, variables, meta }) => {
    const rules = RULES[resource]
    const businessId = writeScope()
    const values = rules?.prepare?.(withoutBusiness(variables)) ?? withoutBusiness(variables)
    const { data, error } = await supabase
      .from(resource)
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('business_id', businessId)
      .select(meta?.select ?? '*')
      .maybeSingle()
    if (error) throw toHttpError(error, rules)
    if (!data) throw httpError(404, rules?.notFound ?? 'Not found')
    return { data: data as never }
  },

  deleteOne: async ({ resource, id }) => {
    const rules = RULES[resource]
    const businessId = writeScope()
    await rules?.beforeDelete?.(id, businessId)
    const { data, error } = await supabase
      .from(resource)
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)
      .select('id')
    if (error) throw toHttpError(error, rules)
    if (!data?.length) {
      // RLS turns a forbidden delete into "0 rows". If the row is still
      // visible, the caller may read it but not delete it (admin-only).
      const { data: visible } = await supabase
        .from(resource)
        .select('id')
        .eq('id', id)
        .eq('business_id', businessId)
        .maybeSingle()
      if (visible) throw httpError(403, 'Only an admin can delete this')
      throw httpError(404, rules?.notFound ?? 'Not found')
    }
    return { data: data[0] as never }
  },
}

const isScoped = (resource: string) => SCOPED_TABLES.has(resource)

export const dataProvider: DataProvider = {
  ...base,
  getList: (params) => (isScoped(params.resource) ? scoped.getList(params) : base.getList(params)),
  getOne: (params) => (isScoped(params.resource) ? scoped.getOne(params) : base.getOne(params)),
  getMany: (params) => (isScoped(params.resource) ? scoped.getMany(params) : base.getMany(params)),
  create: (params) => (isScoped(params.resource) ? scoped.create(params) : base.create(params)),
  update: (params) => (isScoped(params.resource) ? scoped.update(params) : base.update(params)),
  deleteOne: (params) => (isScoped(params.resource) ? scoped.deleteOne(params) : base.deleteOne(params)),
  createMany: async (params) =>
    isScoped(params.resource)
      ? {
          data: await Promise.all(
            params.variables.map(async (variables) => (await scoped.create({ ...params, variables })).data as never)
          ),
        }
      : base.createMany(params),
  updateMany: async (params) =>
    isScoped(params.resource)
      ? {
          data: await Promise.all(
            params.ids.map(async (id) => (await scoped.update({ ...params, id })).data as never)
          ),
        }
      : base.updateMany(params),
  deleteMany: async (params) =>
    isScoped(params.resource)
      ? {
          data: await Promise.all(
            params.ids.map(async (id) => (await scoped.deleteOne({ ...params, id })).data as never)
          ),
        }
      : base.deleteMany(params),
}
