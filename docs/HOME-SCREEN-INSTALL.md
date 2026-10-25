# Add AR Studio to a phone or tablet home screen

AR Studio is a web app. These steps put its icon on the home screen so it opens full screen, like
an app, with no browser address bar. It is **not** a download from an app store, and the icon does
not appear on its own: each person has to add it once, on each device.

Open **https://ar-studio-app.vercel.app** in the browser first and sign in once to make sure it works.

## iPhone and iPad (Safari)

It must be **Safari**. Chrome and other iOS browsers can also add to the Home Screen on recent iOS,
but the steps below are the supported route.

1. Open the site in Safari.
2. Tap the **Share** button (the square with an arrow pointing up). On iPhone it is in the bottom bar;
   on iPad it is at the top right.
3. Scroll the list and tap **Add to Home Screen**.
4. Keep the name **AR Studio** (or change it) and tap **Add**.
5. Open the new **AR Studio** icon from the Home Screen.

## Android (Chrome)

1. Open the site in Chrome.
2. Tap the **⋮** menu at the top right.
3. Tap **Install app** (or **Add to Home screen** if you do not see "Install app").
4. Tap **Install**, then open **AR Studio** from the home screen or app drawer.

## What to expect

- **You may be asked to sign in again.** An installed app does not always share the browser's login.
  Sign in with the same account as usual. Staff and admin accounts see the same screens as in the browser.
- **It needs a connection.** There is no offline mode, on purpose: customer, order and ledger data is
  never stored on the device for offline use.
- **Signing out** is under **More** on a phone (the bottom bar) and in the sidebar on a tablet.
- **To remove it,** press and hold the icon like any other app and choose Remove (iOS) or Uninstall (Android).
- The icon is currently a plain gold "AR" on black. It is a **placeholder** until the final brand artwork
  is supplied; see `scripts/pwa/generate-icons.mjs`.

## For whoever maintains this

- The manifest is `src/app/manifest.ts` (served at `/manifest.webmanifest`); icons are in `public/icons/`.
- There is deliberately **no service worker**. Do not add one to "make the install better": it would put
  private data in a device cache. If caching is ever wanted, cache static assets only and never `/api/*`.
- Launch behaviour: `start_url` is `/`. Signed out goes to `/sign-in`; admin lands on the dashboard;
  staff are redirected to `/customers`.
- Manual device checks that no automated browser can do are listed in `docs/qa/mobile-responsive-report.md`.
