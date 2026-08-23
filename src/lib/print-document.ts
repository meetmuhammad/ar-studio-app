/**
 * The studio's print stylesheet and document shell.
 *
 * Print opens in a detached `window.open` document, so none of the app's tokens,
 * fonts, or Tailwind build reach it. The previous version papered over that by
 * pulling `https://cdn.tailwindcss.com` into every print window, which meant a
 * receipt printed unstyled whenever the shop's connection was down — and the
 * Play CDN is explicitly not built for production use. Everything below is
 * inline and local: no network request stands between a customer and their
 * receipt.
 *
 * Paper is a fixed white surface, so this palette is deliberately not themed.
 * It is the one place in the project where colours are literal rather than
 * token-driven.
 */

/** Space reserved at the top of page one for the studio's pre-printed letterhead. */
const LETTERHEAD_OFFSET = '120px'

const STYLESHEET = `
  :root {
    --ink: #111827;
    --ink-soft: #4b5563;
    --rule: #9ca3af;
    --rule-strong: #4b5563;
    --fill: #f3f4f6;
    --paper: #ffffff;
    --debit: #15803d;
    --credit: #b91c1c;
    --over: #b45309;
  }

  *, *::before, *::after { box-sizing: border-box; }

  html { -webkit-text-size-adjust: 100%; }

  body {
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.35;
  }

  .sheet {
    max-width: 42rem;
    margin: 0 auto;
    padding: 24px;
    background: var(--paper);
  }

  /* Page one starts below the pre-printed letterhead. */
  .sheet--letterhead { margin-top: ${LETTERHEAD_OFFSET}; margin-bottom: 48px; }

  /* ── Type ─────────────────────────────────────────────────────────────── */

  .doc-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16px;
    padding-bottom: 8px;
    margin-bottom: 14px;
    border-bottom: 1px solid var(--rule-strong);
  }

  .doc-title { font-size: 13pt; font-weight: 600; margin: 0; letter-spacing: -0.01em; }

  .doc-ref { text-align: right; }

  .doc-ref__number {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-size: 11pt;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .doc-ref__stamp { margin: 2px 0 0; font-size: 7.5pt; color: var(--ink-soft); }

  .section { margin-bottom: 14px; }

  .section__title {
    margin: 0 0 5px;
    font-size: 8.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
  }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  /* ── Field lists ──────────────────────────────────────────────────────── */

  .panel { padding: 8px 10px; background: var(--fill); border-radius: 4px; }

  .field { display: flex; justify-content: space-between; gap: 12px; font-size: 8.5pt; }
  .field + .field { margin-top: 3px; }
  .field__label { font-weight: 600; white-space: nowrap; }
  .field__value { text-align: right; }
  .field__value--mono {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
  }

  .note { margin: 0; font-size: 8.5pt; white-space: pre-wrap; }

  /* ── Tables ───────────────────────────────────────────────────────────── */

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
  }

  th, td {
    /* Hairlines, not the 1-2px slabs this used to draw: at print resolution a
       heavy rule competes with the figures it is supposed to separate. */
    border: 0.5pt solid var(--rule);
    padding: 4px 6px;
    text-align: left;
    vertical-align: top;
  }

  thead th {
    background: var(--fill);
    font-weight: 700;
    font-size: 8pt;
    white-space: nowrap;
  }

  tfoot td { background: var(--fill); font-weight: 700; }

  .num {
    text-align: right;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .center { text-align: center; }
  .capitalize { text-transform: capitalize; }
  .wrap { white-space: pre-wrap; line-height: 1.25; }
  .empty { text-align: center; color: var(--ink-soft); }

  .amount--debit { color: var(--debit); }
  .amount--credit { color: var(--credit); }
  .amount--over { color: var(--over); }

  /* ── Screen-only preview chrome ───────────────────────────────────────── */

  @media screen {
    body { background: #e5e7eb; padding: 24px 16px 48px; }
    .sheet { box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 12px 32px rgba(0,0,0,0.12); }
    .toolbar {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 8px;
      z-index: 10;
    }
    .toolbar button {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 36px;
      padding: 0 14px;
      border: 1px solid transparent;
      border-radius: 6px;
      font: inherit;
      font-size: 9pt;
      font-weight: 600;
      cursor: pointer;
    }
    .toolbar button:focus-visible { outline: 2px solid #1d4ed8; outline-offset: 2px; }
    .toolbar .primary { background: #1f2937; color: #fff; }
    .toolbar .primary:hover { background: #111827; }
    .toolbar .secondary { background: #fff; color: #1f2937; border-color: var(--rule); }
    .toolbar .secondary:hover { background: #f9fafb; }
    .toolbar svg { width: 14px; height: 14px; }
  }

  /* ── Print ────────────────────────────────────────────────────────────── */

  @media print {
    @page { size: letter; margin: 0.4in; }

    body { background: #fff; padding: 0; font-size: 9.5pt; }

    .toolbar { display: none !important; }

    .sheet {
      max-width: none;
      margin: 0;
      padding: 0;
      box-shadow: none;
    }
    .sheet--letterhead { margin-top: ${LETTERHEAD_OFFSET}; margin-bottom: 48px; }

    /* Fills are structural here — they mark header and total rows — so they must
       survive the browser's default "don't print backgrounds". */
    thead th, tfoot td, .panel {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    tr, .panel, .doc-head { break-inside: avoid; }
    thead { display: table-header-group; }
  }
`

/**
 * Inline SVG rather than an emoji glyph: 🖨️ renders as a different picture on
 * every OS, and on some Linux print stations as a blank box.
 */
const ICON_PRINT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>'

const ICON_CLOSE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'

const TOOLBAR = `
  <div class="toolbar">
    <button type="button" class="primary" onclick="window.print()">${ICON_PRINT} Print</button>
    <button type="button" class="secondary" onclick="window.close()">${ICON_CLOSE} Close</button>
  </div>
`

export interface PrintDocumentOptions {
  /** Becomes the window and print-job title, so it names the saved PDF too. */
  title: string
  /** Pre-rendered sheet markup. */
  body: string
  /** `preview` shows toolbar chrome; `print` opens the print dialog immediately. */
  mode: 'preview' | 'print'
}

function buildDocument({ title, body, mode }: PrintDocumentOptions): string {
  const autoPrint =
    mode === 'print'
      ? `<script>
          window.addEventListener('load', function () {
            window.onafterprint = function () { window.close() }
            window.print()
          })
        </script>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>${STYLESHEET}</style>
</head>
<body>
  ${mode === 'preview' ? TOOLBAR : ''}
  ${body}
  ${autoPrint}
</body>
</html>`
}

/**
 * Opens a print window and writes the document into it.
 *
 * Returns false when the browser blocked the popup, so the caller can report it
 * through the app's own toast rather than a native `alert()` the user has to
 * dismiss before they can act on it.
 */
export function openPrintWindow(options: PrintDocumentOptions): boolean {
  const printWindow = window.open('', '_blank', 'width=860,height=700')
  if (!printWindow) return false

  printWindow.document.write(buildDocument(options))
  printWindow.document.close()
  return true
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
