'use client'

import React from 'react'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { 
  BookOpen, 
  Mic, 
  Sliders, 
  Zap, 
  Music, 
  Layers, 
  Activity, 
  CheckCircle2, 
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Info
} from 'lucide-react'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export default function ManualPage() {
  return (
    <div className={`${inter.className} min-h-screen bg-[#060608] text-zinc-300 antialiased selection:bg-violet-500/30`}>
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-violet-600/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-cyan-500/5 blur-[120px]" />
      </div>

      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#060608]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white hover:text-violet-400 transition-colors group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Volver al inicio</span>
          </Link>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
            <BookOpen className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">Manual Oficial</span>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16 md:py-24 relative">
        {/* Header */}
        <header className="mb-16">
          <h1 className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight">
            Manual de <span className="bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-cyan-400">Judith</span>
          </h1>
          <p className="text-xl text-zinc-400 leading-relaxed max-w-2xl">
            La guía completa para dominar la separación de audio con inteligencia artificial y potenciar tu flujo creativo.
          </p>
        </header>

        {/* Section 1: ¿Qué es Judith? */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Info className="w-5 h-5 text-violet-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">1. ¿Qué es Judith?</h2>
          </div>
          <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-8 leading-relaxed text-zinc-400">
            <p className="mb-4">
              <strong className="text-white">Judith</strong> es una plataforma de vanguardia diseñada para la <span className="text-violet-300">separación de stems</span> (pistas individuales) y procesamiento de audio avanzado. Utilizando modelos de Deep Learning entrenados con millones de canciones, Judith puede entender y aislar los diferentes elementos que componen una obra musical.
            </p>
            <p>
              Nuestro objetivo es democratizar herramientas que antes solo estaban disponibles en estudios de grabación costosos, poniéndolas al alcance de cualquier músico con un navegador web.
            </p>
          </div>
        </section>

        {/* Section 2: Funcionalidades */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">2. ¿Qué hace Judith?</h2>
          </div>
          
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { 
                icon: Layers, 
                title: 'Separación de Stems', 
                desc: 'Aisla voces, batería, bajo, guitarras y otros instrumentos con una claridad sin precedentes.',
                color: 'violet'
              },
              { 
                icon: Sliders, 
                title: 'Mixer Profesional', 
                desc: 'Controla el volumen, paneo y efectos de cada pista por separado en tiempo real.',
                color: 'cyan'
              },
              { 
                icon: Activity, 
                title: 'Detección de Acordes', 
                desc: 'Analiza la armonía y detecta la tonalidad y los acordes de cualquier canción automáticamente.',
                color: 'emerald'
              },
              { 
                icon: Music, 
                title: 'Ajuste de Tempo', 
                desc: 'Cambia la velocidad de reproducción sin alterar el tono, ideal para practicar.',
                color: 'amber'
              }
            ].map((item, idx) => (
              <div key={idx} className="group p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all">
                <item.icon className="w-8 h-8 mb-4 text-zinc-500 group-hover:text-white transition-colors" />
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Público Objetivo */}
        <section className="mb-20">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-white">3. ¿A quién va dirigido?</h2>
          </div>
          
          <div className="space-y-4">
            {[
              { role: 'Productores', use: 'Para extraer samples limpios y estudiar técnicas de mezcla.' },
              { role: 'DJs & Remixers', use: 'Para crear acapellas e instrumentales exclusivas para sus sets.' },
              { role: 'Músicos', use: 'Para practicar quitando su instrumento de la canción original.' },
              { role: 'Estudiantes', use: 'Para ralentizar pasajes difíciles y aprender canciones por oído.' }
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-white/[0.01] border border-white/5">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <div>
                  <span className="font-bold text-white mr-2">{item.role}:</span>
                  <span className="text-sm">{item.use}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="mt-24 p-12 rounded-[40px] bg-gradient-to-br from-violet-600/20 to-cyan-600/20 border border-white/10 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(124,58,237,0.1),transparent)]" />
          <h2 className="text-3xl font-bold text-white mb-4 relative z-10">¿Listo para empezar?</h2>
          <p className="text-zinc-400 mb-8 relative z-10">Únete a la comunidad de músicos que ya están transformando su sonido.</p>
          <Link 
            href="/login" 
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-black font-bold hover:scale-105 transition-transform relative z-10"
          >
            Probar Judith Gratis <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <footer className="mt-32 pt-8 border-t border-white/5 text-center text-xs text-zinc-600">
          <p>© {new Date().getFullYear()} Judith Audio AI — Todos los derechos reservados.</p>
        </footer>
      </main>
    </div>
  )
}
