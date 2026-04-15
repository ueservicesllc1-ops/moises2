import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Estudio — Judith',
  description: 'Separa y mezcla tus pistas con IA.',
}

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
