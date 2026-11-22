'use client'

import { useSelect } from '@refinedev/antd'
import { Select, type SelectProps } from 'antd'
import type { CrudFilter } from '@refinedev/core'
import { VENDOR_CATEGORIES, type CategoryRow } from './constants'

interface CategorySelectProps {
  value?: string
  onChange?: (value: string | undefined) => void
  /** Include archived categories (the list filter does not; pickers never do). */
  includeArchived?: boolean
  allowClear?: boolean
  placeholder?: string
  id?: string
  'aria-label'?: string
  style?: SelectProps['style']
}

/**
 * Vendor category picker over the shared vendor_categories list (read
 * directly; RLS lets any signed-in user read it). Archived categories are
 * hidden, except the one already selected, which is loaded so its name shows.
 */
export function CategorySelect({
  value,
  onChange,
  includeArchived = false,
  allowClear,
  placeholder = 'Select a category',
  id,
  style,
  ...rest
}: CategorySelectProps) {
  const filters: CrudFilter[] = includeArchived ? [] : [{ field: 'archived_at', operator: 'null', value: true }]
  const { selectProps } = useSelect<CategoryRow>({
    resource: VENDOR_CATEGORIES,
    optionLabel: (c) => (c.archived_at ? `${c.name} (archived)` : c.name),
    optionValue: 'id',
    filters,
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
    defaultValue: value,
    meta: { select: 'id, name, archived_at' },
  })

  return (
    <Select<string>
      id={id}
      aria-label={rest['aria-label']}
      value={value}
      onChange={(next) => onChange?.(next)}
      options={selectProps.options as { label: string; value: string }[] | undefined}
      loading={selectProps.loading}
      showSearch
      optionFilterProp="label"
      allowClear={allowClear}
      placeholder={placeholder}
      style={{ width: '100%', ...style }}
    />
  )
}
