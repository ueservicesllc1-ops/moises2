'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, Minus } from 'lucide-react'
import { checkoutUrls, type BillingPeriod } from '@/lib/pricing'

type PlanId = 'starter' | 'lite' | 'pro'

type Plan = {
  id: PlanId
  name: string
  badge?: string
  description: string
  monthlyPrice: number | null
  yearlyPricePerMonth: number | null
  yearlyBilledTotal: number | null
  cta: string
  highlighted?: boolean
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Para probar Judith y proyectos ocasionales.',
    monthlyPrice: 0,
    yearlyPricePerMonth: 0,
    yearlyBilledTotal: 0,
    cta: 'Empezar gratis',
  },
  {
    id: 'lite',
    name: 'Creador',
    badge: 'Popular',
    description: 'Más minutos y archivos grandes para producir cada semana.',
    monthlyPrice: 4.99,
    yearlyPricePerMonth: 4.17,
    yearlyBilledTotal: 49.99,
    cta: 'Suscribirse',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Prioridad, lotes y herramientas para equipos y sellos.',
    monthlyPrice: 9.99,
    yearlyPricePerMonth: 8.33,
    yearlyBilledTotal: 99.99,
    cta: 'Ir a Pro',
    highlighted: true,
  },
]

type RowKind = 'text' | 'boolean'

type CompareRow = {
  label: string
  kind: RowKind
  starter: string | boolean
  lite: string | boolean
  pro: string | boolean
}

const COMPARE: CompareRow[] = [
  {
    label: 'Minutos en cola estándar',
    kind: 'text',
    starter: '10 min / mes',
    lite: 'Ilimitados',
    pro: 'Ilimitados',
  },
  {
    label: 'Minutos en cola prioritaria',
    kind: 'text',
    starter: '—',
    lite: '90 min / mes',
    pro: '250 min / mes',
  },
  {
    label: 'Tamaño máx. por archivo',
    kind: 'text',
    starter: '200 MB',
    lite: '2 GB',
    pro: '2 GB',
  },
  {
    label: 'Descarga de stems',
    kind: 'boolean',
    starter: true,
    lite: true,
    pro: true,
  },
  {
    label: 'Procesamiento por lotes',
    kind: 'boolean',
    starter: false,
    lite: true,
    pro: true,
  },
  {
    label: 'Mixer avanzado + efectos',
    kind: 'boolean',
    starter: true,
    lite: true,
    pro: true,
  },
  {
    label: 'Acceso API',
    kind: 'boolean',
    starter: false,
    lite: false,
    pro: true,
  },
  {
    label: 'Soporte prioritario',
    kind: 'boolean',
    starter: false,
    lite: false,
    pro: true,
  },
]

function formatMoney(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function resolveCheckoutHref(plan: Plan, period: BillingPeriod): string {
  if (plan.id === 'starter') return '/login'

  if (plan.id === 'lite') {
    const url = period === 'yearly' ? checkoutUrls.liteYearly : checkoutUrls.liteMonthly
    if (url) return url
    return `/login?plan=lite&billing=${period}`
  }

  if (plan.id === 'pro') {
    const url = period === 'yearly' ? checkoutUrls.proYearly : checkoutUrls.proMonthly
    if (url) return url
    return `/login?plan=pro&billing=${period}`
  }

  return '/login'
}

function CellValue({ value, kind }: { value: string | boolean; kind: RowKind }) {
  if (kind === 'boolean') {
    const ok = value === true
    return (
      <span className="flex justify-center">
        {ok ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
        ) : (
          <Minus className="h-4 w-4 text-zinc-600" strokeWidth={2} />
        )}
      </span>
    )
  }
  return <span className="text-[13px] text-zinc-300">{value}</span>
}

