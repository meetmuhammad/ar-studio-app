# Ahsan Tariq Studio - Theming

The app is Refine + Ant Design (see `docs/REFINE.md`). Its look comes from three places:

| What | Where |
| --- | --- |
| Brand: name ("Ahsan Tariq Studio", short "ATS"), asset paths, black and gold, accent per theme | `src/lib/brand.ts` |
| antd theme: accent (`ACCENT`), light/dark algorithm, component tokens | `src/lib/refine/theme.ts` |
| Fonts and the few global rules (`.brand-font`, legacy CSS variables for the OAuth consent page) | `src/app/layout.tsx`, `src/app/globals.css` |

## Brand

- **Colours:** brand black `#0B0B0B` and gold `#D4AF37` for artwork, icons, the PWA splash and the
  dark status bar.
- **Accent (antd `colorPrimary` / `colorLink`):** gold, a different shade per theme so it stays
  readable:
  - light: `#8A6A12` with white text on primary buttons (5.06:1; as a link 5.06:1 on white,
    4.61:1 on the page grey);
  - dark: `#D4AF37` with `#141414` text on primary buttons (8.76:1; as a link 8.76:1 on `#141414`,
    9.99:1 on black).
  Check after any change: `node scripts/brand/contrast.mjs` (reads `src/lib/brand.ts`, exits 1 on a failure).
- **Fonts:** Inter for all UI text; Josefin Sans (light weights) only for brand text, through the
  `.brand-font` class (sidebar fallback name, sign-in heading); Geist Mono for numbers.
  Josefin Sans is self-hosted with `next/font/local` (weights 300 and 400, latin subset) from
  `src/fonts/josefin-sans/`, so builds never fetch it. It is licensed under the **SIL Open Font
  License 1.1**; the licence text ships next to the files (`src/fonts/josefin-sans/OFL.txt`) and must
  stay with them.
- **Artwork:** originals in `brand-src/`, generated files in `public/brand/` and `public/icons/`
  (`npm run brand:assets`, see `brand-src/README.md`).

## Light and dark

`next-themes` holds the choice (saved in `localStorage`, follows the system until changed) and sets
the `dark` class; `ColorModeProvider` passes the mode to antd (`theme.darkAlgorithm` /
`theme.defaultAlgorithm`). The header toggle switches both. The sidebar wordmark and the sign-in
wordmark switch between `wordmark.png` and `wordmark-dark.png` with the mode.

## Changing the accent

Edit `accentLight` / `accentDark` (and `onAccentLight` / `onAccentDark`) in `src/lib/brand.ts`, run
`node scripts/brand/contrast.mjs`, and check a primary button, a link, the selected menu item and a
chart in both themes. Nothing else hardcodes the accent: tables, buttons, links, tags, focus rings and
charts read the antd token.
