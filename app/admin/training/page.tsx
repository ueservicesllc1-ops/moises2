'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Box, Check, Save, Music, AlertTriangle, Rocket, RefreshCw, X, BrainCircuit, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, getDocs, query, limit, doc, updateDoc, where, setDoc } from 'firebase/firestore'

// CREDENCIALES DIRECTAS DE ZION (freedommix-c5c3e) PARA CONECTIÓN EXTERNA
const zionFirebaseConfig = {
  apiKey: "AIzaSyB3GHmCQB-yvJr3iJ82CxAEgUU_N8QjgBU",
  authDomain: "freedommix-c5c3e.firebaseapp.com",
  projectId: "freedommix-c5c3e",
  storageBucket: "freedommix-c5c3e.firebasestorage.app",
  messagingSenderId: "830247648726",
  appId: "1:830247648726:web:fab37de48098e10184f877"
};

// Inicializar app secundaria para no pisar la de Moises2/Judith
const zionApp = getApps().find(app => app.name === 'zionApp') || initializeApp(zionFirebaseConfig, 'zionApp')
const zionDb = getFirestore(zionApp)

// Interface para las canciones subidas por usuarios a Zion
interface ZionSong {
  id: string
  name: string
  artist: string
  uploaderEmail: string
  tracksCount: number
  isCurated: boolean
  createdAt: string
  trackSources: Record<string, string>
  aiMapping?: TrackMapping | null
  rawData?: any
  trainingIgnored?: boolean
}

// Interface para el mapeo que hace el Admin
interface TrackMapping {
  vocals: string
  bass: string
  drums: string
  guitar: string
  piano: string
  other: string[] // El resto de tracks que iran mezclados
}

