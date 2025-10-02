"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { CustomerDialog } from "@/components/dialogs/customer-dialog"
import { CreateCustomerInput } from "@/lib/validators"
import type { Customer } from "@/lib/supabase-client"

interface CustomerComboboxProps {
  value?: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

export function CustomerCombobox({ value, onValueChange, disabled }: CustomerComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [customers, setCustomers] = React.useState<Customer[]>([])
  const [loading, setLoading] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState("")
  const [customerDialog, setCustomerDialog] = React.useState(false)

  // Fetch customers
  const fetchCustomers = React.useCallback(async (search?: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) {
        params.set('q', search)
      }
      params.set('pageSize', '50') // Get more customers for selection

      const response = await fetch(`/api/customers?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        setCustomers(data.data || [])
      }
    } catch (error) {
      console.error('Error fetching customers:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load
  React.useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Handle search
  const handleSearch = React.useMemo(
    () => {
      let timeout: NodeJS.Timeout
      return (search: string) => {
        setSearchValue(search)
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          if (search.length > 0) {
            fetchCustomers(search)
          } else {
            fetchCustomers()
          }
        }, 300)
      }
    },
    [fetchCustomers]
  )

  // Handle create customer
  const handleCreateCustomer = async (data: CreateCustomerInput) => {
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (response.ok) {
        const newCustomer = await response.json()
        // Refresh customers list
        await fetchCustomers()
        // Select the new customer
        onValueChange(newCustomer.id)
        setCustomerDialog(false)
      }
    } catch (error) {
      console.error('Error creating customer:', error)
      throw error
    }
  }

  const selectedCustomer = customers.find((customer) => customer.id === value)

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
          >
            {selectedCustomer ? (
              <span className="truncate">
                {selectedCustomer.name} - {selectedCustomer.phone}
              </span>
            ) : (
              "Select customer..."
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search customers..."
              onValueChange={handleSearch}
            />
            <div className="flex flex-col max-h-[300px]">
              <CommandList className="flex-1 overflow-y-auto">
                {loading && (
                  <div className="p-2 text-sm text-muted-foreground">
                    Loading customers...
                  </div>
                )}
                <CommandEmpty>
                  {searchValue ? (
                    <div className="p-2 text-center">
                      <p className="text-sm text-muted-foreground mb-2">
                        No customers found for &quot;{searchValue}&quot;
                      </p>
                    </div>
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      No customers found.
                    </div>
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {customers.map((customer) => (
                    <CommandItem
                      key={customer.id}
                      value={customer.id}
                      onSelect={(currentValue) => {
                        onValueChange(currentValue === value ? "" : currentValue)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === customer.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{customer.name}</div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {customer.phone}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
              
              {/* Sticky footer for Create new customer */}
              <div className="border-t bg-background">
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false)
                      setCustomerDialog(true)
                    }}
                    className="text-blue-600 font-medium"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create new customer
                  </CommandItem>
                </CommandGroup>
              </div>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <CustomerDialog
        open={customerDialog}
        onOpenChange={setCustomerDialog}
        onSubmit={handleCreateCustomer}
      />
    </>
  )
}