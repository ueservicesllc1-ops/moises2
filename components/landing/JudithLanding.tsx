'use client'

import React, { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Mic,
  Sliders,
  Zap,
  Play,
  Pause,
  ChevronDown,
  Music,
  Layers,
  Activity,
  ArrowRight,
  Star,
  Check,
  Wand2,
  Radio,
  Headphones,
} from 'lucide-react'

/* ─────────────────────────────────── helpers ─────────────────────────────── */

function useAnimationFrame(cb: (t: number) => void) {
  const ref = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  useEffect(() => {
    function loop(now: number) {
      if (startRef.current === null) startRef.current = now
      cb(now - startRef.current)
      ref.current = requestAnimationFrame(loop)
    }
    ref.current = requestAnimationFrame(loop)
    return () => { if (ref.current) cancelAnimationFrame(ref.current) }
  }, [cb])
}

/* animated waveform bars */
function WaveformBars({ color = '#a78bfa', barCount = 48, height = 56 }: { color?: string; barCount?: number; height?: number }) {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: barCount }, (_, i) =>
    Math.sin(i * 0.4) * 0.3 + 0.5
  ))

  const cbRef = useRef((t: number) => {
    setBars(Array.from({ length: barCount }, (_, i) => {
      const v = Math.sin(i * 0.4 + t * 0.002) * 0.35 + Math.sin(i * 0.13 + t * 0.001) * 0.15 + 0.5
      return Math.max(0.05, Math.min(1, v))
    }))
  })
  useAnimationFrame(cbRef.current)

  return (
    <div className="flex items-center gap-[2px]" style={{ height }}>
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-full transition-all duration-75"
          style={{ height: `${h * 100}%`, background: color, opacity: 0.75 + h * 0.25 }}
        />
      ))}
    </div>
  )
}

/* stem track row */
function StemTrack({ label, color, progress, delay = 0 }: { label: string; color: string; progress: number; delay?: number }) {
  return (
    <div className="flex items-center gap-3 group" style={{ animationDelay: `${delay}ms` }}>
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 group-hover:text-white transition-colors">
        {label}
      </span>
      <div className="flex-1 h-8 rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06] relative">
        <div className="absolute inset-0 flex items-center px-2">
          <WaveformBars color={color} barCount={60} height={24} />
        </div>
        <div
          className="absolute left-0 top-0 h-full rounded-lg opacity-20"
          style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
        />
      </div>
      <div className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center border border-white/10 hover:border-white/30 cursor-pointer transition-all hover:scale-110"
        style={{ background: `${color}22` }}>
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
      </div>
    </div>
  )
}

/* ─────────────────────────────── testimonial data ─────────────────────────── */
const TESTIMONIALS = [
  {
    name: 'Carlos Mendoza',
    role: 'Productor Musical',
    avatar: 'CM',
    text: 'Judith cambió mi flujo de trabajo completamente. Separo voces en segundos que antes me llevaban horas.',
    stars: 5,
    color: '#7c3aed',
  },
  {
    name: 'Laura Vásquez',
    role: 'DJ & Remixera',
    avatar: 'LV',
    text: 'Calidad de separación increíble. Uso Judith para cada remix y los clientes no pueden creer los resultados.',
    stars: 5,
    color: '#0ea5e9',
  },
  {
    name: 'Marcos Reyes',
    role: 'Músico de Estudio',
    avatar: 'MR',
    text: 'El control de tempo y tono sin perder calidad es lo que necesitaba para tocar en vivo. ¡Impresionante!',
    stars: 5,
    color: '#10b981',
  },
]

