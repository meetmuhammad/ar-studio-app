/**
 * The guard that stands between a seed script and the client's production database.
 *
 * These tests exist because the failure they prevent is unrecoverable: seeding
 * fabricated customers into a live bookkeeping system. Every branch of
 * resolveTarget() is covered, including the ones that look paranoid.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveTarget, projectRefFromUrl, PRODUCTION_REF } from '../../scripts/lib/env-guard'

const PROD_URL = `https://${PRODUCTION_REF}.supabase.co`

describe('projectRefFromUrl', () => {
  it('extracts the ref from a Supabase URL', () => {
    expect(projectRefFromUrl('https://abcdefghijklmnop.supabase.co')).toBe('abcdefghijklmnop')
  })

  it('returns null for localhost', () => {
    expect(projectRefFromUrl('http://localhost:54321')).toBeNull()
    expect(projectRefFromUrl('http://127.0.0.1:54321')).toBeNull()
  })

  it('returns null for garbage rather than throwing', () => {
    expect(projectRefFromUrl('not a url')).toBeNull()
    expect(projectRefFromUrl('')).toBeNull()
  })
})

describe('resolveTarget', () => {
  const originalStagingRef = process.env.STAGING_PROJECT_REF

  beforeEach(() => {
    delete process.env.STAGING_PROJECT_REF
  })

  afterEach(() => {
    if (originalStagingRef === undefined) delete process.env.STAGING_PROJECT_REF
    else process.env.STAGING_PROJECT_REF = originalStagingRef
  })

  it('identifies the local stack by hostname', () => {
    expect(resolveTarget('http://127.0.0.1:54321').target).toBe('LOCAL')
    expect(resolveTarget('http://localhost:54321').target).toBe('LOCAL')
  })

  it('identifies PRODUCTION by the hardcoded ref', () => {
    const info = resolveTarget(PROD_URL)
    expect(info.target).toBe('PRODUCTION')
    expect(info.ref).toBe(PRODUCTION_REF)
  })

  it('identifies PRODUCTION even when STAGING_PROJECT_REF is set to it', () => {
    // Production is checked BEFORE staging on purpose: a mis-set staging ref
    // must never be able to unlock writes to production.
    process.env.STAGING_PROJECT_REF = PRODUCTION_REF
    expect(resolveTarget(PROD_URL).target).toBe('PRODUCTION')
  })

  it('identifies STAGING only when the ref matches STAGING_PROJECT_REF', () => {
    process.env.STAGING_PROJECT_REF = 'stagingrefxxxxxxxxxx'
    expect(resolveTarget('https://stagingrefxxxxxxxxxx.supabase.co').target).toBe('STAGING')
  })

  it('treats an unrecognised project as UNKNOWN, not safe (default-deny)', () => {
    const info = resolveTarget('https://someotherproject.supabase.co')
    expect(info.target).toBe('UNKNOWN')
    expect(info.ref).toBe('someotherproject')
  })

  it('treats a staging-looking ref as UNKNOWN when STAGING_PROJECT_REF is unset', () => {
    expect(resolveTarget('https://stagingrefxxxxxxxxxx.supabase.co').target).toBe('UNKNOWN')
  })

  it('treats a missing URL as UNKNOWN', () => {
    expect(resolveTarget(undefined).target).toBe('UNKNOWN')
    expect(resolveTarget('').target).toBe('UNKNOWN')
    expect(resolveTarget('   ').target).toBe('UNKNOWN')
  })

  it('treats a malformed URL as UNKNOWN', () => {
    expect(resolveTarget('https://').target).toBe('UNKNOWN')
    expect(resolveTarget('drdnqsjjxmqiklwfadmk').target).toBe('UNKNOWN')
  })

  it('never reports PRODUCTION as anything other than PRODUCTION', () => {
    // Guards against a future refactor quietly reclassifying prod.
    for (const variant of [
      PROD_URL,
      `${PROD_URL}/`,
      `${PROD_URL}/rest/v1`,
      `  ${PROD_URL}  `,
    ]) {
      expect(resolveTarget(variant).target).toBe('PRODUCTION')
    }
  })

  it('produces a printable label for every target', () => {
    process.env.STAGING_PROJECT_REF = 'stagingrefxxxxxxxxxx'
    for (const url of [
      'http://127.0.0.1:54321',
      PROD_URL,
      'https://stagingrefxxxxxxxxxx.supabase.co',
      'https://mystery.supabase.co',
      '',
    ]) {
      expect(resolveTarget(url).label.length).toBeGreaterThan(0)
    }
  })
})