export default function AITrainingFactory() {
  const router = useRouter()
  const [songs, setSongs] = useState<ZionSong[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSong, setSelectedSong] = useState<ZionSong | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'curated'>('all')
  const [mapping, setMapping] = useState<TrackMapping>({ vocals: '', drums: '', bass: '', guitar: '', piano: '', other: [] })
  const [trainingBusy, setTrainingBusy] = useState(false)
  const [trainingCallId, setTrainingCallId] = useState<string | null>(null)
  const [trainingStatus, setTrainingStatus] = useState<'idle' | 'syncing' | 'training' | 'completed' | 'error'>('idle')
  const [trainingTimer, setTrainingTimer] = useState(0)
  const [totalDuration, setTotalDuration] = useState<number | null>(null)

  const COLLECTION_NAME = 'songs' // Cambia esto si Zion guarda en otra colección

  // Timer principal
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (trainingStatus === 'training' || trainingStatus === 'syncing') {
      interval = setInterval(() => {
        setTrainingTimer(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [trainingStatus])

  // Cargar estado guardado al iniciar
  useEffect(() => {
    const savedId = localStorage.getItem('activeTrainingCallId')
    const savedStart = localStorage.getItem('activeTrainingStartTime')
    if (savedId) {
      setTrainingCallId(savedId)
      setTrainingStatus('training')
      if (savedStart) {
        const secondsPassed = Math.floor((Date.now() - parseInt(savedStart)) / 1000)
        setTrainingTimer(secondsPassed)
      }
    }
  }, [])

  // Guardar estado cuando cambie
  useEffect(() => {
    if (trainingCallId) {
      localStorage.setItem('activeTrainingCallId', trainingCallId)
      if (!localStorage.getItem('activeTrainingStartTime')) {
        localStorage.setItem('activeTrainingStartTime', Date.now().toString())
      }
    } else {
      localStorage.removeItem('activeTrainingCallId')
      localStorage.removeItem('activeTrainingStartTime')
    }
  }, [trainingCallId])

  // Monitorear estado del entrenamiento si hay un callId activo
  useEffect(() => {
    if (!trainingCallId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/training/status/${trainingCallId}`)
        const data = await res.json()

        if (data.status === 'completed') {
          setTrainingStatus('completed')
          if (data.duration) setTotalDuration(data.duration)
          setTrainingCallId(null) // Dejar de consultar
          toast.success('¡Entrenamiento Finalizado! El modelo de 6 pistas ya está listo.', { duration: 10000 })
        } else if (data.status === 'running') {
          setTrainingStatus('training')
        } else if (data.status === 'error') {
          setTrainingStatus('error')
          setTrainingCallId(null)
          toast.error('Error en la nube: ' + data.message)
        }
      } catch (e) {
        console.error("Error consultando status:", e)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [trainingCallId])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const extractUrlFromValue = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }

    if (!value || typeof value !== 'object') return null

    const candidate = value as Record<string, unknown>
    const directKeys = ['url', 'fileUrl', 'downloadUrl', 'publicUrl', 'b2Url', 'path']
    for (const key of directKeys) {
      const direct = candidate[key]
      if (typeof direct === 'string' && direct.trim()) return direct.trim()
    }

    for (const nestedValue of Object.values(candidate)) {
      if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue.trim()
    }

    return null
  }

  const normalizeTrackSources = (data: Record<string, any>): Record<string, string> => {
    const normalized: Record<string, string> = {}

    // 1. EXTRAER DE LISTA 'tracks' (Estructura real de Zion Multitracks)
    if (Array.isArray(data.tracks)) {
      data.tracks.forEach((track: any) => {
        if (!track) return
        const name = track.name || track.originalName || 'Pista Desconocida'

        // FILTRO CRÍTICO: Ignorar la mezcla total de previsualización
        if (name === '__PreviewMix') return

        const url = track.normalizedUrl || track.url || extractUrlFromValue(track)
        if (name && url) {
          normalized[name] = url
        }
      })
    }

    // 2. EXTRAER DE 'stems' o 'files' (Otras variantes de Zion)
    const candidates = [data.stems, data.files, data.audioFiles, data.b2Urls]
    candidates.forEach(source => {
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        Object.entries(source).forEach(([key, val]) => {
          if (key === '__PreviewMix') return // Ignorar mezcla total
          const url = extractUrlFromValue(val)
          if (url && !normalized[key]) normalized[key] = url
        })
      }
    })

    // 3. ESCANEO PROFUNDO (Buscar cualquier URL de B2 en la raíz)
    Object.entries(data).forEach(([key, val]) => {
      if (key === '__PreviewMix') return
      if (typeof val === 'string' && val.includes('backblazeb2.com') && !normalized[key]) {
        if (!['id', 'fileUrl', 'cover'].includes(key)) {
          normalized[key] = val
        }
      }
    })

    // 4. FALLBACK: ARCHIVO ORIGINAL
    if (Object.keys(normalized).length === 0 && data.fileUrl) {
      normalized.Original = data.fileUrl
    }

    return normalized
  }

  const fetchZionSongs = async () => {
    setLoading(true)
    try {
      const songsRef = collection(zionDb, COLLECTION_NAME)
      const qMT = query(songsRef, where('tracks', '!=', null), limit(500))
      const snapshot = await getDocs(qMT)

      // Consultar curaciones e ignorados en Judith
      const judithDb = getFirestore()
      const curationsRef = collection(judithDb, 'zion_curations')
      const ignoredRef = collection(judithDb, 'zion_ignored')

      const [curationsSnap, ignoredSnap] = await Promise.all([
        getDocs(curationsRef),
        getDocs(ignoredRef)
      ])

      const localMappings = new Map()
      curationsSnap.forEach(d => localMappings.set(d.id, d.data()))

      const ignoredIds = new Set()
      ignoredSnap.forEach(d => ignoredIds.add(d.id))

      const liveSongs: ZionSong[] = []
      let skipped = 0

      snapshot.forEach(docSnap => {
        const data = docSnap.data()

        // Si está marcado como ignorado localmente, saltar
        if (ignoredIds.has(docSnap.id)) {
          skipped++; return
        }

        if (data.useType === 'chord') { skipped++; return }

        const trackSources = normalizeTrackSources(data)
        const localData = localMappings.get(docSnap.id)

        // Si no tiene audio real Y no la hemos curado localmente, ignorar
        if (Object.keys(trackSources).length === 0 && !localData) {
          skipped++; return
        }

        liveSongs.push({
          id: docSnap.id,
          name: data.name || data.title || 'Sin Título',
          artist: data.artist || 'Artista Desconocido',
          uploaderEmail: data.userEmail || data.uploaderEmail || 'Anónimo',
          tracksCount: Object.keys(trackSources).length,
          isCurated: !!localData,
          createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || 'N/A',
          trackSources,
          aiMapping: localData?.mapping || null,
          rawData: data
        })
      })

      setSongs(liveSongs)
      setLoading(false)
      toast.success(`${liveSongs.length} temas cargados (Sync Judith listo)`)
    } catch (error: any) {
      console.error("Error Firebase:", error)
      setLoading(false)
      toast.error('Error cargando Zion: ' + error.message)
    }
  }


  useEffect(() => {
    fetchZionSongs()
  }, [])

  useEffect(() => {
    if (selectedSong && Object.keys(selectedSong.trackSources).length > 0) {
      const saved = selectedSong.aiMapping
      if (saved && (saved.vocals || saved.drums || saved.bass || saved.guitar || saved.piano)) {
        setMapping(saved)
        return
      }

      // Auto-mapeo inteligente según nombres de Zion
      const tracks = Object.keys(selectedSong.trackSources)
      const newMapping: TrackMapping = { vocals: '', drums: '', bass: '', guitar: '', piano: '', other: [] }

      tracks.forEach(tk => {
        const low = tk.toLowerCase()

        // REGLA 1: VOCALES (Incluye BGVS, CHOIR y COROS)
        if (low.includes('voc') || low.includes('voice') || low.includes('bgvs') || low.includes('choir') || low.includes('coros')) {
          if (!newMapping.vocals) newMapping.vocals = tk
        }

        // REGLA 2: BATERIA
        else if (low.includes('drum') || low.includes('bat') || low.includes('kick') || low.includes('perc')) {
          if (!newMapping.drums) newMapping.drums = tk
        }

        // REGLA 3: BAJO
        else if (low.includes('bass') || low.includes('bajo')) {
          if (!newMapping.bass) newMapping.bass = tk
        }

        // REGLA 4: GUITARRA (EG1, GE1, GA, AG, Acustic, etc.)
        else if (low.match(/guitar|gtr|violao|guita|eg1|ge1|ga1|ga|ag|acustic|ebow/i)) {
          newMapping.guitar = tk
        }

        // REGLA 5: PIANO (Solo Piano puro)
        else if (low.includes('piano')) {
          newMapping.piano = tk
        }

        // OTROS
        else if (!low.match(/click|guia|metronomo|guide|cue|referencia|__previewmix/i)) {
          // Solo añadir a otros si NO fue asignado a una categoría principal arriba
          const alreadyAssigned = tk === newMapping.vocals || tk === newMapping.drums || tk === newMapping.bass || tk === newMapping.guitar || tk === newMapping.piano;
          if (!alreadyAssigned) {
            newMapping.other.push(tk)
          }
        }
      })
      setMapping(newMapping)
    }
  }, [selectedSong])

  // Función para asignar track a una categoría y limpiar de 'otros'
  const updateMainMapping = (category: keyof TrackMapping, trackId: string) => {
    setMapping(prev => {
      // Quitar el nuevo track de la lista de 'otros' si estaba ahí
      const newOther = prev.other.filter(tk => tk !== trackId);
      return {
        ...prev,
        [category]: trackId,
        other: newOther
      };
    });
  };


  const handleStartTraining = async () => {
    if (trainingBusy) return
    const curated = songs.filter(song => song.isCurated && song.aiMapping)

    if (curated.length === 0) {
      toast.error('No hay canciones curadas. Selecciona una, asígnale las pistas y pulsa "Guardar en Dataset" primero.')
      return
    }

    setTrainingBusy(true)
    setTrainingStatus('syncing')
    const loadingToast = toast.loading(`Sincronizando ${curated.length} temas y lanzando entrenamiento HTDemucs en Modal...`)

    try {
      const response = await fetch('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifest: {
            songs: curated.map(s => ({
              id: s.id,
              ai_mapping: s.aiMapping!,
              trackSources: s.trackSources
            }))
          },
          epochs: 20
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Fallo al iniciar entrenamiento')

      if (result.training_call_id) {
        setTrainingCallId(result.training_call_id)
        setTrainingStatus('training')
        toast.success('¡Sincronización completa! El entrenamiento ha comenzado en la nube.', { id: loadingToast })
      } else {
        toast.dismiss(loadingToast)
      }

    } catch (error: any) {
      setTrainingStatus('error')
      toast.dismiss(loadingToast)
      toast.error('Error: ' + error.message)
    } finally {
      toast.dismiss(loadingToast)
      setTrainingBusy(false)
    }
  }

  const handleCheckExistingModel = async () => {
    const checkToast = toast.loading('Buscando modelos en la nube...')
    try {
      const res = await fetch('/api/training/status/check_fallback')
      const data = await res.json()

      if (data.status === 'completed') {
        setTrainingStatus('completed')
        toast.success(`¡Modelo detectado! Archivos: ${data.files?.join(', ') || 'epoch_020.pt'}`, { id: checkToast })
      } else {
        toast('No se detectó ningún modelo completado aún en la nube.', { id: checkToast, icon: 'ℹ️' })
      }
    } catch (e) {
      toast.error('Error al verificar modelos en la nube.', { id: checkToast })
    }
  }

  const handleIgnoreSong = async (songId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const judithDb = getFirestore()
      // Guardar en nuestra DB local (Judith) que esta canción de Zion debe ignorarse
      await setDoc(doc(judithDb, 'zion_ignored', songId), {
        ignored: true,
        ignoredAt: new Date()
      })

      setSongs(prev => prev.map(s => s.id === songId ? { ...s, trainingIgnored: true } : s))
      toast.success('Canción ocultada localmente')
    } catch (e) {
      console.error("Error al ocultar:", e)
      toast.error('No se pudo ocultar la canción en la base de datos local')
    }
  }

  const handleCurate = async () => {
    if (!selectedSong) return

    // Validar mínimo
    const totalAssigned = !!mapping.vocals || !!mapping.drums || !!mapping.bass || !!mapping.guitar || !!mapping.piano || mapping.other.length > 0;
    if (!totalAssigned) {
      toast.error('Asigna al menos una pista antes de guardar.')
      return
    }

    const loadingToast = toast.loading('Guardando curación en base de datos local...')
    try {
      const judithDb = getFirestore()
      const curationRef = doc(judithDb, 'zion_curations', selectedSong.id)

      // Guardar en la base de datos de Judith (esta sí tenemos permisos de escritura)
      await setDoc(curationRef, {
        songId: selectedSong.id,
        songName: selectedSong.name,
        mapping: mapping,
        curatedAt: new Date().toISOString()
      }, { merge: true })

      setSongs(songs.map(s =>
        s.id === selectedSong.id ? { ...s, isCurated: true, aiMapping: mapping } : s
      ))

      toast.dismiss(loadingToast)
      toast.success(`✓ ${selectedSong.name} guardada permanentemente`)
      setSelectedSong(null)
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error('Error al guardar: ' + error.message)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-6">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Music className="w-8 h-8 text-blue-500" />
          <h1 className="text-2xl font-bold">Fábrica de IA (Dataset de Zion)</h1>
        </div>
        <div className="flex gap-4">
          <button onClick={fetchZionSongs} className="px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-all flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refrescar
          </button>
          <button
            onClick={handleStartTraining}
            disabled={trainingBusy}
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 group"
          >
            {trainingBusy ? (
              <RefreshCw className="w-6 h-6 animate-spin" />
            ) : (
              <BrainCircuit className="w-6 h-6 group-hover:scale-110 transition-transform" />
            )}
            {trainingBusy ? 'Procesando...' : 'Entrenar ahora'}
          </button>

          <button
            onClick={handleCheckExistingModel}
            disabled={trainingBusy}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold py-4 px-6 rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
            title="Verificar si ya existe un modelo entrenado en la nube"
          >
            <Search className="w-5 h-5" />
            Verificar Nube
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* LISTA DE CANCIONES */}
        <div className="col-span-4 bg-gray-900/50 rounded-2xl border border-gray-800 overflow-hidden flex flex-col h-[80vh]">
          <div className="p-4 border-b border-gray-800 bg-gray-900/80">
            {/* Contador total */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400">
                {loading ? 'Cargando...' : (
                  <>
                    <span className="text-white font-bold text-sm">{songs.length}</span> canciones con multipista
                  </>
                )}
              </span>
              <span className="text-xs text-gray-500">
                <span className="text-green-400 font-bold">{songs.filter(s => s.isCurated).length}</span> curadas
                {' / '}
                <span className="text-yellow-400 font-bold">{songs.filter(s => !s.isCurated).length}</span> pendientes
              </span>
            </div>

            {/* MONITOR DE ESTADO - Posición Final */}
            {trainingStatus !== 'idle' && (
              <div className={`p-4 rounded-xl border mb-4 transition-all ${trainingStatus === 'training' ? 'bg-blue-600/10 border-blue-500 animate-pulse' :
                  trainingStatus === 'syncing' ? 'bg-yellow-600/10 border-yellow-500 animate-pulse' :
                    trainingStatus === 'completed' ? 'bg-green-600/10 border-green-500' : 'bg-red-600/20 border-red-500'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${trainingStatus === 'training' ? 'bg-blue-500' :
                      trainingStatus === 'syncing' ? 'bg-yellow-500' :
                        trainingStatus === 'completed' ? 'bg-green-500' : 'bg-red-500'
                    }`}>
                    {trainingStatus === 'syncing' ? <RefreshCw className="w-4 h-4 text-black animate-spin" /> : <Rocket className="w-4 h-4 text-black" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider">
                        {trainingStatus === 'training' ? 'Entrenando' :
                          trainingStatus === 'syncing' ? 'Sincronizando' :
                            trainingStatus === 'completed' ? 'Finalizado' : 'Error'}
                      </div>
                      <button
                        onClick={() => {
                          setTrainingStatus('idle')
                          setTrainingCallId(null)
                          setTrainingBusy(false)
                          toast.success('Estado reiniciado localmente')
                        }}
                        className="p-1 hover:bg-white/10 rounded-md transition-colors"
                        title="Cancelar/Reiniciar vista"
                      >
                        <X className="w-3 h-3 text-gray-500 hover:text-white" />
                      </button>
                    </div>
                    <div className="text-[9px] text-gray-400">
                      {trainingStatus === 'training' ? `Entrenando (${formatTime(trainingTimer)})...` :
                        trainingStatus === 'syncing' ? `Preparando dataset (${formatTime(trainingTimer)})...` :
                          trainingStatus === 'completed' ? `Completado en ${totalDuration ? formatTime(Math.round(totalDuration)) : formatTime(trainingTimer)}` : 'Fallo en la conexión.'}
                    </div>
                  </div>
                </div>
                {trainingStatus === 'completed' && totalDuration && (
                  <div className="mt-2 text-[10px] text-green-400 font-mono text-center">
                    Costo estimado Modal: ${(totalDuration / 3600 * 3.5).toFixed(3)} (GPU T4)
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setFilter('all')} className={`flex-1 py-1 rounded text-xs ${filter === 'all' ? 'bg-gray-600' : 'bg-gray-800'}`}>Todas</button>
              <button onClick={() => setFilter('pending')} className={`flex-1 py-1 rounded text-xs ${filter === 'pending' ? 'bg-blue-600' : 'bg-gray-800'}`}>Pendientes</button>
              <button onClick={() => setFilter('curated')} className={`flex-1 py-1 rounded text-xs ${filter === 'curated' ? 'bg-green-600' : 'bg-gray-800'}`}>Curadas</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loading ? (
              <div className="text-center py-20 text-gray-500">Buscando en Zion...</div>
            ) : songs.filter(s => {
              if (s.rawData?.trainingIgnored) return false;
              return filter === 'all' || (filter === 'pending' ? !s.isCurated : s.isCurated);
            }).map(song => (
              <div
                key={song.id}
                onClick={() => setSelectedSong(song)}
                className={`group p-4 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${selectedSong?.id === song.id
                    ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/10'
                    : song.isCurated
                      ? 'bg-green-600/5 border-green-500/50 hover:border-green-400'
                      : 'bg-gray-800/50 border-gray-700 hover:border-gray-500'
                  }`}
              >
                {/* Boton para ignorar/ocultar */}
                {!song.isCurated && (
                  <button
                    onClick={(e) => handleIgnoreSong(song.id, e)}
                    className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-all z-20"
                    title="Ocultar de la lista de entrenamiento"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {song.isCurated && (
                  <div className="absolute top-0 right-0 bg-green-500 text-[9px] font-bold text-black px-2 py-0.5 rounded-bl-lg shadow-sm">
                    CURADA
                  </div>
                )}
                <div className="font-bold pr-12 truncate">{song.name}</div>
                <div className="text-sm text-gray-400 truncate">{song.artist}</div>
                <div className="mt-2 flex justify-between items-center">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${song.tracksCount > 1 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                    {song.tracksCount} stems localizados
                  </span>
                  {song.isCurated && <Music className="w-3 h-3 text-green-500 animate-pulse" />}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MESA DE TRABAJO */}
        <div className="col-span-8 space-y-6">
          {selectedSong ? (
            <>
              <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
                <h2 className="text-3xl font-bold mb-2">{selectedSong.name}</h2>
                <p className="text-gray-400 mb-8">{selectedSong.artist}</p>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Vocal / Coros</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white" value={mapping.vocals} onChange={e => updateMainMapping('vocals', e.target.value)}>
                        <option value="">-- Ignorar --</option>
                        {Object.keys(selectedSong.trackSources).map(tk => <option key={tk} value={tk}>{tk}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Batería / Percusión</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white" value={mapping.drums} onChange={e => updateMainMapping('drums', e.target.value)}>
                        <option value="">-- Ignorar --</option>
                        {Object.keys(selectedSong.trackSources).map(tk => <option key={tk} value={tk}>{tk}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Bajo Eléctrico / Sintético</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white" value={mapping.bass} onChange={e => updateMainMapping('bass', e.target.value)}>
                        <option value="">-- Ignorar --</option>
                        {Object.keys(selectedSong.trackSources).map(tk => <option key={tk} value={tk}>{tk}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Guitarras (Acústicas/Eléctricas)</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white" value={mapping.guitar} onChange={e => updateMainMapping('guitar', e.target.value)}>
                        <option value="">-- Ignorar --</option>
                        {Object.keys(selectedSong.trackSources).map(tk => <option key={tk} value={tk}>{tk}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Piano / Teclados / Pads</label>
                      <select className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white" value={mapping.piano} onChange={e => updateMainMapping('piano', e.target.value)}>
                        <option value="">-- Ignorar --</option>
                        {Object.keys(selectedSong.trackSources).map(tk => <option key={tk} value={tk}>{tk}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="bg-blue-900/10 border border-blue-800/50 rounded-xl p-6">
                    <label className="block text-xs font-bold text-blue-400 uppercase mb-4">Otros (Mezcla Automática)</label>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto pr-2">
                      {Object.keys(selectedSong.trackSources).map(tk => (
                        <label key={tk} className={`flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-all ${mapping.other.includes(tk) ? 'bg-blue-600/30 border-blue-500' : 'bg-gray-800 border-gray-700'}`}>
                          <input type="checkbox" checked={mapping.other.includes(tk)} onChange={e => {
                            if (e.target.checked) setMapping({ ...mapping, other: [...mapping.other, tk] })
                            else setMapping({ ...mapping, other: mapping.other.filter(x => x !== tk) })
                          }} className="w-4 h-4" />
                          <span className="text-sm truncate">{tk}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <button onClick={handleCurate} className="w-full mt-8 py-4 bg-green-600 rounded-xl font-bold text-xl hover:bg-green-500 transition-all flex items-center justify-center gap-3">
                  <Check className="w-6 h-6" /> GUARDAR EN DATASET
                </button>
              </div>

              {/* PANEL DE DEBUG REAL */}
              <div className="bg-black/40 rounded-xl border border-gray-800 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                    <Box className="w-4 h-4" /> Diagnóstico de Datos (Zion Firestore)
                  </h3>
                  <span className="text-[10px] text-blue-500 font-mono">ID: {selectedSong.id}</span>
                </div>
                <pre className="text-[10px] text-gray-400 font-mono overflow-x-auto p-4 bg-black/60 rounded-lg max-h-[300px]">
                  {JSON.stringify(selectedSong.rawData, null, 2)}
                </pre>
              </div>
            </>
          ) : (
            <div className="h-[60vh] flex flex-col items-center justify-center text-gray-600 bg-gray-900/30 rounded-2xl border border-dashed border-gray-800">
              <Box className="w-16 h-16 mb-4 opacity-20" />
              <p>Selecciona una multipista para empezar el proceso de curación.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
