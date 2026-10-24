import { NextResponse } from 'next/server'
import { getAllOrdersSimple } from '@/lib/database'
import { requireAuth } from '@/lib/api-auth'

// GET /api/orders/all - Get all orders (simplified, for dropdowns)
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

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
