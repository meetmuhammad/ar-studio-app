/**
 * RFC 4180 CSV serialisation.
 *
 * The previous export built rows by hand with template literals and only
 * escaped double quotes. Any `particulars` or `notes` value containing a comma
 * or a newline -- both routine in free-text notes -- shifted every later column
 * of that row, so the file opened but the data in it was wrong.
 */

export type CsvValue = string | number | null | undefined

/**
 * Spreadsheets execute a cell whose text begins with `=`, `+`, `-`, `@`, or a
 * control character. A vendor named `=HYPERLINK(...)` is a stored payload that
 * fires when an admin opens the export. Prefixing with an apostrophe is the
 * standard neutralisation and is invisible in the spreadsheet's cell display.
 *
 * Only `string` values are guarded. Numbers are emitted as-is so that a
 * negative balance stays a number rather than becoming the text `'-500`.
 */
function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : ''
  }

  const guarded = neutralizeFormula(value)
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

export function toCsvRow(values: readonly CsvValue[]): string {
  return values.map(escapeCsvField).join(',')
}

/**
 * `\r\n` line endings per RFC 4180, and a UTF-8 BOM so Excel on Windows reads
 * non-ASCII customer and vendor names correctly instead of as mojibake.
 */
export const UTF8_BOM = '﻿'

export function toCsv(
  headers: readonly string[],
  rows: Iterable<readonly CsvValue[]>
): string {
  const lines = [toCsvRow(headers)]
  for (const row of rows) lines.push(toCsvRow(row))
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}
