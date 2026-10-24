/**
 * The browser helper that carries the session to the API (src/lib/auth-fetch.ts).
 *
 *   npx tsx --env-file=.env.local scripts/security/auth-fetch.check.ts
 *
 * Runs the real helper and the real supabase-js client against the local
 * GoTrue. Only the browser's `window.location` and the network `fetch` are
 * stubbed, so the assertions are about exactly what would leave the browser:
 *   - the Bearer token goes to same-origin /api/ paths and nowhere else
 *   - no session -> a synthetic 401 and NO network request
 *   - a server 401 triggers one refresh and one retry, no more
 *   - the caller's own headers and body survive
 *
 * Local database only. Synthetic user, removed afterward.
 */
import { makeUser, step, ensure, finish, cleanup } from './support'

const ORIGIN = 'http://localhost:3000'
;(globalThis as unknown as { window: unknown }).window = { location: { origin: ORIGIN } }

type Sent = { url: string; headers: Headers; body?: BodyInit | null }
let sent: Sent[] = []
let script: number[] = [] // status codes the fake network returns, in order

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  // Calls to the local auth server (session refresh) must still work.
  if (!url.startsWith(ORIGIN) && !url.startsWith('/')) return realFetch(input, init)
  sent.push({ url, headers: new Headers(init?.headers), body: init?.body })
  return new Response('{}', { status: script.shift() ?? 200 })
}) as typeof fetch

async function main() {
  const { authFetch } = await import('../../src/lib/auth-fetch')
  const { supabase } = await import('../../src/lib/supabase-client')
  const user = await makeUser('browser', 'admin')
  const reset = (...codes: number[]) => { sent = []; script = codes }

  await step('no session -> synthetic 401 and no request leaves the browser', async () => {
    await supabase.auth.signOut()
    reset(200)
    const res = await authFetch('/api/general-ledger')
    ensure(res.status === 401, `got ${res.status}`)
    ensure((await res.json()).error, 'synthetic 401 has no error message')
    ensure(sent.length === 0, `${sent.length} request(s) were sent without a session`)
  })

  const { error } = await supabase.auth.setSession({ access_token: user.token, refresh_token: user.refreshToken })
  ensure(!error, `could not establish the session: ${error?.message}`)

  await step('with a session, the Bearer token is attached to a same-origin /api/ call', async () => {
    reset(200)
    const res = await authFetch('/api/general-ledger?page=1')
    const { data } = await supabase.auth.getSession()
    ensure(res.status === 200 && sent.length === 1, `status ${res.status}, ${sent.length} request(s)`)
    ensure(sent[0].headers.get('authorization') === `Bearer ${data.session?.access_token}`, 'wrong or missing Authorization header')
  })

  for (const target of ['https://evil.example/api/general-ledger', '//evil.example/api/general-ledger', '/dashboard', '/not-api/x', 'http://localhost:3001/api/x']) {
    await step(`refuses ${target} and sends nothing`, async () => {
      reset(200)
      let threw = false
      try { await authFetch(target) } catch { threw = true }
      ensure(threw, 'did not throw')
      ensure(sent.length === 0, `a request was sent to ${target}`)
    })
  }

  await step('the caller\'s headers, method and body are preserved', async () => {
    reset(200)
    await authFetch('/api/general-ledger', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Probe': '1' }, body: '{"a":1}' })
    const h = sent[0].headers
    ensure(h.get('content-type') === 'application/json' && h.get('x-probe') === '1', 'custom headers lost')
    ensure(h.get('authorization')?.startsWith('Bearer '), 'token missing')
    ensure(sent[0].body === '{"a":1}', 'body changed')
  })

  await step('a server 401 refreshes the session once and retries once', async () => {
    reset(401, 200)
    const res = await authFetch('/api/general-ledger')
    ensure(res.status === 200, `got ${res.status}`)
    ensure(sent.length === 2, `${sent.length} request(s) instead of 2`)
  })

  await step('a 401 that persists after the refresh is returned, not retried forever', async () => {
    reset(401, 401, 401)
    const res = await authFetch('/api/general-ledger')
    ensure(res.status === 401, `got ${res.status}`)
    ensure(sent.length === 2, `${sent.length} requests`)
  })

  await step('a non-401 error is returned untouched, with no refresh or retry', async () => {
    reset(500)
    const res = await authFetch('/api/general-ledger')
    ensure(res.status === 500 && sent.length === 1, `status ${res.status}, ${sent.length} request(s)`)
  })

  await supabase.auth.signOut()
  await finish('auth-fetch')
}

main().catch(async (e) => {
  console.error('FAILED:', e.message)
  await cleanup()
  process.exit(1)
})
