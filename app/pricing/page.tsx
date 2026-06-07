'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { TOKEN_PLANS, getPlanById } from '@/lib/tokens'

export default function PricingPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  const handleCheckout = async (plan: 'lite' | 'pro' | 'ultra') => {
    if (!user) {
      router.push(`/login?redirect=pricing&plan=${plan}&billing=${billingPeriod}`)
      return
    }

    try {
      setLoadingPlan(plan)
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          billing: billingPeriod,
          uid: user.uid,
          email: user.email,
        }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Ocurrió un error al iniciar el pago.')
      }
    } catch (err) {
      console.error('Checkout error:', err)
      alert('Error de red al conectar con Stripe.')
    } finally {
      setLoadingPlan(null)
    }
  }

  const plans = [
    {
      id: 'lite' as const,
      name: 'Lite',
      priceMonthly: 1.99,
      priceYearly: 19.90,
      tokens: '1,000',
      time: '~30 minutos',
      songs: '6 a 8 canciones',
      color: 'from-blue-500 to-cyan-500',
      shadow: 'shadow-blue-500/20',
      features: [
        '1,000 tokens mensuales',
        'Separación de hasta ~30 min de audio',
        'Soporte para 6–8 canciones completas',
        'Acceso completo a stems (sin límites de duración)',
        'Procesamiento rápido de colas',
      ],
    },
    {
      id: 'pro' as const,
      name: 'Pro',
      priceMonthly: 4.99,
      priceYearly: 49.90,
      tokens: '6,000',
      time: '~3 horas (180 min)',
      songs: '40 a 50 canciones',
      color: 'from-purple-500 to-pink-500',
      shadow: 'shadow-purple-500/20',
      popular: true,
      features: [
        '6,000 tokens mensuales',
        'Separación de hasta ~3 horas de audio',
        'Soporte para 40–50 canciones completas',
        'Prioridad de procesamiento Pro',
        'Ajustes de calidad Hi-Fi (24-bit MDX-Net)',
        'Separación de voz de instrumentos avanzada',
      ],
    },
    {
      id: 'ultra' as const,
      name: 'Ultra',
      priceMonthly: 9.99,
      priceYearly: 99.90,
      tokens: '20,000',
      time: '~10 horas (600 min)',
      songs: 'Ilimitado (hasta ~160 canciones)',
      color: 'from-amber-500 to-orange-500',
      shadow: 'shadow-amber-500/20',
      features: [
        '20,000 tokens mensuales',
        'Separación de hasta ~10 horas de audio',
        'Máxima prioridad en cola de espera',
        'Acceso ilimitado a todas las funciones Premium',
        'Calidad de estudio Hi-Fi MDX-Net',
        'Soporte prioritario 24/7',
      ],
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between pb-12 relative overflow-hidden">
      
      {/* Glow backgrounds */}
      <div className="absolute top-0 left-1/4 -translate-x-1/2 h-[450px] w-[450px] rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 right-1/4 translate-x-1/2 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-3xl pointer-events-none"></div>

      {/* Header / Nav */}
      <header className="w-full max-w-7xl px-6 py-6 flex justify-between items-center z-10">
        <div 
          onClick={() => router.push('/')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <img src="/images/logo.png" alt="Logo" className="h-9 w-auto object-contain opacity-95" />
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Judith
          </span>
        </div>
        <button
          onClick={() => router.push('/studio')}
          className="rounded-full border border-slate-800 bg-slate-950/40 hover:bg-slate-900 px-5 py-2 text-sm font-semibold transition"
        >
          Ir al Estudio
        </button>
      </header>

      {/* Content */}
      <main className="w-full max-w-6xl px-6 flex-1 flex flex-col items-center justify-center my-12 z-10">
        <div className="text-center max-w-2xl mb-12">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent leading-tight">
            Planes de Suscripción Judith
          </h1>
          <p className="mt-4 text-base md:text-lg text-slate-400">
            Libera todo el potencial de tu música. Separa tus canciones en pistas independientes con la mejor IA espectral del mercado.
          </p>

          {/* Billing Toggle */}
          <div className="mt-8 inline-flex items-center bg-slate-900 p-1 rounded-full border border-slate-800">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-5 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingPeriod === 'yearly'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Anual
              <span className="bg-emerald-500 text-slate-950 text-[10px] px-2 py-0.5 rounded-full font-bold">
                -15%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid gap-8 md:grid-cols-3 w-full max-w-5xl">
          {plans.map((p) => {
            const price = billingPeriod === 'monthly' ? p.priceMonthly : p.priceYearly
            const priceStr = price.toFixed(2)
            const periodLabel = billingPeriod === 'monthly' ? '/mes' : '/año'

            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between rounded-2xl border transition-all duration-300 hover:-translate-y-1.5 ${
                  p.popular
                    ? 'border-purple-500/50 bg-slate-900/60 shadow-2xl ' + p.shadow
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 shadow-xl'
                }`}
              >
                {p.popular && (
                  <div className="absolute top-0 right-6 -translate-y-1/2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                    Más Vendido
                  </div>
                )}

                <div className="p-6 md:p-8">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-2xl font-bold text-white">{p.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">Tokens: {p.tokens}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-md bg-gradient-to-r ${p.color} px-3 py-1 text-xs font-bold text-slate-950`}>
                      {p.time}
                    </span>
                  </div>

                  <div className="mb-6 flex items-baseline">
                    <span className="text-5xl font-extrabold text-white">${priceStr}</span>
                    <span className="ml-1 text-sm text-slate-400">{periodLabel}</span>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-4 mb-8">
                    {p.features.map((f, idx) => (
                      <li key={idx} className="flex items-start text-sm text-slate-300">
                        <span className="mr-3 text-emerald-400">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-6 md:p-8 pt-0">
                  <button
                    onClick={() => handleCheckout(p.id)}
                    disabled={loadingPlan !== null}
                    className={`w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all shadow-md focus:outline-none focus:ring-2 active:scale-[0.98] ${
                      loadingPlan === p.id
                        ? 'bg-slate-700 cursor-wait animate-pulse'
                        : p.popular
                        ? 'bg-gradient-to-r ' + p.color + ' hover:opacity-90 hover:shadow-purple-500/35 focus:ring-purple-500/50 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 focus:ring-slate-700/50'
                    }`}
                  >
                    {loadingPlan === p.id ? 'Iniciando checkout...' : `Suscribirse a ${p.name}`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Free Plan Callout */}
        <div className="mt-12 text-slate-500 text-xs flex flex-col items-center">
          <p>Los nuevos usuarios disfrutan de 1 separación gratuita con 40 segundos de vista previa.</p>
          <button
            onClick={() => router.push('/studio')}
            className="mt-2 text-slate-400 hover:text-white underline font-semibold transition"
          >
            Probar ahora gratis
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-7xl px-6 py-6 border-t border-slate-900 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-500 z-10">
        <div>
          © {new Date().getFullYear()} Judith Music Corp. Todos los derechos reservados.
        </div>
        <div className="flex gap-4">
          <a href="#" className="hover:text-slate-300 transition">Términos de servicio</a>
          <a href="#" className="hover:text-slate-300 transition">Política de privacidad</a>
        </div>
      </footer>
    </div>
  )
}
