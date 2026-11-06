import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { defaultBusiness, getMemberships } from '@/lib/business-context'
import type { MyBusinessesResponse } from '@/lib/business-shared'

// GET /api/me/businesses - the businesses the caller may switch between.
// Only memberships are listed: staff see ATC only, admins see ATC + Techlink.
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) return auth

  try {
    const businesses = await getMemberships(auth.user.id)
    const body: MyBusinessesResponse = {
      businesses,
      defaultBusinessId: defaultBusiness(businesses)?.id ?? null,
      canViewAll: auth.user.role === 'admin' && businesses.length > 1,
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('GET /api/me/businesses error:', error)
    return NextResponse.json({ error: 'Failed to load businesses' }, { status: 500 })
  }
}
