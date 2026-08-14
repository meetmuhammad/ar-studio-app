import { NextResponse } from 'next/server'
import { getAllOrdersSimple } from '@/lib/database'
import { withAuth } from '@/lib/api-auth'

// GET /api/orders/all - Get all orders (simplified, for dropdowns)
async function GETHandler() {
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

// ─────────────────────────────────────────────────────────────────────────────
// Authorization: any signed-in user
// Mirrors the client-side RoleGuard on the corresponding page. The handlers
// above are unchanged; only the exported entry points are wrapped.
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withAuth(GETHandler)
