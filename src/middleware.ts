import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Edge middleware: session refresh + a first authentication gate.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  request                                                                 │
 * │    │                                                                     │
 * │    ├── not matched by `config.matcher` (static, _next, images) ──► pass  │
 * │    │                                                                     │
 * │    ▼                                                                     │
 * │  refresh the Supabase session cookie (this is why middleware exists —    │
 * │  without it, server components see a stale/expired token)                │
 * │    │                                                                     │
 * │    ├── /sign-in, /auth/* ──────────────────────────────────────► pass    │
 * │    │                                                                     │
 * │    ├── /api/*   + no user ─────────────────────────────► 401 JSON        │
 * │    │                                                                     │
 * │    ├── page     + no user ─────────────────────────────► 302 /sign-in    │
 * │    │                                                                     │
 * │    └── has user ───────────────────────────────────────────────► pass    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ## This is NOT the authorization boundary
 *
 * It is defense in depth and a UX improvement (unauthenticated page requests get
 * a redirect instead of a flash of empty dashboard). The real check is
 * withAuth/withAdmin in each route module, for two reasons:
 *
 *  1. Next.js documents that middleware should not be your only authorization
 *     check, and CVE-2025-29927 demonstrated a header-based bypass of exactly
 *     this layer (patched in 15.2.3; this project is on 15.5.7).
 *  2. Middleware cannot express per-route ROLE rules. `/api/vendors` is admin
 *     only; `/api/orders` is any signed-in user. That lives with the route.
 *
 * Middleware deliberately checks authentication only — never roles. Duplicating
 * the role map here would create two sources of truth that drift.
 */

/** Paths that must stay reachable without a session. */
const PUBLIC_PATHS = ['/sign-in', '/auth']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  // This response object carries any refreshed auth cookies back to the client.
  // It must be the one we return, or the refreshed session is silently dropped.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() rather than getSession(): it validates the JWT against the auth
  // server. getSession() only decodes the cookie, so it cannot be trusted here.
  // Calling it also performs the token refresh this middleware exists for.
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (isPublic(pathname)) {
    return response
  }

  if (!user) {
    if (pathname.startsWith('/api/')) {
      // Matches the shape withAuth returns, so clients see one error contract.
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 },
      )
    }

    const signIn = request.nextUrl.clone()
    signIn.pathname = '/sign-in'
    signIn.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(signIn)
  }

  return response
}

export const config = {
  /**
   * Scoped tightly on purpose. Middleware runs on every matched request, so a
   * loose matcher taxes every image and font with an auth-server round trip.
   *
   * Excluded: _next/static, _next/image, favicon, and anything with a file
   * extension (images, fonts, manifests, robots.txt).
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|txt|xml|json)$).*)',
  ],
}
