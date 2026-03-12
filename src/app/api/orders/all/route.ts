import { NextResponse } from 'next/server'
import { getAllOrdersSimple } from '@/lib/database'

// GET /api/orders/all - Get all orders (simplified, for dropdowns)
export async function GET() {
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
}
