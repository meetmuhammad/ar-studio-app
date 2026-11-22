/**
 * Client-side matching for searchable Ant Design Selects fed by Refine
 * useSelect. Pure (no React), so the checks in select-search.test.ts can run
 * it under node.
 *
 * Refine's antd useSelect turns Ant Design's own filtering off and only
 * replaces the options once the debounced server search returns, so on its
 * own the list stays unfiltered while the user types. Matching the loaded
 * options here narrows the list on every keystroke; the server search still
 * runs so rows that are not loaded yet can be found.
 */

/** An option as the Selects build it; `searchText` holds extra matchable text (phone, notes, ...). */
export interface SearchableOption {
  label?: unknown
  value?: unknown
  searchText?: string
}

/** Lower-cased, trimmed search term ('' means "no search"). */
export const normalizeSearch = (input: unknown): string => (typeof input === 'string' ? input.trim().toLowerCase() : '')

/** The text an option is matched against: its label (when it is a string or number) and its searchText. */
export const optionSearchText = (option?: SearchableOption): string => {
  if (!option) return ''
  const label = typeof option.label === 'string' || typeof option.label === 'number' ? String(option.label) : ''
  return `${label} ${option.searchText ?? ''}`.toLowerCase()
}

/**
 * Ant Design `filterOption`: case-insensitive substring match on the label
 * (and searchText), ignoring surrounding whitespace. An empty term matches all.
 */
export const optionLabelFilter = (input: string, option?: SearchableOption): boolean => {
  const term = normalizeSearch(input)
  if (!term) return true
  return optionSearchText(option).includes(term)
}

/** Joins the non-empty parts of a row into one searchText string. */
export const joinSearchText = (...parts: unknown[]): string =>
  parts.filter((p) => typeof p === 'string' || typeof p === 'number').map(String).join(' ')
