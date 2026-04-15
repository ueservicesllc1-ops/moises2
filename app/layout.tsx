import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ClientProviders from './ClientProviders'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Judith - AI Audio Separation',
  description: 'Separate vocals, drums, bass, and other instruments from any song using AI',
  keywords: 'audio separation, AI, music, stems, vocals, drums, bass',
  authors: [{ name: 'Judith Team' }],
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.className} antialiased`}>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