/* ─────────────────────────────── features data ─────────────────────────────── */
const FEATURES = [
  {
    icon: Mic,
    title: 'Separación de stems con IA',
    desc: 'Aisla voces, batería, bajo, guitarra y más con modelos de IA de última generación. Calidad de estudio en segundos.',
    color: '#7c3aed',
    glow: 'rgba(124,58,237,0.3)',
  },
  {
    icon: Sliders,
    title: 'Mixer profesional integrado',
    desc: 'Controla volumen, paneo, efectos y ecualizador de cada stem en tiempo real con una interfaz diseñada para músicos.',
    color: '#0ea5e9',
    glow: 'rgba(14,165,233,0.3)',
  },
  {
    icon: Activity,
    title: 'Detección de acordes y BPM',
    desc: 'Analiza automáticamente la tonalidad, acordes y tempo de cualquier canción con precisión profesional.',
    color: '#10b981',
    glow: 'rgba(16,185,129,0.3)',
  },
  {
    icon: Wand2,
    title: 'Ajuste de tempo y tono',
    desc: 'Cambia la velocidad o el tono sin artefactos usando tecnología SoundTouch adaptada para actuaciones en vivo.',
    color: '#f59e0b',
    glow: 'rgba(245,158,11,0.3)',
  },
  {
    icon: Radio,
    title: 'Modo Live sin latencia',
    desc: 'Diseñado para el escenario. Prepara tu set en segundos, toca con pistas separadas con latencia ultrabaja.',
    color: '#ec4899',
    glow: 'rgba(236,72,153,0.3)',
  },
  {
    icon: Headphones,
    title: 'Escucha y descarga en HD',
    desc: 'Exporta cada stem en WAV sin comprimir o escucha en el navegador con visualización de forma de onda en tiempo real.',
    color: '#6366f1',
    glow: 'rgba(99,102,241,0.3)',
  },
]

