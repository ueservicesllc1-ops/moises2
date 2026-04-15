import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import JudithLanding from '@/components/landing/JudithLanding'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Judith — Separación de audio con IA para músicos',
  description:
    'Separa voces e instrumentos con IA, mixer profesional y control en tiempo real. Prueba gratis.',
  keywords: ['audio', 'separación', 'stems', 'IA', 'música', 'judith'],
}

export default function HomePage() {
  return (
    <div className={`${inter.className} antialiased text-white bg-[#0a0a0a]`}>
      <JudithLanding />
    </div>
  )
}
