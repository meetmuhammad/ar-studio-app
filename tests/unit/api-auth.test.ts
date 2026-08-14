/**
 * withAuth / withAdmin — the only authorization on the API path.
 *
 * Decision 1A means route handlers keep the service-role client, which bypasses
 * RLS. So there is no database backstop: if these wrappers are wrong, the
 * client's customer records are readable by anyone. That is why the coverage
 * here is deliberately exhaustive rather than happy-path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// createServerSupabaseClient is mocked per-test so each auth outcome can be forced.
const mockGetUser = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockSingle }),
      }),
    }),
  })),
}))

const { withAuth, withAdmin, withRoles, getAuthUser } = await import('@/lib/api-auth')
import type { AuthUser } from '@/lib/api-auth'

const req = () => new NextRequest('http://localhost:3000/api/orders')

/**
 * Dynamic-route context. Static routes leave C at its `void` default, which
 * collapses the exported handler to a single argument — the only shape Next.js
 * accepts for a route with no params.
 */
type ParamCtx = { params: Promise<{ id: string }> }

/** A handler that records whether it ran, and what user it received. */
function spyHandler() {
  const calls: Array<{ user: AuthUser; ctx: unknown }> = []
  const handler = vi.fn(async (_r: NextRequest, ctx: { user: AuthUser }) => {
    calls.push({ user: ctx.user, ctx })
    return NextResponse.json({ ok: true })
  })
  return { handler, calls }
}

/** Same, but reads params too — for the dynamic-route pass-through test. */
function spyParamHandler() {
  const calls: Array<{ user: AuthUser; params: unknown }> = []
  const handler = vi.fn(async (_r: NextRequest, ctx: ParamCtx & { user: AuthUser }) => {
    calls.push({ user: ctx.user, params: ctx.params })
    return NextResponse.json({ ok: true })
  })
  return { handler, calls }
}

const asUser = (id: string, email: string) => ({ data: { user: { id, email } }, error: null })
const noUser = { data: { user: null }, error: null }
const authError = { data: { user: null }, error: new Error('invalid JWT') }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getAuthUser', () => {
  it('returns null when there is no session', async () => {
    mockGetUser.mockResolvedValue(noUser)
    expect(await getAuthUser()).toBeNull()
  })

  it('returns null when the JWT is invalid', async () => {
    mockGetUser.mockResolvedValue(authError)
    expect(await getAuthUser()).toBeNull()
  })

  it('returns null when the auth user has no public.users row', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 'a@b.c'))
    mockSingle.mockResolvedValue({ data: null, error: null })
    expect(await getAuthUser()).toBeNull()
  })

  it('returns null when the role lookup errors', async () => {
    // KNOWN LIMITATION, tracked in TODOS.md: a transient DB failure is
    // indistinguishable from "unauthorized" and surfaces as 401. This test
    // pins the CURRENT behaviour so the follow-up change is visible as a diff.
    mockGetUser.mockResolvedValue(asUser('u1', 'a@b.c'))
    mockSingle.mockResolvedValue({ data: null, error: new Error('connection reset') })
    expect(await getAuthUser()).toBeNull()
  })

  it('returns the resolved user on the happy path', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 'staff@example.com'))
    mockSingle.mockResolvedValue({ data: { role: 'staff' }, error: null })
    expect(await getAuthUser()).toEqual({
      id: 'u1',
      email: 'staff@example.com',
      role: 'staff',
    })
  })

  it('does not throw when the client itself blows up', async () => {
    mockGetUser.mockRejectedValue(new Error('network down'))
    expect(await getAuthUser()).toBeNull()
  })

  it('tolerates a user with no email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1', email: undefined } }, error: null })
    mockSingle.mockResolvedValue({ data: { role: 'admin' }, error: null })
    expect((await getAuthUser())?.email).toBe('')
  })
})

describe('withAuth', () => {
  it('returns 401 and does NOT run the handler when unauthenticated', async () => {
    mockGetUser.mockResolvedValue(noUser)
    const { handler } = spyHandler()
    const res = await withAuth(handler)(req())

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized - Please sign in' })
  })

  it('runs the handler for staff', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 's@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'staff' }, error: null })
    const { handler, calls } = spyHandler()

    const res = await withAuth(handler)(req())
    expect(res.status).toBe(200)
    expect(calls[0].user).toEqual({ id: 'u1', email: 's@x.com', role: 'staff' })
  })

  it('runs the handler for admin', async () => {
    mockGetUser.mockResolvedValue(asUser('u2', 'a@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'admin' }, error: null })
    const { handler } = spyHandler()
    expect((await withAuth(handler)(req())).status).toBe(200)
  })

  it('passes dynamic route params through alongside user', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 's@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'staff' }, error: null })
    const { handler, calls } = spyParamHandler()

    const params = Promise.resolve({ id: 'order-123' })
    await withAuth<ParamCtx>(handler)(req(), { params })

    expect(calls[0].params).toBe(params)
    expect(calls[0].user.role).toBe('staff')
  })
})

describe('withAdmin', () => {
  it('returns 403 for staff and does NOT run the handler', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 's@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'staff' }, error: null })
    const { handler } = spyHandler()

    const res = await withAdmin(handler)(req())
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden - Insufficient permissions' })
  })

  it('returns 401 (not 403) for an unauthenticated caller', async () => {
    // The distinction matters: 403 leaks that the endpoint exists and that you
    // are authenticated but under-privileged.
    mockGetUser.mockResolvedValue(noUser)
    const { handler } = spyHandler()
    expect((await withAdmin(handler)(req())).status).toBe(401)
  })

  it('runs the handler for admin', async () => {
    mockGetUser.mockResolvedValue(asUser('u2', 'a@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'admin' }, error: null })
    const { handler } = spyHandler()
    expect((await withAdmin(handler)(req())).status).toBe(200)
  })
})

describe('withRoles', () => {
  it('honours an explicit role list', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 's@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'staff' }, error: null })
    const { handler } = spyHandler()

    expect((await withRoles(['admin'], handler)(req())).status).toBe(403)
    expect((await withRoles(['staff'], handler)(req())).status).toBe(200)
  })

  it('denies everything when given an empty role list', async () => {
    mockGetUser.mockResolvedValue(asUser('u1', 's@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'staff' }, error: null })
    const { handler } = spyHandler()
    expect((await withRoles([], handler)(req())).status).toBe(403)
  })

  it('rejects an unrecognised role value from the database', async () => {
    // If someone adds a role in the DB without updating the app, the safe
    // outcome is denial rather than accidental access.
    mockGetUser.mockResolvedValue(asUser('u1', 's@x.com'))
    mockSingle.mockResolvedValue({ data: { role: 'superuser' }, error: null })
    const { handler } = spyHandler()
    expect((await withAdmin(handler)(req())).status).toBe(403)
    expect((await withAuth(handler)(req())).status).toBe(403)
  })
})
