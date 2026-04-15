'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { db } from '@/lib/firebase'

export default function CheckoutSuccessPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState('Validando tu plan...')

  useEffect(() => {
    const applyPlan = async () => {
      if (loading) return

      if (!user?.uid) {
        router.replace('/login')
        return
      }

      const sessionId = searchParams.get('session_id')
      if (!sessionId) {
        setStatus('Falta el identificador de checkout. Te llevamos al estudio.')
        setTimeout(() => router.replace('/studio'), 1200)
        return
      }

      try {
        const verifyRes = await fetch('/api/stripe/checkout-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, uid: user.uid }),
        })
        const verifyData = await verifyRes.json()
        if (!verifyRes.ok || !verifyData?.active) {
          throw new Error(verifyData?.error || 'No se pudo validar el pago con Stripe')
        }

        await setDoc(
          doc(db, 'users', user.uid),
          {
            planId: verifyData.planId,
            isPremium: true,
            billingPeriod: verifyData.billingPeriod,
            stripeCustomerId: verifyData.stripeCustomerId ?? null,
            stripeSubscriptionId: verifyData.stripeSubscriptionId ?? null,
            planUpdatedAt: serverTimestamp(),
            planUpdateSource: 'stripe_checkout',
          },
          { merge: true }
        )
        setStatus(`Plan ${String(verifyData.planId).toUpperCase()} activado correctamente.`)
        setTimeout(() => router.replace('/studio'), 1000)
      } catch (error) {
        console.error('Error applying plan after checkout:', error)
        setStatus('Hubo un problema validando tu pago. Intenta de nuevo.')
      }
    }

    applyPlan()
  }, [loading, router, searchParams, user?.uid])

  return (
    <main className="min-h-[100dvh] bg-[#0a0a10] text-white flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-8 text-center">
        <h1 className="mb-3 text-xl sm:text-2xl font-bold">Confirmando suscripcion</h1>
        <p className="text-zinc-300">{status}</p>
      </div>
    </main>
  )
}
