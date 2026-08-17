import { withAuth } from '@/lib/api-auth'
import { NextResponse } from 'next/server'
import { getAllOrdersSimple } from '@/lib/database'

// GET /api/orders/all - Get all orders (simplified, for dropdowns)
export const GET = withAuth(async () => {
  try {
    const orders = await getAllOrdersSimple()
    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('GET /api/orders/all error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
})
