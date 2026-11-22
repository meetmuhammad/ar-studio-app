/**
 * Locks the client-side Select matching (src/lib/refine/select-search.ts).
 * Run: node --import tsx --test src/lib/refine/select-search.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinSearchText, normalizeSearch, optionLabelFilter } from './select-search'

const vendors = ['AHSAN TARIQ BASICS', 'AJMAL UNCLE', 'ALI NEW', 'BILAL TR', 'nomi', 'PURCHASES', 'RAMZAN'].map((label) => ({ label, value: label }))
const visible = (input: string) => vendors.filter((o) => optionLabelFilter(input, o)).map((o) => o.label)

test('partial lower-case term finds the upper-case vendor', () => {
  assert.deepEqual(visible('purchas'), ['PURCHASES'])
  assert.deepEqual(visible('purc'), ['PURCHASES'])
  assert.deepEqual(visible('purchases'), ['PURCHASES'])
})

test('a single letter narrows to every label containing it', () => {
  assert.deepEqual(visible('p'), ['PURCHASES'])
  assert.deepEqual(visible('n'), ['AHSAN TARIQ BASICS', 'AJMAL UNCLE', 'ALI NEW', 'nomi', 'RAMZAN'])
})

test('case does not matter either way', () => {
  assert.deepEqual(visible('NOMI'), ['nomi'])
  assert.deepEqual(visible('PuRcHaSeS'), ['PURCHASES'])
})

test('surrounding whitespace is ignored, inner whitespace is kept', () => {
  assert.deepEqual(visible('  purchas  '), ['PURCHASES'])
  assert.deepEqual(visible('\tali new\n'), ['ALI NEW'])
  assert.deepEqual(visible('alinew'), [])
})

test('empty or blank term shows everything', () => {
  assert.equal(visible('').length, vendors.length)
  assert.equal(visible('   ').length, vendors.length)
})

test('no match hides everything', () => {
  assert.deepEqual(visible('zzz'), [])
})

test('searchText matches fields that are not in the label (phone, notes)', () => {
  const o = { label: 'PURCHASES', value: '1', searchText: joinSearchText('0300-1234567', null, 'Cloth bought for stock', undefined) }
  assert.equal(optionLabelFilter('1234', o), true)
  assert.equal(optionLabelFilter('cloth', o), true)
  assert.equal(optionLabelFilter('null', o), false)
  assert.equal(optionLabelFilter('undefined', o), false)
})

test('missing option or non-text label never throws', () => {
  assert.equal(optionLabelFilter('a', undefined), false)
  assert.equal(optionLabelFilter('a', { label: { type: 'span' }, value: 1 }), false)
  assert.equal(optionLabelFilter('42', { label: 42, value: 42 }), true)
})

test('normalizeSearch', () => {
  assert.equal(normalizeSearch('  PurC '), 'purc')
  assert.equal(normalizeSearch(undefined), '')
})
