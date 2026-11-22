'use client'

import { useEffect, useRef } from 'react'
import { useSelect } from '@refinedev/antd'
import { Select } from 'antd'
import type { Customer } from '@/lib/supabase-client'
import { useSearchSelect } from '@/components/refine/use-search-select'

interface CustomerSelectProps {
  value?: string
  onChange?: (value: string) => void
  /** Called with the chosen customer (also once for a preset value). */
  onCustomer?: (customer: Customer | undefined) => void
  disabled?: boolean
  autoFocus?: boolean
  id?: string
}

type CustomerOption = Pick<Customer, 'id' | 'name' | 'phone'>

/**
 * Searchable customer picker. Searches name or phone server-side (virtual
 * filter "q") within the selected business, 20 at a time. A preset value is
 * loaded too, so deep links and edit forms show the name.
 *
 * Accessible name: "Customer".
 */
export function CustomerSelect({ value, onChange, onCustomer, disabled, autoFocus, id }: CustomerSelectProps) {
  const select = useSelect<CustomerOption>({
    resource: 'customers',
    optionLabel: (c) => `${c.name} · ${c.phone}`,
    optionValue: 'id',
    defaultValue: value,
    onSearch: (term) => [{ field: 'q', operator: 'contains', value: term }],
    sorters: [{ field: 'name', order: 'asc' }],
    pagination: { pageSize: 20 },
    meta: { select: 'id, name, phone' },
    debounce: 300,
  })
  const { query, defaultValueQuery } = select
  // The label holds name and phone, the two fields the server search matches.
  const search = useSearchSelect(select)

  const find = (id?: string) =>
    [...(query.data?.data ?? []), ...(defaultValueQuery.data?.data ?? [])].find((c) => c.id === id) as Customer | undefined

  // Report a preset customer once it has loaded.
  const reported = useRef<string | undefined>(undefined)
  const preset = defaultValueQuery.data?.data?.find((c) => c.id === value) as Customer | undefined
  useEffect(() => {
    if (preset && reported.current !== preset.id) {
      reported.current = preset.id
      onCustomer?.(preset)
    }
  }, [preset, onCustomer])

  // Controlled: the form owns the value; search and options come from useSelect.
  return (
    <Select<string>
      {...search}
      id={id}
      value={value}
      onChange={(next) => {
        const nextId = next as unknown as string
        onChange?.(nextId)
        onCustomer?.(find(nextId))
      }}
      allowClear={false}
      disabled={disabled}
      autoFocus={autoFocus}
      placeholder="Search customers by name or phone"
      aria-label="Customer"
      notFoundContent={query.isFetching ? 'Searching…' : 'No customers found'}
      style={{ width: '100%' }}
    />
  )
}
