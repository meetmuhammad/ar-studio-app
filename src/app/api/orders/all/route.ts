import { NextResponse } from 'next/server'
import { getAllOrdersSimple } from '@/lib/database'
import { requireBusinessRead } from '@/lib/business-context'

// GET /api/orders/all - Get all orders (simplified, for dropdowns)
export async function GET(request: Request) {
  const scope = await requireBusinessRead(request)
  if (scope instanceof NextResponse) return scope

  try {
    const orders = await getAllOrdersSimple(scope)
    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('GET /api/orders/all error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
