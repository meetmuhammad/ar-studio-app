# Brand originals

The owner's original artwork for **Ahsan Tariq Studio**. These files are committed so the
originals live with the code; everything the app serves is generated from them.

| File | What it is | Becomes |
| --- | --- | --- |
| `lion.png` | Gold low-poly lion mascot on a black background, roughly square | `public/brand/lion.png` (sign-in), `public/brand/lion-mark.png` (sidebar logo), the PWA icons in `public/icons/`, the Apple touch icon, the favicons and `src/app/favicon.ico` |
| `wordmark.png` | Thin gold geometric "AHSAN TARIQ" on a white background | `public/brand/wordmark.png` (gold on transparent, light theme) and `public/brand/wordmark-dark.png` (lighter gold, dark theme) |

After adding or replacing either file:

```
npm run brand:assets
```

The script (`scripts/brand/generate-assets.mjs`) trims the margins, removes the wordmark's white
background (keeping the thin strokes smooth), and writes every size. If a file is missing it writes
a placeholder ("ATS" monogram / "AHSAN TARIQ" text in gold) to the same paths and says so, so the
app always has something to show. Names, paths and colours are in `src/lib/brand.ts`.

Use the largest, cleanest versions available: PNG, at least 1024 px on the long side.
