'use client'

import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  /** Accessible name. The visible label is the placeholder, which screen readers skip. */
  label: string
  /** Fired on Enter, for routes that search on submit rather than as you type. */
  onSubmit?: () => void
  className?: string
}

/**
 * The studio's one search field.
 *
 * Four routes each rebuilt this — one of them with a raw `<input>` and a hand-
 * inlined SVG magnifier, which sat outside both the component layer and the
 * icon set. The clear button matters more than it looks: without it, emptying a
 * filtered table on a phone means selecting text in a field the keyboard covers.
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  label,
  onSubmit,
  className,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
        // pr-10 reserves the clear button's column so a long query never slides
        // underneath it.
        className="pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          onClick={() => {
            onValueChange('')
            onSubmit?.()
          }}
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
