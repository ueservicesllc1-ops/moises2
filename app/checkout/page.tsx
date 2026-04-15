'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from '@stripe/react-stripe-js'
import { useAuth } from '@/contexts/AuthContext'

type CheckoutPlan = 'lite' | 'pro'
type CheckoutBilling = 'monthly' | 'yearly'

function normalizePlan(raw: string | null): CheckoutPlan {
  return raw === 'pro' ? 'pro' : 'lite'
}

function normalizeBilling(raw: string | null): CheckoutBilling {
  return raw === 'monthly' ? 'monthly' : 'yearly'
}

export default function CheckoutPage() {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState('')
  const [prefetchedSecret, setPrefetchedSecret] = useState<string | null>(null)

  const plan = normalizePlan(searchParams.get('plan'))
  const billing = normalizeBilling(searchParams.get('billing'))

  const stripePromise = useMemo(() => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    return key ? loadStripe(key) : null
  }, [])

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?plan=${plan}&billing=${billing}`)
    }
  }, [billing, loading, plan, router, user])

  useEffect(() => {
    if (!user?.uid) return
    try {
      const raw = sessionStorage.getItem('judith_embedded_checkout_prefetch')
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        clientSecret?: string
        plan?: string
        billing?: string
        uid?: string
        at?: number
      }
      const freshEnough = typeof parsed.at === 'number' && Date.now() - parsed.at < 5 * 60 * 1000
      const matches =
        parsed.uid === user.uid &&
        parsed.plan === plan &&
        parsed.billing === billing &&
        typeof parsed.clientSecret === 'string'
      if (freshEnough && matches) {
        setPrefetchedSecret(parsed.clientSecret!)
      }
    } catch {
      // ignore parsing issues
    } finally {
      sessionStorage.removeItem('judith_embedded_checkout_prefetch')
    }
  }, [billing, plan, user?.uid])

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0b0b10] text-white flex items-center justify-center p-6">
        <p>Cargando checkout...</p>
      </main>
    )
  }

  if (!loading && !user) return null

  if (!stripePromise) {
    return (
      <main className="min-h-screen bg-[#0b0b10] text-white flex items-center justify-center p-6">
        <p>Falta NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY en entorno.</p>
      </main>
    )
  }

  const fetchClientSecret = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('Usuario no autenticado para checkout')
    }

    const res = await fetch('/api/stripe/create-embedded-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan,
        billing,
        uid: user.uid,
        email: user?.email,
      }),
    })
    const data = await res.json()
    if (!res.ok || !data?.clientSecret) {
      const msg = data?.error || 'No se pudo iniciar checkout'
      setError(msg)
      throw new Error(msg)
    }
    return data.clientSecret as string
  }, [billing, plan, user?.email, user?.uid])

  return (
    <main className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 md:grid-cols-2">
        <section className="border-b border-white/10 bg-black p-8 md:border-b-0 md:border-r md:p-10">
          <div className="flex items-center gap-2">
            <img src="/images/logo.png" alt="Judith" className="h-8 w-auto object-contain" />
            <span className="text-sm text-zinc-400">Checkout seguro</span>
          </div>
          <h1 className="mt-8 text-3xl font-bold">
            {plan === 'pro' ? 'Pro' : 'Lite'} {billing === 'yearly' ? 'Anual' : 'Mensual'}
          </h1>
          <p className="mt-2 text-zinc-300">
            {plan === 'pro'
              ? billing === 'yearly'
                ? '$15/mo · $180 al año'
                : '$19/mo'
              : billing === 'yearly'
                ? '$7.5/mo · $90 al año'
                : '$9/mo'}
          </p>
          <p className="mt-6 text-sm text-zinc-400">
            Pagos procesados por Stripe. Puedes cancelar cuando quieras desde tu suscripción.
          </p>
          <button
            type="button"
            onClick={() => router.push('/studio?checkout=canceled')}
            className="mt-8 rounded-md border border-white/20 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10"
          >
            Volver a Studio
          </button>
        </section>

        <section className="p-4 md:p-8">
          {error ? (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
          ) : (
            <EmbeddedCheckoutProvider
              stripe={stripePromise}
              options={prefetchedSecret ? { clientSecret: prefetchedSecret } : { fetchClientSecret }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </section>
      </div>
    </main>
  )
}