/* ═══════════════════════════════ MAIN COMPONENT ═══════════════════════════ */
export default function JudithLanding() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[#060608] text-white overflow-x-hidden selection:bg-violet-500/30">

      {/* ══════════════════════ NAVBAR ══════════════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-50"
        style={{ background: 'rgba(6,6,8,0.6)', backdropFilter: 'blur(24px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-[68px] flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/images/logo.png"
              alt="Judith"
              width={140}
              height={36}
              className="h-8 md:h-9 w-auto object-contain object-left"
              priority
            />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-[14px] font-medium text-zinc-400">
            {[['Inicio', '/'], ['Características', '#features'], ['Precios', '#planes'], ['Contacto', '/contacto']].map(([label, href]) => (
              <Link key={label} href={href} className="hover:text-white transition-colors hover:drop-shadow-[0_0_8px_rgba(167,139,250,0.6)]">
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium text-zinc-300 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/[0.04] transition-all"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-semibold text-white transition-all hover:brightness-110 hover:scale-105"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.4)' }}
            >
              Probar gratis <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ══════════════════════ HERO — FULL BANNER ══════════════════════ */}
        <section className="relative min-h-[80vh] flex flex-col items-center justify-center overflow-hidden">

          {/* ── Banner image background ── */}
          <div className="absolute inset-0 bg-[#060608] overflow-hidden">
            {/* Contenedor de la imagen de la tablet */}
            <div className="absolute top-1/2 -translate-y-1/2 right-0 w-full lg:w-[75%] xl:w-[70%] h-[120vh]">
              <Image
                src="/putobanner.png"
                alt="Judith Studio — AI audio separation"
                fill
                className="object-contain object-center lg:object-right-center scale-[1.10] origin-center -translate-x-[5%]"
                priority
                quality={95}
              />
            </div>
            
            {/* Máscara pura y simple para fundir la izquierda (donde va el texto) con la foto */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-[#060608] via-[#060608]/95 to-transparent w-full md:w-[65%] lg:w-[50%]" />
            
            {/* Suavizado en la parte superior e inferior */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-[#060608] via-transparent to-[#060608] opacity-80" />

            {/* Suavizado al borde derecho extremo para que no haya un corte brusco */}
            <div className="absolute inset-y-0 right-0 w-[15%] pointer-events-none bg-gradient-to-l from-[#060608] to-transparent opacity-80" />
          </div>

          {/* ── Ambient color tints on top of banner ── */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full bg-violet-700/10 blur-[140px]" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-cyan-600/8 blur-[120px]" />
          </div>

          {/* ── Hero content ── */}
          <div className="relative z-10 w-full max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-24 pb-16 flex flex-col items-start text-left min-h-[75vh] justify-center">
            {/* Texto más a la izquierda sin márgenes extra para empujar a la derecha */}
            <div className="max-w-[440px] flex flex-col items-start">
              {/* pill badge */}
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-semibold text-violet-300 border border-violet-500/30 mb-5"
                style={{ background: 'rgba(124,58,237,0.14)', backdropFilter: 'blur(12px)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                IA de separación de audio de nueva generación
              </div>

              {/* Letras más pequeñas */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.08] mb-4 drop-shadow-[0_4px_32px_rgba(0,0,0,0.8)]">
                <span className="text-white">Separa tu música.</span>
                <br />
                <span
                  className="bg-clip-text text-transparent"
                  style={{ backgroundImage: 'linear-gradient(135deg, #c4b5fd 0%, #818cf8 40%, #38bdf8 75%, #34d399 100%)' }}
                >
                  Contrólalo todo.
                </span>
              </h1>

              <p className="text-sm md:text-base text-zinc-300 leading-relaxed max-w-[400px] mb-7 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
                Extrae voces, batería, bajo y más de cualquier canción con IA. Ajusta tempo y tono sin perder calidad. Listo para el estudio y el escenario.
              </p>

              <div className="flex flex-wrap items-center justify-start gap-3 mb-8">
                <Link
                  href="/login"
                  id="hero-cta-primary"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-bold text-white transition-all hover:scale-105 hover:brightness-110 active:scale-95"
                  style={{
                    background: 'linear-gradient(135deg,#7c3aed 0%,#4f46e5 50%,#06b6d4 100%)',
                    boxShadow: '0 0 50px rgba(124,58,237,0.5), inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}
                >
                  Empezar gratis <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  type="button"
                  id="hero-cta-demo"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-semibold text-white transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
                  }}
                >
                  <Play className="w-4 h-4 fill-white" /> Ver demo
                </button>
              </div>

              {/* trust badges */}
              <div className="flex flex-wrap items-center justify-start gap-x-5 gap-y-2 text-[12px] text-zinc-400">
                {['Sin tarjeta de crédito', '10 minutos gratis', 'Cancela cuando quieras', 'Calidad WAV sin pérdidas'].map((t) => (
                  <span key={t} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── Scroll indicator ── */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce opacity-50">
            <ChevronDown className="w-6 h-6 text-white" />
          </div>
        </section>

        {/* ══════════════════════ STATS STRIP ══════════════════════ */}
        <section className="py-16 border-y border-white/[0.05]" style={{ background: 'rgba(255,255,255,0.015)' }}>
          <div className="max-w-6xl mx-auto px-5 md:px-8 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '+50K', label: 'Músicos activos' },
              { value: '2M+', label: 'Canciones separadas' },
              { value: '99.2%', label: 'Uptime garantizado' },
              { value: '<30s', label: 'Tiempo promedio' },
            ].map(({ value, label }) => (
              <div key={label} className="group">
                <p className="text-3xl md:text-4xl font-black text-white mb-1 group-hover:scale-105 transition-transform"
                  style={{ filter: 'drop-shadow(0 0 20px rgba(167,139,250,0.4))' }}>
                  {value}
                </p>
                <p className="text-sm text-zinc-500">{label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════════ FEATURES GRID ══════════════════════ */}
        <section id="features" className="py-24 md:py-32 scroll-mt-20">
          <div className="max-w-7xl mx-auto px-5 md:px-8">
            <div className="text-center mb-16">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-4">Características</p>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
                Todo lo que un músico necesita
              </h2>
              <p className="text-lg text-zinc-500 max-w-xl mx-auto">
                Herramientas profesionales pensadas para artistas, productores y músicos en vivo.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(({ icon: Icon, title, desc, color, glow }) => (
                <div
                  key={title}
                  className="group relative rounded-2xl p-6 border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-1 cursor-default overflow-hidden"
                  style={{ background: 'linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))' }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl pointer-events-none"
                    style={{ background: `radial-gradient(ellipse at top left, ${color}10, transparent 70%)` }} />

                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110"
                    style={{ background: `${color}18`, border: `1px solid ${color}40`, boxShadow: `0 0 20px ${color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color }} strokeWidth={2} />
                  </div>

                  <h3 className="text-[16px] font-bold text-white mb-2">{title}</h3>
                  <p className="text-[14px] leading-relaxed text-zinc-500 group-hover:text-zinc-400 transition-colors">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ HOW IT WORKS ══════════════════════ */}
        <section className="py-24 border-y border-white/[0.05] relative overflow-hidden" style={{ background: 'linear-gradient(180deg,rgba(124,58,237,0.04),transparent)' }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

          <div className="max-w-7xl mx-auto px-5 md:px-8">
            <div className="text-center mb-16">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-4">Cómo funciona</p>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
                De archivo a stems en 3 pasos
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8 relative">
              {/* connector line */}
              <div className="hidden md:block absolute top-10 left-[calc(33%-24px)] right-[calc(33%-24px)] h-[1px] bg-gradient-to-r from-violet-500/20 via-violet-500/50 to-violet-500/20" />

              {[
                { step: '01', icon: Music, title: 'Sube tu archivo', desc: 'Arrastra cualquier archivo de audio o pega un link de YouTube directamente.', color: '#7c3aed' },
                { step: '02', icon: Layers, title: 'La IA separa los stems', desc: 'Nuestros modelos de IA procesan tu canción y extraen cada instrumento con precisión.', color: '#4f46e5' },
                { step: '03', icon: Headphones, title: 'Mezcla y descarga', desc: 'Usa el mixer integrado, ajusta tempo y tono, y exporta en WAV sin pérdidas.', color: '#06b6d4' },
              ].map(({ step, icon: Icon, title, desc, color }) => (
                <div key={step} className="flex flex-col items-center text-center group">
                  <div className="relative mb-6">
                    <div
                      className="w-20 h-20 rounded-2xl flex items-center justify-center transition-all group-hover:scale-110"
                      style={{ background: `${color}18`, border: `1px solid ${color}40`, boxShadow: `0 0 30px ${color}20` }}
                    >
                      <Icon className="w-8 h-8" style={{ color }} />
                    </div>
                    <span
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white"
                      style={{ background: color, boxShadow: `0 0 12px ${color}80` }}
                    >
                      {step.replace('0', '')}
                    </span>
                  </div>
                  <h3 className="text-[17px] font-bold text-white mb-2">{title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed max-w-xs">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ WAVEFORM SHOWCASE ══════════════════════ */}
        <section className="py-24 md:py-32">
          <div className="max-w-7xl mx-auto px-5 md:px-8 grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-cyan-400 mb-4">Mixer integrado</p>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight leading-[1.1]">
                Mezcla en tiempo real <br />
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(90deg,#38bdf8,#34d399)' }}>
                  con precisión total
                </span>
              </h2>
              <p className="text-lg text-zinc-400 leading-relaxed mb-8">
                Control individual de volumen, mute y solo por stem. Ecualizador paramétrico, reverb y compresión en cada canal. Todo sin salir del navegador.
              </p>

              <div className="space-y-3">
                {[
                  { f: 'Visualización de forma de onda en tiempo real', c: '#38bdf8' },
                  { f: 'Ecualizador de 5 bandas por stem', c: '#a78bfa' },
                  { f: 'Cambio de tempo ±50% sin artefactos', c: '#34d399' },
                  { f: 'Transposición de tono ±12 semitonos', c: '#fb923c' },
                ].map(({ f, c }) => (
                  <div key={f} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: `${c}22`, border: `1px solid ${c}50` }}>
                      <Check className="w-3 h-3" style={{ color: c }} strokeWidth={3} />
                    </div>
                    <span className="text-[14px] text-zinc-300">{f}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/login"
                className="inline-flex items-center gap-2 mt-10 px-7 py-3.5 rounded-full text-[14px] font-bold text-white transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg,#06b6d4,#0ea5e9)', boxShadow: '0 0 30px rgba(6,182,212,0.35)' }}
              >
                Abrir el mixer <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* visual mixer mock */}
            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl bg-cyan-500/5 blur-3xl pointer-events-none" />
              <div
                className="relative rounded-2xl border border-white/[0.07] p-6 space-y-4"
                style={{ background: 'linear-gradient(180deg,#0c0c14,#080810)', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-bold text-white">Mixer — 4 stems</span>
                  <span className="text-[11px] text-zinc-600">3:42 / 3:42</span>
                </div>
                <WaveformBars color="#a78bfa" barCount={70} height={64} />
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { name: 'Voces', color: '#a78bfa', vol: 85 },
                    { name: 'Drums', color: '#38bdf8', vol: 70 },
                    { name: 'Bajo', color: '#34d399', vol: 60 },
                    { name: 'Otros', color: '#fb923c', vol: 90 },
                  ].map(({ name, color, vol }) => (
                    <div key={name} className="flex flex-col items-center gap-2">
                      <div className="relative w-4 h-28 bg-white/[0.04] rounded-full overflow-hidden border border-white/[0.06]">
                        <div
                          className="absolute bottom-0 w-full rounded-full transition-all"
                          style={{ height: `${vol}%`, background: `linear-gradient(0deg,${color},${color}aa)`, boxShadow: `0 0 10px ${color}60` }}
                        />
                      </div>
                      <span className="text-[10px] text-zinc-500 font-medium">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══════════════════════ TESTIMONIALS ══════════════════════ */}
        <section className="py-24 border-y border-white/[0.05] relative overflow-hidden" style={{ background: 'rgba(255,255,255,0.01)' }}>
          <div className="max-w-7xl mx-auto px-5 md:px-8">
            <div className="text-center mb-14">
              <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-violet-400 mb-4">Testimonios</p>
              <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                Lo que dicen nuestros usuarios
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map(({ name, role, avatar, text, stars, color }) => (
                <div
                  key={name}
                  className="relative rounded-2xl p-6 border border-white/[0.06] hover:border-white/[0.12] transition-all duration-300 hover:-translate-y-1 group"
                  style={{ background: 'linear-gradient(145deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))' }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl"
                    style={{ background: `radial-gradient(ellipse at top left,${color}08,transparent 60%)` }} />

                  <div className="flex items-center gap-0.5 mb-4">
                    {Array.from({ length: stars }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>

                  <p className="text-[15px] text-zinc-300 leading-relaxed mb-6">"{text}"</p>

                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black text-white shrink-0"
                      style={{ background: `linear-gradient(135deg,${color},${color}88)` }}
                    >
                      {avatar}
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-white">{name}</p>
                      <p className="text-[12px] text-zinc-500">{role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════ CTA BAND ══════════════════════ */}
        <section className="py-24 md:py-32 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-violet-600/10 blur-[80px]" />
          </div>

          <div className="relative max-w-3xl mx-auto px-5 md:px-8 text-center">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-semibold text-emerald-300 border border-emerald-500/30 mb-8"
              style={{ background: 'rgba(16,185,129,0.1)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              10 minutos gratis, sin tarjeta
            </div>

            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 tracking-tight leading-[1.08]">
              Lleva tu música al{' '}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#a78bfa,#818cf8,#38bdf8)' }}>
                siguiente nivel
              </span>
            </h2>

            <p className="text-lg text-zinc-400 mb-10 leading-relaxed">
              Únete a más de 50,000 músicos que ya usan Judith para separar, mezclar y dominar su música.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-[15px] font-bold text-white transition-all hover:scale-105 hover:brightness-110 active:scale-95"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5,#06b6d4)', boxShadow: '0 0 50px rgba(124,58,237,0.45), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              >
                Comenzar ahora — es gratis <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ══════════════════════ FOOTER ══════════════════════ */}
      <footer className="border-t border-white/[0.05] py-14" style={{ background: 'rgba(255,255,255,0.01)' }}>
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-10">
            <div className="flex flex-col items-center md:items-start gap-4">
              <Image
                src="/images/logo.png"
                alt="Judith"
                width={120}
                height={32}
                className="h-7 w-auto object-contain"
              />
              <p className="text-[13px] text-zinc-600 max-w-xs text-center md:text-left">
                Separación de audio con IA para músicos, productores y artistas en vivo.
              </p>
            </div>

            <div className="flex flex-wrap justify-center md:justify-end gap-x-10 gap-y-4 text-[13px] text-zinc-500">
              {[['Inicio', '/'], ['Características', '#features'], ['Precios', '#planes'], ['Contacto', '/contacto'], ['Privacidad', '/privacidad'], ['Términos', '/terminos']].map(([label, href]) => (
                <Link key={label} href={href} className="hover:text-white transition-colors">
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-zinc-600">
            <p>© 2026 Judith. Todos los derechos reservados.</p>
            <p>Hecho con ♥ para músicos del mundo.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
