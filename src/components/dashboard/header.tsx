'use client'

import { Plus, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

interface HeaderProps {
  onCreateOrder?: () => void
  onAddPayment?: () => void
}

export function Header({ onCreateOrder, onAddPayment }: HeaderProps) {
  return (
    <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center flex-1 gap-3">
          <Button 
            onClick={onCreateOrder}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create New Order
          </Button>
          
          <Button 
            onClick={onAddPayment}
            variant="outline"
            className="flex items-center gap-2"
          >
            <DollarSign className="h-4 w-4" />
            Add New Payment
          </Button>
        </div>

        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
