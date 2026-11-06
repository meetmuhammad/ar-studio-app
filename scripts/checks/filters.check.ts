/**
 * Pure checks for the ledger date-range presets and the vendors category filter.
 *   npx tsx scripts/checks/filters.check.ts
 */
import assert from 'node:assert/strict'
import { resolvePreset, todayInBusinessZone, parseDateRangeSelection, selectionToBounds, toDateString } from '../../src/lib/date-range'
import { filterVendors, ALL_VENDOR_CATEGORIES } from '../../src/lib/vendor-filter'
import type { VendorWithCategory } from '../../src/lib/supabase-client'

let n = 0
const ok = (name: string, fn: () => void) => { fn(); n++; console.log(`PASS ${name}`) }

ok('this_month covers the whole month', () => assert.deepEqual(resolvePreset('this_month', '2026-02-14'), { start: '2026-02-01', end: '2026-02-28' }))
ok('this_year covers the whole year', () => assert.deepEqual(resolvePreset('this_year', '2026-11-06'), { start: '2026-01-01', end: '2026-12-31' }))
ok('last_3_months is rolling, ends today', () => assert.deepEqual(resolvePreset('last_3_months', '2026-08-17'), { start: '2026-05-18', end: '2026-08-17' }))
ok('last_3_months clamps month ends', () => assert.deepEqual(resolvePreset('last_3_months', '2026-05-31'), { start: '2026-03-01', end: '2026-05-31' }))
ok('all_time has no bounds', () => assert.deepEqual(selectionToBounds({ preset: 'all_time' }), {}))
ok('today is Karachi, not UTC (23:30 UTC = next day PKT)', () => assert.equal(todayInBusinessZone(new Date('2026-10-31T23:30:00Z')), '2026-11-01'))
ok('toDateString uses local calendar date', () => assert.equal(toDateString(new Date(2026, 10, 1)), '2026-11-01'))
ok('saved custom keeps valid dates only', () => assert.deepEqual(parseDateRangeSelection({ preset: 'custom', start: '2026-02-30', end: '2026-03-01' }), { preset: 'custom', start: undefined, end: '2026-03-01' }))
ok('saved junk is ignored', () => { assert.equal(parseDateRangeSelection({ preset: 'forever' }), null); assert.equal(parseDateRangeSelection('x'), null) })
ok('saved preset drops stale dates', () => assert.deepEqual(parseDateRangeSelection({ preset: 'this_month', start: '2020-01-01' }), { preset: 'this_month' }))

const cat = (id: string, name: string) => ({ id, name, created_at: '', updated_at: '' })
const v = (id: string, name: string, c: ReturnType<typeof cat> | null, notes?: string) =>
  ({ id, name, notes, category_id: c?.id ?? null, vendor_categories: c, created_at: '', updated_at: '' }) as VendorWithCategory
const fabric = cat('c1', 'Fabric'), tailoring = cat('c2', 'Tailoring')
const vendors = [v('1', 'Ali Textiles', fabric), v('2', 'Bilal Stitch', tailoring, 'also sells fabric'), v('3', 'Chand', null), v('4', 'Dua Fabrics', fabric)]
const ids = (r: VendorWithCategory[]) => r.map((x) => x.id)

ok('All shows every vendor', () => assert.deepEqual(ids(filterVendors(vendors, { categoryId: ALL_VENDOR_CATEGORIES })), ['1', '2', '3', '4']))
ok('category filter', () => assert.deepEqual(ids(filterVendors(vendors, { categoryId: 'c1' })), ['1', '4']))
ok('searching a category name == choosing it', () => {
  for (const q of ['Fabric', 'fabric', '  FABRIC ']) assert.deepEqual(ids(filterVendors(vendors, { search: q })), ids(filterVendors(vendors, { categoryId: 'c1' })))
  assert.deepEqual(ids(filterVendors(vendors, { search: 'tailoring' })), ids(filterVendors(vendors, { categoryId: 'c2' })))
})
ok('partial search still matches name/notes/category', () => assert.deepEqual(ids(filterVendors(vendors, { search: 'fab' })), ['1', '2', '4']))
ok('category + search combine', () => assert.deepEqual(ids(filterVendors(vendors, { categoryId: 'c2', search: 'fabric' })), []))

ok('an empty category name searches to 0, like its filter (D1)', () => {
  const w4 = cat('c3', 'W4 Charity'), charity = cat('c4', 'Charity'), oldOne = cat('c5', 'Old Supplies')
  const vs = [...vendors, v('5', 'Hope Trust', w4)]
  const all = [fabric, tailoring, w4, charity, oldOne]
  for (const c of all) {
    for (const q of [c.name, `  ${c.name.toUpperCase()} `]) {
      assert.deepEqual(ids(filterVendors(vs, { search: q, categories: all })), ids(filterVendors(vs, { categoryId: c.id })), c.name)
    }
  }
  assert.deepEqual(ids(filterVendors(vs, { search: 'Charity', categories: all })), [])
  assert.deepEqual(ids(filterVendors(vs, { search: 'charit', categories: all })), ['5'])
})

console.log(`\n${n} checks passed`)
