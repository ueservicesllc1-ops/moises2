import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getPlanById } from '../lib/tokens'

interface TokenBadgeProps {
  onClick: () => void
}

export default function TokenBadge({ onClick }: TokenBadgeProps) {
  const { user } = useAuth()
  const [tokenInfo, setTokenInfo] = useState<{
    planId: string
    tokenBalance: number
    freeSeparationUsed: boolean
    loading: boolean
  }>({
    planId: 'free',
    tokenBalance: 0,
    freeSeparationUsed: false,
    loading: true,
  })

  const fetchTokens = async () => {
    if (!user?.uid) return
    try {
      const res = await fetch(`/api/check-tokens?uid=${user.uid}`)
      if (res.ok) {
        const data = await res.json()
        setTokenInfo({
          planId: data.planId,
          tokenBalance: data.tokenBalance,
          freeSeparationUsed: data.freeSeparationUsed,
          loading: false,
        })
      }
    } catch (err) {
      console.error('Error fetching token status:', err)
    }
  }

  useEffect(() => {
    if (user?.uid) {
      fetchTokens()
      // Refresh every 10 seconds to catch stripe updates or completed separations
      const interval = setInterval(fetchTokens, 10000)
      
      // Also listen to custom events from upload complete
      const handleRefresh = () => fetchTokens()
      window.addEventListener('refresh-tokens', handleRefresh)

      return () => {
        clearInterval(interval)
        window.removeEventListener('refresh-tokens', handleRefresh)
      }
    } else {
      setTokenInfo(prev => ({ ...prev, loading: false }))
    }
  }, [user?.uid])

  if (!user || tokenInfo.loading) return null

  const plan = getPlanById(tokenInfo.planId)
  const isFree = tokenInfo.planId === 'free'

  return (
    <button
      onClick={onClick}
      className="mobile-touch-target flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:border-slate-700 hover:bg-slate-900 active:scale-95"
    >
      <span className="text-sm">{plan.emoji}</span>
      <div className="flex flex-col items-start text-left">
        <span className="text-[10px] text-slate-400 font-medium leading-none uppercase tracking-wide">Plan {plan.displayName}</span>
        <span className="font-bold leading-none text-slate-100 mt-0.5">
          {isFree
            ? tokenInfo.freeSeparationUsed
              ? 'Preview (0 Turnos)'
              : '1 Turno Gratis'
            : `${tokenInfo.tokenBalance.toLocaleString()} tokens`}
        </span>
      </div>
      <span className="ml-1 text-slate-500 text-[10px]">⚡ Up</span>
    </button>
  )
}
