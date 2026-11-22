'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { SelectProps } from 'antd'
import { normalizeSearch, optionLabelFilter, type SearchableOption } from '@/lib/refine/select-search'

/** The parts of @refinedev/antd useSelect's result this hook reads. */
interface UseSelectResult<TRow> {
  selectProps: { options?: SelectProps['options']; onSearch?: (value: string) => void }
  query: { isFetching: boolean; data?: { data?: TRow[] } }
  defaultValueQuery: { isFetching: boolean; data?: { data?: TRow[] } }
}

interface Options<TRow> {
  /** Extra text a row matches on besides its label (fields the server search also looks at). */
  searchText?: (row: TRow) => string
  /** The row field the option value comes from (default "id"). */
  valueField?: keyof TRow & string
  /**
   * The drawer or modal holding the Select. Each time it opens the search is
   * reset, so a term from last time does not leave a narrowed list behind.
   */
  open?: boolean
}

export interface SearchSelectProps {
  options: (SearchableOption & { label: string; value: string })[]
  onSearch: (value: string) => void
  filterOption: (input: string, option?: SearchableOption) => boolean
  loading: boolean
  showSearch: true
  onOpenChange: (open: boolean) => void
}

/**
 * Select props for a Refine useSelect search that filter as you type.
 *
 * Refine's antd useSelect sets filterOption false, debounces the server
 * search by 300ms and keeps the previous (unfiltered) options until the new
 * page arrives, and its `loading` only follows the preset-value query. So
 * typing showed the full list with no spinner. Here:
 * - the loaded options are filtered on every keystroke (label + searchText);
 * - the server search still runs, for rows not loaded yet;
 * - `loading` follows the list query as well;
 * - the search is reset when the container opens and when the dropdown
 *   closes (Ant Design clears the typed text then), so every open starts
 *   from the full list. Not on dropdown open: typing into a closed Select
 *   opens it, and that must not wipe the term just typed.
 */
export function useSearchSelect<TRow extends object>(
  { selectProps, query, defaultValueQuery }: UseSelectResult<TRow>,
  { searchText, valueField = 'id' as keyof TRow & string, open }: Options<TRow> = {},
): SearchSelectProps {
  const serverSearch = selectProps.onSearch
  const term = useRef('')

  const onSearch = useCallback(
    (value: string) => {
      term.current = normalizeSearch(value)
      serverSearch?.(value)
    },
    [serverSearch],
  )

  /** Back to the full list, unless it already is. */
  const reset = useCallback(() => {
    if (term.current) onSearch('')
  }, [onSearch])

  useEffect(() => {
    if (open) reset()
  }, [open, reset])

  const listRows = query.data?.data
  const presetRows = defaultValueQuery.data?.data
  const options = useMemo(() => {
    const base = (selectProps.options ?? []) as { label: string; value: string }[]
    if (!searchText) return base
    const byValue = new Map<string, TRow>()
    for (const row of [...(presetRows ?? []), ...(listRows ?? [])]) byValue.set(String(row[valueField]), row)
    return base.map((o) => {
      const row = byValue.get(String(o.value))
      return row ? { ...o, searchText: searchText(row) } : o
    })
  }, [selectProps.options, listRows, presetRows, searchText, valueField])

  return {
    options,
    onSearch,
    filterOption: optionLabelFilter,
    loading: query.isFetching || defaultValueQuery.isFetching,
    showSearch: true,
    onOpenChange: (visible) => {
      if (!visible) reset()
    },
  }
}
