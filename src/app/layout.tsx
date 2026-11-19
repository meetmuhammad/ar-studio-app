import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Manrope } from "next/font/google";
import localFont from "next/font/local";
import { BRAND } from '@/lib/brand'
import "./globals.css";
import { AuthProvider } from '@/contexts/auth-context'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { QueryProvider } from '@/components/providers/query-provider'
import { RefineProvider } from '@/components/providers/refine-provider'
import { ColorModeProvider } from '@/components/providers/color-mode-provider'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { Toaster } from '@/components/ui/sonner'

// Manrope for headings: geometric-humanist, gives titles a distinct cut from
// body copy so hierarchy comes from proportion rather than size.
// Variable names must not collide with Tailwind's own theme keys (--font-sans,
// --font-heading): `--font-sans: var(--font-sans)` is self-referential and
// silently falls back to the default system stack.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600"],
});

// Inter for body/UI: the neutral workhorse at small sizes.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Geist Mono stays for all numerics — tabular figures for money and IDs.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Josefin Sans (thin geometric) for BRAND TEXT ONLY: the sidebar name and the
// sign-in heading, through the `.brand-font` class. UI text stays Inter.
// Self-hosted (latin subset, SIL Open Font License: src/fonts/josefin-sans/OFL.txt)
// so the build does not fetch it from Google Fonts.
const josefin = localFont({
  variable: "--font-brand",
  display: "swap",
  src: [
    { path: "../fonts/josefin-sans/josefin-sans-latin-300-normal.woff2", weight: "300", style: "normal" },
    { path: "../fonts/josefin-sans/josefin-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  // Home-screen install on iOS/iPadOS. "default" keeps the status bar opaque and
  // readable in both light and dark themes (black-translucent would put white
  // status text over the light theme's header).
  appleWebApp: { capable: true, title: BRAND.shortName, statusBarStyle: "default" },
  // favicon.ico comes from src/app/favicon.ico (Next file convention).
  icons: {
    icon: [
      { url: BRAND.assets.favicon32, sizes: "32x32", type: "image/png" },
      { url: BRAND.assets.favicon16, sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: BRAND.assets.appleTouchIcon, sizes: "180x180" }],
  },
};

// Zoom stays enabled (no maximumScale / userScalable). viewport-fit=cover lets
// the layout use the full screen and handle notches and the home indicator with
// env(safe-area-inset-*); the dashboard shell and sign-in page apply those.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: BRAND.colors.black },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${manrope.variable} ${geistMono.variable} ${josefin.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        {/* antd styles go into @layer antd (ordered in globals.css between
            Tailwind's base and utilities), so preflight cannot override them. */}
        <AntdRegistry layer>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>
              <AuthProvider>
                <ColorModeProvider>
                  <RefineProvider>{children}</RefineProvider>
                </ColorModeProvider>
                <Toaster />
              </AuthProvider>
            </QueryProvider>
          </ThemeProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
