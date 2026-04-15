'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Youtube, Download, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { resolvePlanIdFromUserData, type PlanId } from '@/lib/pricing'

export default function YoutubeExtractPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [currentPlanId, setCurrentPlanId] = useState<PlanId>('starter')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedAudio, setExtractedAudio] = useState<File | null>(null)
  const [videoTitle, setVideoTitle] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const loadPlan = async () => {
      if (!user?.uid) return
      try {
        const { doc, getDoc } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const userData = userSnap.exists() ? userSnap.data() : null
        setCurrentPlanId(resolvePlanIdFromUserData(userData))
      } catch (e) {
        console.error('Error loading plan for youtube extract page:', e)
      }
    }
    loadPlan()
  }, [user?.uid])

  if (!loading && !user) {
    router.replace('/login')
    return null
  }

  const isPremium = currentPlanId !== 'starter'

  const isValidYoutubeUrl = (url: string) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)

  const handleExtract = async () => {
    if (!youtubeUrl.trim()) return setError('Por favor ingresa una URL de YouTube')
    if (!isValidYoutubeUrl(youtubeUrl)) return setError('URL de YouTube inválida')
    if (!isPremium) return setError('⭐️ La extracción de audio por YouTube es exclusiva para planes de pago.')

    setIsExtracting(true)
    setError('')

    try {
      const response = await fetch('/api/youtube-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.success || !data.audioData) {
        throw new Error(data.error || 'Error al extraer audio')
      }

      const binaryString = atob(data.audioData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' })
      const fileName = `${data.title}.mp3`.replace(/[<>:"/\\|?*]/g, '_')
      const audioFile = new File([audioBlob], fileName, { type: 'audio/mpeg' })

      setExtractedAudio(audioFile)
      setVideoTitle(data.title)
    } catch (err: any) {
      console.error('YouTube extract error:', err)
      setError(err.message || 'Error al extraer audio')
    } finally {
      setIsExtracting(false)
    }
  }

  const handleDownload = () => {
    if (!extractedAudio) return
    const url = URL.createObjectURL(extractedAudio)
    const a = document.createElement('a')
    a.href = url
    a.download = extractedAudio.name
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-[100dvh] bg-[#121212] text-white">
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => router.push('/studio')}
            className="mobile-touch-target inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-[#d4d4d4] hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a Studio
          </button>
          <span className="text-xs text-[#737373]">Plan: {currentPlanId.toUpperCase()}</span>
        </div>

        <section className="rounded-xl border border-[#2a2a2a] bg-[#111] p-5 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Youtube className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-semibold">Extraer Audio de YouTube</h1>
          </div>

          <label className="mb-2 block text-sm font-medium text-zinc-300">URL del video</label>
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => {
              setYoutubeUrl(e.target.value)
              setError('')
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="mobile-touch-target w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-white placeholder:text-[#666] focus:border-red-500 focus:outline-none"
            disabled={isExtracting}
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

          <button
            onClick={handleExtract}
            disabled={isExtracting}
            className="mobile-touch-target mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isExtracting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Youtube className="h-5 w-5" />}
            {isExtracting ? 'Extrayendo...' : 'Extraer Audio'}
          </button>

          {extractedAudio && (
            <div className="mt-6 rounded-lg border border-[#2a2a2a] bg-[#151515] p-4">
              <p className="font-semibold text-white">{videoTitle}</p>
              <p className="mt-1 text-xs text-zinc-400">{(extractedAudio.size / 1024 / 1024).toFixed(2)} MB</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleDownload}
                  className="mobile-touch-target inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  <Download className="h-4 w-4" />
                  Descargar MP3
                </button>
                <button
                  onClick={() => router.push('/studio')}
                  className="mobile-touch-target rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-200 hover:text-white"
                >
                  Ir a Studio para separar
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