export default function PricingSection() {
  const [period, setPeriod] = useState<BillingPeriod>('yearly')

  const savingsPercent = useMemo(() => {
    const litePlan = PLANS.find((plan) => plan.id === 'lite')
    const monthly = litePlan?.monthlyPrice ?? 0
    const yearlyPerMonth = litePlan?.yearlyPricePerMonth ?? 0
    if (monthly <= 0) return 0
    return Math.round((1 - yearlyPerMonth / monthly) * 100)
  }, [])

  return (
    <section id="planes" className="scroll-mt-24 border-t border-white/[0.06] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-[1.65rem] font-bold tracking-tight text-white md:text-[2rem]">
            Elige tu plan
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-500 md:text-base">
            Misma calidad de separación en todos los planes; cambia el límite de uso y la prioridad
            cuando lo necesites.
          </p>
        </div>

        {/* Toggle facturación — estilo similar a SaaS de planes (p. ej. LALAL.AI) */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:mt-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
            Facturación
          </p>
          <div className="inline-flex rounded-full border border-white/[0.08] bg-[#0c0a10] p-1 ring-1 ring-white/[0.04]">
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              className={`rounded-full px-5 py-2 text-[13px] font-semibold transition ${
                period === 'monthly'
                  ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-[0_0_24px_-4px_rgba(109,40,217,0.6)]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setPeriod('yearly')}
              className={`rounded-full px-5 py-2 text-[13px] font-semibold transition ${
                period === 'yearly'
                  ? 'bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-[0_0_24px_-4px_rgba(109,40,217,0.6)]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Anual
              <span className="ml-2 rounded-md bg-teal-500/20 px-1.5 py-0.5 text-[11px] font-bold text-teal-300 ring-1 ring-teal-500/30">
                −{savingsPercent}%
              </span>
            </button>
          </div>
          <p className="text-center text-[12px] text-zinc-600">
            Al contratar aceptas nuestros términos y la política de reembolsos aplicable.
          </p>
        </div>

        {/* Tarjetas de planes */}
        <div className="mt-14 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {PLANS.map((plan) => {
            const isFree = plan.monthlyPrice === 0
            const price =
              period === 'monthly'
                ? plan.monthlyPrice
                : isFree
                  ? 0
                  : plan.yearlyPricePerMonth
            const href = resolveCheckoutHref(plan, period)

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border p-8 shadow-xl transition ${
                  plan.highlighted
                    ? 'border-teal-500/40 bg-gradient-to-b from-[#0f1620] to-[#0a0d14] ring-2 ring-teal-500/25 shadow-[0_24px_80px_-24px_rgba(20,184,166,0.25)]'
                    : 'border-white/[0.08] bg-[#0c0a10] ring-1 ring-white/[0.04]'
                }`}
              >
                {plan.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#041016] shadow-lg">
                    {plan.badge}
                  </span>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <p className="mt-2 min-h-[3rem] text-[14px] leading-relaxed text-zinc-500">
                    {plan.description}
                  </p>
                </div>

                <div className="mb-8">
                  {isFree ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold tracking-tight text-white">0€</span>
                      <span className="text-sm text-zinc-500">/mes</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="text-4xl font-bold tracking-tight text-white">
                          {formatMoney(price)}
                        </span>
                        <span className="text-sm text-zinc-500">/mes</span>
                      </div>
                      {period === 'yearly' && plan.yearlyBilledTotal != null && plan.yearlyBilledTotal > 0 && (
                        <p className="mt-2 text-[13px] text-zinc-500">
                          Facturado{' '}
                          <span className="text-zinc-300">
                            {formatMoney(plan.yearlyBilledTotal)}
                          </span>{' '}
                          al año
                        </p>
                      )}
                      {period === 'monthly' && (
                        <p className="mt-2 text-[13px] text-zinc-600">Facturación mensual</p>
                      )}
                    </>
                  )}
                </div>

                <Link
                  href={href}
                  className={`mt-auto inline-flex h-12 items-center justify-center rounded-xl text-[14px] font-semibold transition ${
                    plan.highlighted
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-[#041016] shadow-[0_12px_40px_-12px_rgba(34,211,238,0.45)] hover:brightness-110'
                      : isFree
                        ? 'border border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08]'
                        : 'bg-gradient-to-r from-violet-600 to-violet-700 text-white shadow-[0_8px_32px_-8px_rgba(109,40,217,0.5)] hover:brightness-105'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            )
          })}
        </div>

        {/* Tabla comparativa */}
        <div className="mt-20">
          <h3 className="text-center text-lg font-bold text-white md:text-xl">Comparar planes</h3>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[0.08] bg-[#08060c]/80 ring-1 ring-white/[0.04]">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                  <th className="px-4 py-4 font-semibold text-zinc-400 md:px-6">Función</th>
                  <th className="px-4 py-4 text-center font-semibold text-zinc-300 md:px-6">Starter</th>
                  <th className="px-4 py-4 text-center font-semibold text-violet-300 md:px-6">Creador</th>
                  <th className="px-4 py-4 text-center font-semibold text-teal-300 md:px-6">Pro</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-4 font-medium text-zinc-400 md:px-6">{row.label}</td>
                    <td className="px-4 py-4 text-center md:px-6">
                      <CellValue value={row.starter} kind={row.kind} />
                    </td>
                    <td className="px-4 py-4 text-center md:px-6">
                      <CellValue value={row.lite} kind={row.kind} />
                    </td>
                    <td className="px-4 py-4 text-center md:px-6">
                      <CellValue value={row.pro} kind={row.kind} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-10 text-center text-[12px] leading-relaxed text-zinc-600">
          Los límites de minutos se renuevan según tu ciclo de facturación. Los minutos de cola
          prioritaria no se acumulan de un mes a otro.
        </p>
      </div>
    </section>
  )
}
