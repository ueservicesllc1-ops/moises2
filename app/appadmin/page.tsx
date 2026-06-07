'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, Crown, ShieldAlert, Sparkles, AlertCircle, Smartphone, RefreshCw, BarChart2, Music, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/contexts/AuthContext'

interface User {
  id: string
  email: string
  displayName: string
  isPremium: boolean
  planId: string
  tokenBalance: number
  freeSeparationUsed: boolean
  createdAt: string | null
}

interface VisitStats {
  total_visits: number
  unique_visitors: number
  today_visits: number
}

interface SeparationStats {
  total_songs: number
  android_songs: number
  web_songs: number
}

export default function AppAdminPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  const [pin, setPin] = useState('')
  const [pinOk, setPinOk] = useState(false)
  
  const [users, setUsers] = useState<User[]>([])
  const [visitStats, setVisitStats] = useState<VisitStats>({ total_visits: 0, unique_visitors: 0, today_visits: 0 })
  const [separationStats, setSeparationStats] = useState<SeparationStats>({ total_songs: 0, android_songs: 0, web_songs: 0 })
  const [androidInstalls, setAndroidInstalls] = useState<number>(0)
  
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  const ADMIN_PIN = '1619'
  const ADMIN_EMAIL = 'ueservicesllc1@gmail.com'

  useEffect(() => {
    const ok = sessionStorage.getItem('appadmin_pin_ok') === '1'
    if (ok) {
      setPinOk(true)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (pinOk && user && (user.email || '').toLowerCase() === ADMIN_EMAIL) {
      loadStats()
    }
  }, [pinOk, user])

  const loadStats = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin-stats')
      if (!res.ok) throw new Error('Error al cargar estadísticas')
      const data = await res.json()
      
      setUsers(data.users || [])
      setVisitStats(data.visitsStats || { total_visits: 0, unique_visitors: 0, today_visits: 0 })
      setSeparationStats(data.separationStats || { total_songs: 0, android_songs: 0, web_songs: 0 })
      setAndroidInstalls(data.androidInstalls || 0)
    } catch (err) {
      console.error(err)
      toast.error('No se pudieron obtener las estadísticas de la base de datos.')
    } finally {
      setLoading(false)
    }
  }

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.trim() !== ADMIN_PIN) {
      toast.error('PIN de seguridad incorrecto')
      return
    }
    sessionStorage.setItem('appadmin_pin_ok', '1')
    setPinOk(true)
    setPin('')
    toast.success('Autorización exitosa')
  }

  const handleUpdatePlan = async (userId: string, newPlanId: string) => {
    setActionLoading(userId)
    
    // Default tokens values
    let tokens = 0
    if (newPlanId === 'lite') tokens = 1000
    else if (newPlanId === 'pro') tokens = 6000
    else if (newPlanId === 'ultra') tokens = 20000

    try {
      const res = await fetch('/api/admin-update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, planId: newPlanId, tokenBalance: tokens })
      })

      if (!res.ok) throw new Error('Error al actualizar plan')
      
      setUsers(prev => prev.map(u => 
        u.id === userId 
          ? { ...u, planId: newPlanId, isPremium: newPlanId !== 'free' && newPlanId !== 'starter', tokenBalance: tokens } 
          : u
      ))
      
      toast.success(`Plan actualizado a ${newPlanId.toUpperCase()}`)
    } catch (err) {
      console.error(err)
      toast.error('Fallo al actualizar el plan del usuario')
    } finally {
      setActionLoading(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] text-white flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-teal-400"></div>
          <p className="text-gray-400 text-sm">Verificando credenciales...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0d0f14] text-white flex items-center justify-center">
        <p className="text-gray-400">Redireccionando...</p>
      </div>
    )
  }

  // Verificar que el correo electrónico del administrador actual coincida
  if ((user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return (
      <div className="min-h-screen bg-[#0d0f14] text-white flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-[#161922] p-8 text-center shadow-2xl">
          <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-4 animate-pulse" />
          <h2 className="text-2xl font-bold text-white mb-2">Acceso Denegado</h2>
          <p className="text-sm text-gray-400 mb-6 leading-relaxed">
            Tu dirección de correo ({user.email}) no cuenta con los privilegios requeridos para acceder a la administración.
          </p>
          <button
            onClick={() => router.push('/studio')}
            className="w-full rounded-xl bg-gray-800 hover:bg-gray-700 py-3 text-sm font-semibold transition-all duration-200 border border-white/5"
          >
            Volver al Studio
          </button>
        </div>
      </div>
    )
  }

  // Proteger con PIN
  if (!pinOk) {
    return (
      <div className="min-h-screen bg-[#0d0f14] text-white flex items-center justify-center p-4 font-sans">
        <form
          onSubmit={handlePinSubmit}
          className="w-full max-w-md rounded-2xl border border-white/5 bg-[#121620] p-8 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-teal-500 to-cyan-500"></div>
          <h2 className="text-2xl font-black text-white mb-1 tracking-tight">PIN de Seguridad</h2>
          <p className="text-sm text-gray-400 mb-6">Confirma tu acceso para {ADMIN_EMAIL}</p>
          
          <div className="space-y-4">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full text-center tracking-widest text-2xl font-mono rounded-xl border border-white/10 bg-[#161a26] py-3.5 text-white focus:border-teal-500 focus:outline-none transition-all"
              placeholder="••••"
              required
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 py-3.5 text-sm font-bold text-white transition-all shadow-lg shadow-teal-500/20"
            >
              Autenticar Panel
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#090b11] text-white font-sans selection:bg-teal-500/30 selection:text-teal-200">
      
      {/* Navbar Superior */}
      <header className="h-16 bg-[#111420] border-b border-white/5 flex items-center justify-between px-6 sticky top-0 z-40 backdrop-blur-md bg-opacity-80">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.push('/studio')}
            className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="hidden sm:inline text-sm font-semibold">Volver</span>
          </button>
          <span className="h-4 w-[1px] bg-white/10 hidden sm:block" />
          <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            App Control Center
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={loadStats} 
            disabled={loading}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-gray-300 disabled:opacity-50"
            title="Refrescar datos"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="px-3.5 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-xs font-semibold text-teal-400">
            Administrador
          </div>
        </div>
      </header>

      {/* Grid de Métricas Principales */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Panel de Estadísticas Generales */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          
          <div className="bg-[#121624] border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-teal-500/20 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Users className="w-16 h-16 text-teal-400" />
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Total Usuarios Registrados</p>
            <h3 className="text-4xl font-extrabold text-white tracking-tight">{users.length}</h3>
            <div className="mt-4 flex gap-2 text-xs text-gray-500">
              <span className="text-yellow-400 font-semibold">{users.filter(u => u.isPremium).length} Premiums</span>
              <span>•</span>
              <span>{users.filter(u => !u.isPremium).length} Free</span>
            </div>
          </div>

          <div className="bg-[#121624] border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-cyan-500/20 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Smartphone className="w-16 h-16 text-cyan-400" />
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Descargas / Instalas Android</p>
            <h3 className="text-4xl font-extrabold text-cyan-400 tracking-tight">{androidInstalls}</h3>
            <p className="mt-4 text-xs text-gray-500">Usuarios únicos que abrieron la App Android</p>
          </div>

          <div className="bg-[#121624] border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-violet-500/20 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Music className="w-16 h-16 text-violet-400" />
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Canciones Separadas (Android)</p>
            <h3 className="text-4xl font-extrabold text-violet-400 tracking-tight">{separationStats.android_songs}</h3>
            <p className="mt-4 text-xs text-gray-500">Total separaciones en la App Android</p>
          </div>

          <div className="bg-[#121624] border border-white/5 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:border-amber-500/20 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <BarChart2 className="w-16 h-16 text-amber-400" />
            </div>
            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">Separaciones Totales (Web + App)</p>
            <h3 className="text-4xl font-extrabold text-amber-400 tracking-tight">{separationStats.total_songs}</h3>
            <p className="mt-4 text-xs text-gray-500">Web: {separationStats.web_songs} · Android: {separationStats.android_songs}</p>
          </div>

        </section>

        {/* Sección de Gestión de Usuarios y Planes */}
        <section className="bg-[#111420] border border-white/5 rounded-2xl shadow-xl overflow-hidden mb-10">
          <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-teal-400" />
                Gestión de Usuarios y Planes
              </h2>
              <p className="text-xs text-gray-400 mt-1">Lista en tiempo real desde Firestore. Permite alterar los planes y asignar tokens.</p>
            </div>
            <div className="text-xs font-medium text-amber-400 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
              <AlertCircle className="w-4 h-4" />
              Sincronización directa en Firestore
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-teal-400"></div>
                <p className="text-gray-400 text-xs">Cargando base de datos...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="py-20 text-center text-gray-500">No hay usuarios en la base de datos</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Plan Actual</th>
                    <th className="px-6 py-4">Tokens Restantes</th>
                    <th className="px-6 py-4">Free Utilizado</th>
                    <th className="px-6 py-4 text-right">Asignar Plan Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors align-middle">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-white">{u.displayName}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{u.email}</div>
                      </td>
                      <td className="px-6 py-4">
                        {u.planId === 'ultra' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-teal-500 to-cyan-500 text-black font-extrabold text-[10px] rounded-full">
                            ULTRA PREMIUM
                          </span>
                        ) : u.planId === 'pro' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-extrabold text-[10px] rounded-full">
                            PRO PREMIUM
                          </span>
                        ) : u.planId === 'lite' ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-[10px] rounded-full">
                            LITE PREMIUM
                          </span>
                        ) : (
                          <span className="inline-flex px-3 py-1 bg-gray-800 text-gray-400 font-bold text-[10px] rounded-full">
                            STARTER / FREE
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-white">
                        {u.planId === 'free' || u.planId === 'starter' ? '0' : u.tokenBalance.toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        {u.freeSeparationUsed ? (
                          <span className="text-red-400 font-semibold text-xs flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> Sí (Límite 40s)
                          </span>
                        ) : (
                          <span className="text-emerald-400 font-semibold text-xs flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Disponible
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => handleUpdatePlan(u.id, 'starter')}
                            disabled={actionLoading === u.id || u.planId === 'starter' || u.planId === 'free'}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-white/5 bg-gray-800 hover:bg-gray-700 text-gray-400 transition-all disabled:opacity-40"
                          >
                            FREE
                          </button>
                          <button
                            onClick={() => handleUpdatePlan(u.id, 'lite')}
                            disabled={actionLoading === u.id || u.planId === 'lite'}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-all disabled:opacity-40"
                          >
                            LITE
                          </button>
                          <button
                            onClick={() => handleUpdatePlan(u.id, 'pro')}
                            disabled={actionLoading === u.id || u.planId === 'pro'}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 transition-all disabled:opacity-40"
                          >
                            PRO
                          </button>
                          <button
                            onClick={() => handleUpdatePlan(u.id, 'ultra')}
                            disabled={actionLoading === u.id || u.planId === 'ultra'}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-teal-500/20 bg-teal-500/10 hover:bg-teal-500/20 text-teal-400 transition-all disabled:opacity-40"
                          >
                            ULTRA
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </main>
    </div>
  )
}
