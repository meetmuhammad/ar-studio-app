import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter, Manrope } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '@/contexts/auth-context'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { QueryProvider } from '@/components/providers/query-provider'
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

export const metadata: Metadata = {
  title: "AR Studio Dashboard",
  description: "Customer & Order Management System",
  applicationName: "AR Studio",
  // Home-screen install on iOS/iPadOS. "default" keeps the status bar opaque and
  // readable in both light and dark themes (black-translucent would put white
  // status text over the light theme's header).
  appleWebApp: { capable: true, title: "AR Studio", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};

// Zoom stays enabled (no maximumScale / userScalable). viewport-fit=cover lets
// the layout use the full screen and handle notches and the home indicator with
// env(safe-area-inset-*); the dashboard shell and sign-in page apply those.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0d" },
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
        className={`${inter.variable} ${manrope.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning={true}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
