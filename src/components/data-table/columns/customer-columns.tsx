"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, Edit, MoreHorizontal, Trash } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import type { Customer } from "@/lib/supabase-client"

interface CustomerWithOrderCount extends Customer {
  orders?: { count: number }
}

interface CustomerActionsProps {
  customer: CustomerWithOrderCount
  onEdit: (customer: CustomerWithOrderCount) => void
  onDelete: (customer: CustomerWithOrderCount) => void
}

function CustomerActions({ customer, onEdit, onDelete }: CustomerActionsProps) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem
          onClick={() => navigator.clipboard.writeText(customer.id)}
        >
          Copy customer ID
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onEdit(customer)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit customer
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(customer)}
          className="text-red-600"
        >
          <Trash className="mr-2 h-4 w-4" />
          Delete customer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </div>
  )
}

export function createCustomerColumns({
  onEdit,
  onDelete,
  onRowClick,
}: {
  onEdit: (customer: CustomerWithOrderCount) => void
  onDelete: (customer: CustomerWithOrderCount) => void
  onRowClick?: (customer: CustomerWithOrderCount) => void
}): ColumnDef<CustomerWithOrderCount>[] {
  return [
    {
      accessorKey: "name",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-2 h-auto p-2"
          >
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return (
          <div className="font-medium pl-2">
            {row.getValue("name")}
          </div>
        )
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) => {
        return (
          <div className="font-mono text-sm">
            {row.getValue("phone")}
          </div>
        )
      },
    },
    {
      accessorKey: "address",
      header: "Address",
      cell: ({ row }) => {
        const address = row.getValue("address") as string | null
        return (
          <div className="max-w-[300px] truncate text-sm text-muted-foreground">
            {address || "No address"}
          </div>
        )
      },
    },
    {
      id: "orderCount",
      header: "Orders",
      cell: ({ row }) => {
        const orderCount = row.original.orders?.count || 0
        return (
          <Badge variant={orderCount > 0 ? "default" : "secondary"}>
            {orderCount} order{orderCount !== 1 ? "s" : ""}
          </Badge>
        )
      },
    },
    {
      accessorKey: "created_at",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-2 h-auto p-2"
          >
            Created
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return (
          <div className="text-sm text-muted-foreground">
            {format(new Date(row.getValue("created_at")), "MMM d, yyyy")}
          </div>
        )
      },
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const customer = row.original
        return (
          <CustomerActions
            customer={customer}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      },
    },
  ]
}