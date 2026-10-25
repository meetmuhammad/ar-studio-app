import fs from 'node:fs'
import path from 'node:path'

/** Refuse to drive a browser at anything but the local Supabase stack. */
export function assertLocalTarget(): string {
  const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
  const url = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(env)?.[1]?.trim() ?? ''
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) {
    throw new Error(`e2e must target the local database, .env.local points at ${url || '(unset)'}`)
  }
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(base)) {
    throw new Error(`e2e base URL must be local, got ${base}`)
  }
  return url
}
