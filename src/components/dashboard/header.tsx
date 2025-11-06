'use client'

import { Plus, DollarSign, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

interface HeaderProps {
  onCreateOrder?: () => void
  onAddPayment?: () => void
  onMenuClick?: () => void
}

export function Header({ onCreateOrder, onAddPayment, onMenuClick }: HeaderProps) {
  return (
    <header className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 gap-2">
        {/* Mobile menu button */}
        <Button 
          variant="ghost" 
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Action buttons */}
        <div className="flex items-center flex-1 gap-2 sm:gap-3">
          <Button 
            onClick={onCreateOrder}
            className="flex items-center gap-1 sm:gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create New Order</span>
            <span className="sm:hidden">Order</span>
          </Button>
          
          <Button 
            onClick={onAddPayment}
            variant="outline"
            className="flex items-center gap-1 sm:gap-2"
            size="sm"
          >
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Add New Payment</span>
            <span className="sm:hidden">Payment</span>
          </Button>
        </div>

        <div className="flex items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
