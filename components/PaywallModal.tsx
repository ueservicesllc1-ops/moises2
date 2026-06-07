import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

interface PaywallModalProps {
  isOpen: boolean
  onClose: () => void
  reason?: string | null
}

export default function PaywallModal({ isOpen, onClose, reason }: PaywallModalProps) {
  const { user } = useAuth()
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)

  if (!isOpen) return null

  const handleCheckout = async (plan: 'lite' | 'pro' | 'ultra') => {
    if (!user) {
      // Redirect to login/signup
      window.location.href = `/login?redirect=studio&plan=${plan}&billing=${billingPeriod}`
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
      priceYearly: 19.90, // ~2 months free
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto animate-in fade-in duration-300">
      <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl p-6 md:p-8 my-8 animate-in zoom-in-95 duration-300">
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl"></div>
        <div className="absolute bottom-0 right-0 -mr-20 -mb-20 h-60 w-60 rounded-full bg-purple-500/10 blur-3xl"></div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="12"></line>
          </svg>
        </button>

        <div className="flex flex-col items-center text-center mb-8">
          {reason && (
            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-400 border border-amber-500/25">
              <span>⚠️</span> {reason}
            </div>
          )}
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
            Lleva tu música al siguiente nivel
          </h2>
          <p className="mt-2 text-slate-400 max-w-xl text-sm md:text-base">
            Elige el plan que mejor se adapte a tu ritmo. Separa pistas con la mayor calidad de IA.
          </p>

          {/* Billing Toggle */}
          <div className="mt-6 flex items-center bg-slate-950 p-1 rounded-full border border-slate-800">
            <button
              onClick={() => setBillingPeriod('monthly')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                billingPeriod === 'monthly'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mensual
            </button>
            <button
              onClick={() => setBillingPeriod('yearly')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                billingPeriod === 'yearly'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Anual
              <span className="bg-emerald-500 text-slate-950 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                -15%
              </span>
            </button>
          </div>
        </div>

        {/* Plan Cards Grid */}
        <div className="grid gap-6 md:grid-cols-3 relative z-10">
          {plans.map((p) => {
            const price = billingPeriod === 'monthly' ? p.priceMonthly : p.priceYearly
            const priceStr = price.toFixed(2)
            const periodLabel = billingPeriod === 'monthly' ? '/mes' : '/año'

            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between rounded-2xl border transition-all duration-300 hover:-translate-y-1 ${
                  p.popular
                    ? 'border-purple-500/40 bg-slate-900/60 shadow-xl ' + p.shadow
                    : 'border-slate-800 bg-slate-950/40 hover:border-slate-700 shadow-lg'
                }`}
              >
                {p.popular && (
                  <div className="absolute top-0 right-6 -translate-y-1/2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Más Popular
                  </div>
                )}

                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white">{p.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Tokens: {p.tokens}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-md bg-gradient-to-r ${p.color} px-2.5 py-1 text-xs font-bold text-slate-950`}>
                      {p.time}
                    </span>
                  </div>

                  <div className="mb-6 flex items-baseline">
                    <span className="text-4xl font-extrabold text-white">${priceStr}</span>
                    <span className="ml-1 text-sm text-slate-400">{periodLabel}</span>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3 mb-8">
                    {p.features.map((f, idx) => (
                      <li key={idx} className="flex items-start text-xs text-slate-300">
                        <span className="mr-2 text-emerald-400">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-6 pt-0">
                  <button
                    onClick={() => handleCheckout(p.id)}
                    disabled={loadingPlan !== null}
                    className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all shadow-md focus:outline-none focus:ring-2 active:scale-[0.98] ${
                      loadingPlan === p.id
                        ? 'bg-slate-700 cursor-wait animate-pulse'
                        : p.popular
                        ? 'bg-gradient-to-r ' + p.color + ' hover:opacity-90 hover:shadow-purple-500/35 focus:ring-purple-500/50 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 focus:ring-slate-700/50'
                    }`}
                  >
                    {loadingPlan === p.id ? 'Cargando...' : `Obtener plan ${p.name}`}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Free tier explanation note */}
        <div className="mt-8 text-center text-xs text-slate-500">
          ¿Prefieres probar gratis? Los usuarios nuevos reciben <span className="text-slate-300">1 separación gratis</span> con vista previa de 40 segundos.
        </div>
      </div>
    </div>
  )
}
