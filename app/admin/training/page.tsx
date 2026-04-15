'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Box, Check, Save, Music, AlertTriangle, Rocket } from 'lucide-react'
import toast from 'react-hot-toast'
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, collection, getDocs, query, limit, doc, updateDoc } from 'firebase/firestore'

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
}

// Interface para el mapeo que hace el Admin
interface TrackMapping {
  vocals: string
  bass: string
  drums: string
  other: string[] // El resto de tracks que iran mezclados
}

export default function AITrainingFactory() {
  const router = useRouter()
  const [songs, setSongs] = useState<ZionSong[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSong, setSelectedSong] = useState<ZionSong | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'curated'>('all')
  const [mapping, setMapping] = useState<TrackMapping>({ vocals: '', drums: '', bass: '', other: [] })
  const [trainingBusy, setTrainingBusy] = useState(false)
  
  // TODO: Confirma el nombre exacto de la colección de Zion. 
  // En este código he puesto 'library', pero si Zion usa 'songs' o 'multitracks', solo cámbialo aquí abajo.
  const COLLECTION_NAME = 'songs' // Cambia esto si Zion guarda en otra colección

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
    const candidates: unknown[] = [
      data.stems,
      data.b2Urls,
      data.tracks,
      data.separatedTracks,
      data.sources,
      data.ai_mapping?.sources
    ]

    const normalized: Record<string, string> = {}

    for (const source of candidates) {
      if (!source || typeof source !== 'object' || Array.isArray(source)) continue

      for (const [rawKey, rawValue] of Object.entries(source as Record<string, unknown>)) {
        const key = String(rawKey).trim()
        if (!key || normalized[key]) continue
        const url = extractUrlFromValue(rawValue)
        if (url) normalized[key] = url
      }
    }

    if (Object.keys(normalized).length === 0 && typeof data.fileUrl === 'string' && data.fileUrl.trim()) {
      normalized.original = data.fileUrl.trim()
    }

    return normalized
  }
  
  const fetchZionSongs = async () => {
    setLoading(true)
    try {
      const songsRef = collection(zionDb, COLLECTION_NAME)
      const q = query(songsRef, limit(50)) // Sin orderBy para no requerir índice de Firebase
      
      const snapshot = await getDocs(q)
      const liveSongs: ZionSong[] = []
      
      snapshot.forEach(doc => {
        const data = doc.data()
        const trackSources = normalizeTrackSources(data)
        const trackCount = Object.keys(trackSources).length || 1
        
        const rawMap = data.ai_mapping
        const aiMapping: TrackMapping | null =
          rawMap && typeof rawMap === 'object'
            ? {
                vocals: String(rawMap.vocals || ''),
                drums: String(rawMap.drums || ''),
                bass: String(rawMap.bass || ''),
                other: Array.isArray(rawMap.other) ? rawMap.other.map(String) : [],
              }
            : null

        liveSongs.push({
          id: doc.id,
          name: data.title || data.name || 'Sin Título',
          artist: data.artist || 'Artista Desconocido',
          uploaderEmail: data.userId || data.uploaderEmail || 'Anónimo',
          tracksCount: trackCount,
          isCurated: data.isCurated || false, // Asume falso si nunca se ha curado
          createdAt: data.createdAt?.toDate?.()?.toLocaleDateString() || data.uploadedAt || 'N/A',
          trackSources,
          aiMapping,
        })
      })
      
      if (liveSongs.length === 0) {
        toast.error(`No se encontraron canciones en la colección "${COLLECTION_NAME}"`)
      }
      
      setSongs(liveSongs)
      setLoading(false)
      
    } catch (error: any) {
      console.error("Error Firebase:", error)
      toast.error('Error cargando las pistas de Firestore: ' + error.message)
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchZionSongs()
  }, [])

  // Auto-mapeo o mapeo guardado al seleccionar una canción
  useEffect(() => {
    if (selectedSong && Object.keys(selectedSong.trackSources).length > 0) {
      const saved = selectedSong.aiMapping
      if (saved && saved.vocals && saved.drums && saved.bass && saved.other?.length) {
        setMapping(saved)
        return
      }
      const tracks = Object.keys(selectedSong.trackSources)
      const newMapping: TrackMapping = { vocals: '', drums: '', bass: '', other: [] }

      tracks.forEach(tk => {
        const low = tk.toLowerCase()
        if (low.includes('voc') || low.includes('coro')) newMapping.vocals = tk
        else if (low.includes('drum') || low.includes('bat')) newMapping.drums = tk
        else if (low.includes('bass') || low.includes('bajo')) newMapping.bass = tk
        else if (!low.match(/click|guia|metronomo|guide|cue|referencia|conteo/)) {
          newMapping.other.push(tk)
        }
      })
      setMapping(newMapping)
    }
  }, [selectedSong])

  const handleStartTraining = async () => {
    if (trainingBusy) return
    const curated = songs.filter(song => song.isCurated && song.aiMapping)

    if (curated.length === 0) {
      toast.error(
        'No hay canciones curadas con mapeo guardado. Cura al menos una (vocals/drums/bass/other) y vuelve a intentar.'
      )
      return
    }

    const incomplete = curated.filter(
      s =>
        !s.aiMapping?.vocals ||
        !s.aiMapping?.drums ||
        !s.aiMapping?.bass ||
        !s.aiMapping?.other?.length
    )
    if (incomplete.length > 0) {
      toast.error('Algunas canciones curadas no tienen mapeo completo. Abre cada una y guarda de nuevo o recarga.')
      return
    }

    const manifest = {
      songs: curated.map(s => ({
        id: s.id,
        ai_mapping: s.aiMapping!,
        trackSources: s.trackSources,
      })),
    }

    setTrainingBusy(true)
    const loadingToast = toast.loading(`Sincronizando ${curated.length} canciones y lanzando entrenamiento HTDemucs en Modal...`)

    try {
      const response = await fetch('/api/training/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manifest, epochs: 20 }),
      })
      const result = await response.json()
      if (!response.ok) {
        const detail = result?.detail
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg || '').filter(Boolean).join(' ')
              : result?.error || 'No se pudo iniciar entrenamiento'
        throw new Error(msg)
      }

      toast.dismiss(loadingToast)
      toast.success(
        result?.message ||
          'Dataset sincronizado; entrenamiento en Modal. Checkpoint: volumen zion-demucs-dataset → checkpoints/latest.th'
      )
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error('Error iniciando entrenamiento: ' + error.message)
    } finally {
      setTrainingBusy(false)
    }
  }

  const handleCurate = async () => {
    if (!selectedSong) return
    
    if (!mapping.vocals || !mapping.drums || !mapping.bass || mapping.other.length === 0) {
      toast.error('Debes asignar al menos una pista a cada categoría (Vocals, Drums, Bass, Other) antes de curar.');
      return;
    }
    
    const loadingToast = toast.loading('Guardando estado de curación en Zion DB...');
    
    try {
      // 1. Referencia al documento en la base de datos de Zion
      const songRef = doc(zionDb, COLLECTION_NAME, selectedSong.id);
      
      // 2. Guardamos que ya está curada y opcionalmente el mapeo que elegimos
      await updateDoc(songRef, {
        isCurated: true,
        ai_mapping: mapping, // Guardamos el mapeo por si queremos re-procesar
        curatedAt: new Date().toISOString()
      });

      toast.dismiss(loadingToast);
      toast.success('¡Pista Curada en Firestore! El estado ahora es permanente.');
      
      // Actualizar estado local para que se mueva de pestaña inmediatamente
      setSongs(
        songs.map(s =>
          s.id === selectedSong.id ? { ...s, isCurated: true, aiMapping: { ...mapping } } : s
        )
      );
      setSelectedSong(null);
      
    } catch (error: any) {
      console.error("Error al curar:", error);
      toast.dismiss(loadingToast);
      toast.error('Fallo al guardar en DB: ' + error.message);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-gray-900 text-white">
      {/* Header */}
      <div className="min-h-[64px] bg-gray-800 border-b border-gray-700 flex items-center px-3 sm:px-6 sticky top-0 z-10">
        <button
          onClick={() => router.push('/admin')}
          className="mobile-touch-target flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="hidden sm:inline font-medium">Volver a Admin</span>
        </button>
        <div className="mx-auto flex items-center space-x-2 sm:space-x-3">
          <Box className="w-6 h-6 text-red-500" />
          <h1 className="text-sm sm:text-xl font-bold text-white">Fábrica de Inteligencia Artificial (Dataset)</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 p-3 sm:p-6">
        {/* Columna Izquierda: Lista de Pistas en Zion */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col h-[calc(100dvh-108px)] md:h-[calc(100vh-120px)]">
          <div className="p-4 border-b border-gray-700 bg-gray-800/80 backdrop-blur-sm flex justify-between items-center">
            <div>
              <h2 className="font-bold text-lg flex items-center gap-2">
                <Music className="w-5 h-5 text-blue-400" />
                Multipistas en Zion Stage
              </h2>
              <p className="text-xs text-gray-400 mt-1">Selecciona canciones crudas para procesarlas hacia la IA.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleStartTraining}
                disabled={trainingBusy}
                className={`mobile-touch-target text-sm px-3 py-1 rounded text-white flex items-center gap-1 ${
                  trainingBusy ? 'bg-indigo-900/70 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                <Rocket className="w-4 h-4" />
                {trainingBusy ? 'Entrenando...' : 'Entrenar IA'}
              </button>
              <button onClick={fetchZionSongs} className="mobile-touch-target text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
                Refrescar
              </button>
            </div>
          </div>
          
          <div className="flex border-b border-gray-700 bg-gray-800/80">
            <button 
              onClick={() => setFilter('all')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${filter === 'all' ? 'text-white border-b-2 border-blue-500' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Todas
            </button>
            <button 
              onClick={() => setFilter('pending')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${filter === 'pending' ? 'text-yellow-400 border-b-2 border-yellow-500' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Por Curar
            </button>
            <button 
              onClick={() => setFilter('curated')}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${filter === 'curated' ? 'text-green-400 border-b-2 border-green-500' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Curadas
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-700/50 rounded-lg"></div>)}
              </div>
            ) : songs.length === 0 ? (
              <div className="text-center py-10 text-gray-500">No hay canciones en esta categoría.</div>
            ) : (
              songs.filter(song => {
                if (filter === 'pending') return !song.isCurated
                if (filter === 'curated') return song.isCurated
                return true
              }).map((song) => (
                <div 
                  key={song.id} 
                  onClick={() => setSelectedSong(song)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${
                    selectedSong?.id === song.id 
                    ? 'bg-blue-900/40 border-blue-500' 
                    : 'bg-gray-700/40 border-gray-700 hover:border-gray-500 hover:bg-gray-700'
                  }`}
                >
                  <div>
                    <h3 className="font-bold text-gray-100">{song.name} <span className="text-gray-400 font-normal">· {song.artist}</span></h3>
                    <div className="flex gap-3 text-xs text-gray-400 mt-2">
                      <span className="bg-gray-800 px-2 py-0.5 rounded">{song.tracksCount} stems</span>
                      <span>Subido por: {song.uploaderEmail}</span>
                    </div>
                  </div>
                  <div>
                    {song.isCurated ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full border border-green-400/20">
                        <Check className="w-3 h-3" /> CURADO
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-yellow-500 bg-yellow-500/10 px-3 py-1 rounded-full border border-yellow-500/20">
                        PENDIENTE
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Columna Derecha: El Panel de Curación Mágico */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col h-[calc(100dvh-108px)] md:h-[calc(100vh-120px)] overflow-hidden">
          {selectedSong ? (
            <div className="flex flex-col h-full">
              <div className="p-6 border-b border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900">
                <span className="text-xs font-bold text-red-500 tracking-wider">MESA DE CURACIÓN</span>
                <h2 className="text-2xl font-bold mt-1 text-white">{selectedSong.name}</h2>
                <p className="text-sm text-gray-400">{selectedSong.artist}</p>
                
                {selectedSong.isCurated && (
                  <div className="mt-4 bg-green-900/30 border border-green-800 text-green-300 p-3 rounded text-sm flex items-start gap-2">
                    <Check className="w-5 h-5 flex-shrink-0" />
                    Esta canción ya fue estructurada y está lista en B2 de manera segura en el formato Demucs 4-stem.
                  </div>
                )}
              </div>

              <div className="p-6 flex-1 overflow-y-auto">
                <div className="bg-orange-900/20 border border-orange-800/50 rounded-lg p-4 mb-6">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-6 h-6 text-orange-500 flex-shrink-0" />
                    <div className="text-sm text-orange-200">
                      <p className="font-bold text-orange-400 mb-1">¡Cuidado con el Click Track!</p>
                      Asegúrate de NO incluir la pista del metrónomo o la guía vocal en el grupo &quot;Otros&quot;, o la Inteligencia Artificial se arruinará aprendiendo a generar clics.
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="font-semibold text-gray-300 border-b border-gray-700 pb-2">Asignación de Pistas:</h3>
                  
                  {/* Pista de Voz / Coros */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Vocals (Voz/Coros)</label>
                    <select 
                      className="w-full mt-1 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-blue-300"
                      onChange={(e) => setMapping({...mapping, vocals: e.target.value})}
                      value={mapping.vocals}
                    >
                      <option value="">-- Seleccionar Pista --</option>
                      {Object.keys(selectedSong.trackSources || {}).map(tk => (
                        <option key={tk} value={tk}>{tk}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pista de Batería */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Drums (Batería)</label>
                    <select 
                      className="w-full mt-1 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-blue-300"
                      onChange={(e) => setMapping({...mapping, drums: e.target.value})}
                      value={mapping.drums}
                    >
                      <option value="">-- Seleccionar Pista --</option>
                      {Object.keys(selectedSong.trackSources || {}).map(tk => (
                        <option key={tk} value={tk}>{tk}</option>
                      ))}
                    </select>
                  </div>

                  {/* Pista de Bajo */}
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Bass (Bajo)</label>
                    <select 
                      className="w-full mt-1 bg-gray-900 border border-gray-700 rounded p-2 text-sm text-blue-300"
                      onChange={(e) => setMapping({...mapping, bass: e.target.value})}
                      value={mapping.bass}
                    >
                      <option value="">-- Seleccionar Pista --</option>
                      {Object.keys(selectedSong.trackSources || {}).map(tk => (
                        <option key={tk} value={tk}>{tk}</option>
                      ))}
                    </select>
                  </div>

                  {/* Multiselección para Other */}
                  <div className="bg-purple-900/10 border border-purple-800/30 p-4 rounded-lg">
                    <label className="text-xs font-bold text-purple-400 uppercase">Other (Mezcla de Instrumentos)</label>
                    <p className="text-[10px] text-gray-500 mb-2">Selecciona todo lo que No sea click/guia para mezclar en un solo archivo.</p>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(selectedSong.trackSources || {}).map(tk => {
                        const isExcluded = tk.toLowerCase().match(/click|guia|metronomo|guide|cue/);
                        return (
                          <label key={tk} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-xs ${
                            mapping.other.includes(tk) ? 'bg-purple-900/40 border-purple-500 text-purple-200' : 'bg-gray-900 border-gray-700 text-gray-400'
                          }`}>
                            <input 
                              type="checkbox" 
                              checked={mapping.other.includes(tk)}
                              onChange={(e) => {
                                if (e.target.checked) setMapping({...mapping, other: [...mapping.other, tk]})
                                else setMapping({...mapping, other: mapping.other.filter(x => x !== tk)})
                              }}
                              className="hidden"
                            />
                            {tk}
                            {isExcluded && (
                              <AlertTriangle
                                className="w-3 h-3 text-red-500"
                                aria-label="Posible click detectado"
                              />
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-6 border-t border-gray-700 bg-gray-800/80 backdrop-blur-sm">
                <button
                  disabled={selectedSong.isCurated}
                  onClick={handleCurate}
                  className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-lg transition-all ${
                    selectedSong.isCurated 
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white shadow-lg shadow-red-900/20 hover:scale-[1.02]'
                  }`}
                >
                  <Save className="w-5 h-5" />
                  {selectedSong.isCurated ? 'Ya Curada' : 'CURAR Y TRANSFERIR A IA'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 items-center justify-center p-8 text-center text-gray-500">
              <Box className="w-16 h-16 mb-4 opacity-20" />
              <h3 className="text-xl font-medium text-gray-400 mb-2">Ninguna canción seleccionada</h3>
              <p className="text-sm">Selecciona una pista de Zion a la izquierda para inspeccionar sus audios y preparar su formato matemático.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
