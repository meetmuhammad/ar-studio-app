/* eslint-disable @typescript-eslint/no-explicit-any -- test plumbing over untyped JSON and page.evaluate payloads */
/** npx tsx e2e/summarize.ts <phase> <engine>  -> compact findings table from the audit JSON. */
import fs from 'node:fs'
import path from 'node:path'
const [phase = 'after', engine = 'chromium'] = process.argv.slice(2)
const dir = path.join('qa-artifacts/audit', phase, engine)
let rows: any[] = []
for (const f of fs.readdirSync(dir)) rows = rows.concat(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
const bad = rows.filter((r) => r.docOverflow || r.offenders.length || r.brokenImages || r.consoleErrors.length || (r.unnamed ?? []).length)
console.log(`${phase}/${engine}: ${rows.length} page-states, ${bad.length} with layout/console issues, ${rows.filter((r) => r.docOverflow).length} with page-level horizontal overflow`)
const by: Record<string, any[]> = {}
for (const r of bad) (by[`${r.screen}/${r.role}`] ??= []).push(r)
for (const [k, v] of Object.entries(by)) {
  console.log(`\n${k}`)
  for (const r of v) console.log(`  ${r.viewport.padEnd(17)} overflow=${r.docOverflow ? `YES(${r.scrollWidth}>${r.clientWidth})` : 'no'} offenders=${r.offenders.length}${r.offenders[0] ? ` e.g. ${r.offenders[0]}` : ''}${r.consoleErrors[0] ? ` | console: ${r.consoleErrors[0]}` : ''}${(r.unnamed ?? [])[0] ? ` | UNNAMED: ${r.unnamed[0]}` : ''}`)
}
const touch = rows.filter((r) => r.w < 1024)
console.log(`\nundersized touch targets (<40px) at widths <1024: total ${touch.reduce((a, r) => a + r.smallTargets.count, 0)} across ${touch.length} states`)
const fr = rows.flatMap((r) => r.failedRequests.map((x: string) => `${r.screen}/${r.role}: ${x}`))
console.log(`failed/4xx requests: ${fr.length}`); for (const x of Array.from(new Set(fr)).slice(0, 8)) console.log('  ' + x)
