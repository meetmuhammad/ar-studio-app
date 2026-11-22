'use client'

import { useCreate, useDelete, useInvalidate, useList, type HttpError } from '@refinedev/core'
import { VENDORS, VENDOR_TAGS } from './constants'

type TagRef = { id: string; tag_name: string }

const key = (name: string) => name.trim().toLowerCase()

/** Distinct, trimmed tag names in the order typed (case-insensitive duplicates dropped). */
export function normalizeTags(names: string[] | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of names ?? []) {
    const name = raw.trim()
    if (!name || seen.has(key(name))) continue
    seen.add(key(name))
    out.push(name)
  }
  return out
}

/**
 * Every tag name already used on the caller's vendors (RLS: admins, their
 * businesses), for suggestions in the tag pickers.
 */
export function useTagSuggestions() {
  const { result } = useList<TagRef, HttpError>({
    resource: VENDOR_TAGS,
    pagination: { mode: 'off' },
    meta: { select: 'tag_name' },
  })
  return normalizeTags((result.data ?? []).map((t) => t.tag_name)).sort((a, b) => a.localeCompare(b))
}

/**
 * Writes a vendor's tags straight to vendor_tags (admin-only by RLS): adds
 * the names that are new and removes the ones that were dropped. Matching is
 * case-insensitive, like the unique tag per vendor.
 */
export function useSyncVendorTags() {
  const { mutateAsync: create } = useCreate()
  const { mutateAsync: remove } = useDelete()
  const invalidate = useInvalidate()

  return async (vendorId: string, desired: string[] | undefined, existing: TagRef[] = []) => {
    const want = normalizeTags(desired)
    const have = new Map(existing.map((t) => [key(t.tag_name), t]))
    const wantKeys = new Set(want.map(key))

    for (const name of want) {
      if (!have.has(key(name))) {
        await create({
          resource: VENDOR_TAGS,
          values: { vendor_id: vendorId, tag_name: name },
          successNotification: false,
          errorNotification: false,
        })
      }
    }
    for (const tag of existing) {
      if (!wantKeys.has(key(tag.tag_name))) {
        await remove({ resource: VENDOR_TAGS, id: tag.id, successNotification: false, errorNotification: false })
      }
    }
    await invalidate({ resource: VENDORS, invalidates: ['list', 'detail'], id: vendorId })
  }
}
