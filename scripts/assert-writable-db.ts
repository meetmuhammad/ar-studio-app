/**
 * Refuses to let a write script run against the production database.
 *
 * CLAUDE.md has long claimed the seed scripts "refuse to run against
 * production". They did not -- every one of them read
 * NEXT_PUBLIC_SUPABASE_URL and wrote wherever it pointed. Since the Supabase
 * CLI in this repo is linked to production, one stale export away was
 * `npm run seed` dropping synthetic customers into the real books.
 *
 * Allowed: local Docker, and the staging project. Everything else -- the
 * production ref, or any host this file does not recognise -- stops here,
 * because an unrecognised remote is precisely the case where you cannot know
 * what you are about to overwrite.
 */
const PRODUCTION_REF = 'drdnqsjjxmqiklwfadmk'
const STAGING_REF = 'ohgqgkraybpvnfdbgmvl'

export function assertWritableDb(action: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

  if (!url) {
    throw new Error(`${action}: NEXT_PUBLIC_SUPABASE_URL is not set — refusing to guess a target.`)
  }

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/.test(url)
  if (isLocal) {
    console.log(`TARGET DATABASE: LOCAL — ${url}`)
    return url
  }

  if (url.includes(PRODUCTION_REF)) {
    throw new Error(
      `${action}: REFUSING — this targets PRODUCTION (${PRODUCTION_REF}), the real business records.\n` +
        `Point NEXT_PUBLIC_SUPABASE_URL at local Docker or staging and run it again.`,
    )
  }

  if (url.includes(STAGING_REF)) {
    console.log(`TARGET DATABASE: STAGING — ${STAGING_REF}`)
    return url
  }

  throw new Error(
    `${action}: REFUSING — unrecognised database host: ${url}\n` +
      `Only local Docker and staging (${STAGING_REF}) accept writes from these scripts.`,
  )
}
