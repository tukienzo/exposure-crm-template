import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { PwaShell } from '@/components/pwa-shell'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'
import { BRAND } from "@/lib/brand"

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' })

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: `${BRAND.name} | CRM`,
  description: BRAND.description,
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND.name,
  },
  icons: {
    icon: [{ url: '/icon.svg?v=2', type: 'image/svg+xml', sizes: 'any' }],
    shortcut: '/icon.svg?v=2',
    apple: '/apple-icon.png',
  },
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: appUrl,
    siteName: BRAND.name,
    title: `${BRAND.name} | CRM`,
    description: BRAND.description,
    images: [{
      url: '/opengraph-image',
      width: 1200,
      height: 630,
      alt: `${BRAND.name} | CRM`,
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} | CRM`,
    description: BRAND.description,
    images: ['/opengraph-image'],
  },
}

// viewportFit=cover habilita el uso de env(safe-area-inset-*) en CSS para
// respetar el notch/home indicator de iPhone cuando la app corre standalone
// (instalada desde Safari). userScalable=false porque es una app tipo
// dashboard, no contenido de lectura.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b0d14',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <PwaShell />
          {children}
          <Toaster
            richColors
            position="top-center"
            offset={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
            mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
          />
          {process.env.NODE_ENV === 'production' && process.env.VERCEL === '1' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
