"use client"

import { ColumnDef } from "@tanstack/react-table"
import { ArrowUpDown, Edit, Eye, MoreHorizontal, Trash } from "lucide-react"
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
import { Checkbox } from "@/components/ui/checkbox"
import type { OrderWithCustomer } from "@/lib/supabase-client"

interface OrderActionsProps {
  order: OrderWithCustomer
  onView: (order: OrderWithCustomer) => void
  onEdit: (order: OrderWithCustomer) => void
  onDelete: (order: OrderWithCustomer) => void
}

function OrderActions({ order, onView, onEdit, onDelete }: OrderActionsProps) {
  return (
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
          onClick={() => navigator.clipboard.writeText(order.order_number)}
        >
          Copy order number
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onView(order)}>
          <Eye className="mr-2 h-4 w-4" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(order)}>
          <Edit className="mr-2 h-4 w-4" />
          Edit order
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onDelete(order)}
          className="text-red-600"
        >
          <Trash className="mr-2 h-4 w-4" />
          Delete order
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function createOrderColumns({
  onView,
  onEdit,
  onDelete,
}: {
  onView: (order: OrderWithCustomer) => void
  onEdit: (order: OrderWithCustomer) => void
  onDelete: (order: OrderWithCustomer) => void
}): ColumnDef<OrderWithCustomer>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "order_number",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Order #
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return (
          <div className="font-mono font-medium">
            {row.getValue("order_number")}
          </div>
        )
      },
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => {
        const customer = row.original.customers
        return (
          <div>
            <div className="font-medium">{customer.name}</div>
            <div className="text-sm text-muted-foreground font-mono">
              {customer.phone}
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: "booking_date",
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Booking Date
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
      cell: ({ row }) => {
        return (
          <div className="text-sm">
            {format(new Date(row.getValue("booking_date")), "MMM d, yyyy")}
          </div>
        )
      },
    },
    {
      accessorKey: "delivery_date",
      header: "Delivery Date",
      cell: ({ row }) => {
        const deliveryDate = row.getValue("delivery_date") as string | null
        return (
          <div className="text-sm">
            {deliveryDate 
              ? format(new Date(deliveryDate), "MMM d, yyyy")
              : <span className="text-muted-foreground">Not set</span>
            }
          </div>
        )
      },
    },
    {
      id: "measurements",
      header: "Measurements",
      cell: ({ row }) => {
        const order = row.original
        const measurementCount = [
          order.chest, order.waist, order.hips, order.sleeves, order.neck,
          order.shoulder, order.cross_back, order.biceps, order.wrist,
          order.coat_length, order.three_piece_waistcoat, order.waistcoat_length,
          order.sherwani_length, order.pant_waist, order.pant_length,
          order.thigh, order.knee, order.bottom, order.shoe_size, order.turban_length
        ].filter(m => m !== null && m !== undefined).length

        return (
          <Badge variant={measurementCount > 0 ? "default" : "secondary"}>
            {measurementCount} measurement{measurementCount !== 1 ? "s" : ""}
          </Badge>
        )
      },
    },
    {
      accessorKey: "comments",
      header: "Comments",
      cell: ({ row }) => {
        const comments = row.getValue("comments") as string | null
        return (
          <div className="max-w-[200px] truncate text-sm text-muted-foreground">
            {comments || "No comments"}
          </div>
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
        const order = row.original
        return (
          <OrderActions
            order={order}
            onView={onView}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        )
      },
    },
  ]
}