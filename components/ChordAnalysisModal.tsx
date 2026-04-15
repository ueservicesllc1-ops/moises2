'use client'

import React, { useState, useRef, useEffect } from 'react'
import { 
  X, Upload, Music2, Loader2, Play, Pause, 
  RotateCcw, Scale, Activity, Globe, Info, Clock, 
  ChevronRight, Volume2, Heart
} from 'lucide-react'
import AdminModalLabel from './AdminModalLabel'

interface ChordAnalysisModalProps {
  isOpen: boolean
  onClose: () => void
  isPremium: boolean
  embedded?: boolean
}

interface ChordInfo {
  time: number
  endTime?: number
  chord: string
  confidence: number
}

interface AnalysisHistoryItem {
  id: string
  name: string
  createdAt: number
  chordCount: number
  keyLabel: string
  chords: ChordInfo[]
  key: { key: string; mode: string } | null
}

const ChordAnalysisModal: React.FC<ChordAnalysisModalProps> = ({ isOpen, onClose, isPremium, embedded = false }) => {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [chords, setChords] = useState<ChordInfo[]>([])
  const [detectedKey, setDetectedKey] = useState<{key: string; mode: string} | null>(null)
  const [currentAnalysisName, setCurrentAnalysisName] = useState('')
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisHistoryItem[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])
  const HISTORY_KEY = 'chord-analysis-history-v1'

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as AnalysisHistoryItem[]
      if (Array.isArray(parsed)) setAnalysisHistory(parsed)
    } catch {
      // ignore corrupt local history
    }
  }, [])

  const persistHistory = (items: AnalysisHistoryItem[]) => {
    setAnalysisHistory(items)
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items))
    } catch {
      // ignore storage quota errors
    }
  }

  // Cleanup audio URL memory
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  // Audio Playback Sync
  useEffect(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      const onTimeUpdate = () => setCurrentTime(audio.currentTime)
      const onLoaded = () => setDuration(audio.duration)
      const onEnded = () => setIsPlaying(false)
      
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('loadedmetadata', onLoaded)
      audio.addEventListener('ended', onEnded)
      
      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.removeEventListener('loadedmetadata', onLoaded)
        audio.removeEventListener('ended', onEnded)
        audio.pause()
      }
    }
  }, [audioUrl])

  // Update cards ref size
  useEffect(() => {
    cardsRef.current = cardsRef.current.slice(0, chords.length)
  }, [chords])

  // Auto-scroll logic (Horizontal Centering)
  useEffect(() => {
    const activeIndex = chords.findIndex((c, i) => 
      currentTime >= c.time && (i === chords.length - 1 || currentTime < chords[i+1].time)
    )
    if (activeIndex !== -1 && cardsRef.current[activeIndex]) {
      cardsRef.current[activeIndex]?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest',
        inline: 'center'
      })
    }
  }, [currentTime, chords])

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return
    if (isPlaying) audioRef.current.pause()
    else audioRef.current.play()
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const analyzeChords = async (file: File) => {
    if (!isPremium) throw new Error("Feature specialized for Premium users.")
    
    // Step 1: Upload
    const formData = new FormData()
    formData.append('file', file)
    
    const upRes = await fetch('/api/analyze-chords', { method: 'POST', body: formData })
    if (!upRes.ok) {
      const errorData = await upRes.json().catch(() => null as any)
      const detail = errorData?.details || errorData?.error
      throw new Error(detail ? `Failed to reach AI engine: ${detail}` : 'Failed to reach AI engine.')
    }
    
    const { task_id } = await upRes.json()
    
    // Step 2: Polling with exponential backoff feel
    let status = 'processing'
    let data : any = null
    
    while (status !== 'completed') {
      await new Promise(r => setTimeout(r, 1500))
      const res = await fetch(`/api/chord-analysis/${task_id}`)
      data = await res.json()
      status = data.status
      if (status === 'failed') throw new Error(data.error || 'AI analysis failed.')
    }
    
    return {
      chords: (data.chords || []).map((c: any) => ({
        time: c.start_time,
        chord: c.chord,
        confidence: c.confidence
      })),
      key: data.key ? { key: data.key.key, mode: data.key.mode } : null
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setCurrentAnalysisName(file.name)
    setAudioFile(file)
    setAudioUrl(URL.createObjectURL(file))
    setIsAnalyzing(true)
    setChords([])
    setDetectedKey(null)

    try {
      const result = await analyzeChords(file)
      setChords(result.chords)
      setDetectedKey(result.key)
      const keyLabel = result.key ? `${result.key.key} ${result.key.mode}` : 'N/A'
      const item: AnalysisHistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        createdAt: Date.now(),
        chordCount: result.chords.length,
        keyLabel,
        chords: result.chords,
        key: result.key,
      }
      const deduped = analysisHistory.filter((h) => h.name !== item.name)
      persistHistory([item, ...deduped].slice(0, 25))
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const startNewAnalysis = () => {
    if (audioRef.current) audioRef.current.pause()
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setAudioFile(null)
    setAudioUrl(null)
    setChords([])
    setDetectedKey(null)
    setCurrentAnalysisName('')
  }

  const loadHistoryAnalysis = (item: AnalysisHistoryItem) => {
    if (audioRef.current) audioRef.current.pause()
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    setAudioFile(null)
    setAudioUrl(null)
    setCurrentAnalysisName(item.name)
    setDetectedKey(item.key)
    setChords(item.chords)
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!embedded && !isOpen) return null

  return (
    <div className={embedded ? 'font-sans' : 'fixed inset-0 z-[10000] flex items-center justify-center bg-[#0a0a0c]/98 p-2 md:p-4 font-sans backdrop-blur-sm'}>
      {!embedded && <AdminModalLabel modalName="ChordAnalysisModal_ULTIMATE" />}
      
      <div
        className={`relative group flex w-full flex-col overflow-hidden border border-white/5 bg-[#141417] ${
          embedded
            ? 'min-h-[70vh] rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]'
            : 'h-[100dvh] md:h-[85vh] max-w-5xl rounded-[1.25rem] md:rounded-[2rem] shadow-[0_32px_128px_rgba(0,0,0,0.8)]'
        }`}
      >
        
        {/* Glow Effects */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] pointer-events-none rounded-full" />

        {/* Top Header */}
        <div className="px-10 py-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg ring-1 ring-white/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">AI Harmonic Engine <span className="text-blue-500 text-sm font-mono align-top ml-1">v4.0</span></h2>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-widest">Advanced Professional Analysis</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col p-8 overflow-hidden">
          
          {!audioFile && !isAnalyzing && chords.length === 0 ? (
            <div className="flex flex-1 flex-col gap-4 overflow-hidden">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 border-2 border-dashed border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center group cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/[0.02] transition-all relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/[0.01] pointer-events-none" />
                <div className="w-24 h-24 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-500 ring-1 ring-white/10">
                  <Upload className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Cargar Archivo de Audio</h3>
                <p className="text-gray-500 max-w-sm text-center px-10">MP3, WAV o M4A. Nuestro motor IA separará las armonías para una detección precisa.</p>
                <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
              </div>

              {analysisHistory.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-2xl border border-white/5 bg-[#17171c] p-3">
                  <div className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">Canciones analizadas</div>
                  <div className="space-y-2">
                    {analysisHistory.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => loadHistoryAnalysis(item)}
                        className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-[#1f1f25] px-3 py-2 text-left hover:border-blue-400/40"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{item.name}</div>
                          <div className="text-[11px] text-gray-400">
                            {item.keyLabel} · {item.chordCount} acordes
                          </div>
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : isAnalyzing ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8">
              <div className="relative">
                <div className="w-32 h-32 border-4 border-blue-500/20 rounded-full" />
                <div className="w-32 h-32 border-4 border-blue-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
                <Loader2 className="w-10 h-10 text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-2">Escaneando Armonías...</h3>
                <p className="text-gray-500 font-medium animate-pulse">Isolating instrument layers & pitch frequency bins</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              
              {/* Header Info Bar */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div className="bg-[#1a1a1e] border border-white/5 p-5 rounded-3xl flex items-center space-x-4">
                  <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                    <Music2 className="text-blue-400" />
                  </div>
                  <div className="flex-1 truncate">
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Archivo</p>
                    <p className="text-white font-bold truncate text-sm">{audioFile?.name || currentAnalysisName || 'Análisis guardado'}</p>
                  </div>
                </div>
                <div className="bg-[#1a1a1e] border border-white/5 p-5 rounded-3xl flex items-center space-x-4 pr-10">
                  <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
                    <Scale className="text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Tonalidad Estimada</p>
                    <p className="text-white font-black text-xl leading-none">
                      {detectedKey ? `${detectedKey.key} ${detectedKey.mode}` : 'Calculando...'}
                    </p>
                  </div>
                </div>
                <div className="bg-[#1a1a1e] border border-white/5 p-5 rounded-3xl flex items-center space-x-4">
                  <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center">
                    <Volume2 className="text-purple-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Eventos Detectados</p>
                    <p className="text-white font-black text-xl leading-none">{chords.length}</p>
                  </div>
                </div>
              </div>

              {/* Pro Player Console */}
              <div className="bg-gradient-to-br from-[#1a1a1e] to-[#141416] border border-white/10 rounded-[2.5rem] p-8 mb-8 shadow-2xl relative">
                <div className="flex items-center justify-between mb-8">
                  <button 
                    onClick={togglePlay}
                    className="w-20 h-20 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(37,99,235,0.4)] transition-all hover:scale-105 active:scale-95 group"
                  >
                    {isPlaying ? <Pause size={32} fill="white" /> : <Play size={32} fill="white" className="ml-2" />}
                  </button>
                  
                  <div className="flex-1 px-12 flex flex-col space-y-3">
                    <div className="flex justify-between text-xs font-black text-gray-400 font-mono">
                      <span>{formatTime(currentTime)}</span>
                      <div className="flex space-x-2 text-blue-500/60 uppercase tracking-[0.2em] font-sans text-[8px] animate-pulse">
                        <Activity size={10} />
                        <span>Harmonic Engine Sync Activeing</span>
                      </div>
                      <span>{formatTime(duration)}</span>
                    </div>
                    <div className="relative h-2 w-full bg-white/5 rounded-full overflow-hidden">
                      <input 
                        type="range" min={0} max={duration} step={0.01} 
                        value={currentTime} onChange={handleSeek}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-75"
                        style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={() => { if(audioRef.current) audioRef.current.currentTime = 0 }}
                    className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all border border-white/5"
                  >
                    <RotateCcw size={20} />
                  </button>
                </div>
                
                {/* Visual Decorative EQ */}
                <div className="flex items-end justify-center space-x-1 h-12 opacity-20 group-hover:opacity-40 transition-opacity">
                  {[...Array(60)].map((_, i) => (
                    <div 
                      key={i} 
                      className={`w-0.5 rounded-full bg-blue-500`}
                      style={{ 
                        height: `${Math.random() * 80 + 20}%`,
                        transition: 'height 0.2s ease',
                        animation: isPlaying ? `bounce 1s infinite ${i * 0.05}s` : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Harmonic Timeline (Horizontal Strip) */}
              <div className="flex-1 min-h-0 relative flex flex-col justify-center">
                
                {/* Central Indicator Line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-blue-500/30 z-20 pointer-events-none shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full" />
                </div>

                {/* Fade Overlays */}
                <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-[#141417] to-transparent z-10 pointer-events-none" />
                <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[#141417] to-transparent z-10 pointer-events-none" />

                <div 
                  className="flex items-center space-x-6 overflow-x-auto px-[45%] py-12 custom-scrollbar-h no-scrollbar select-none"
                  style={{ scrollSnapType: 'x proximity' }}
                >
                  {chords.map((chord, i) => {
                    const isActive = currentTime >= chord.time && (i === chords.length - 1 || currentTime < chords[i+1].time)
                    return (
                      <div 
                        key={i}
                        ref={el => { cardsRef.current[i] = el }}
                        onClick={() => { if(audioRef.current) { audioRef.current.currentTime = chord.time; setCurrentTime(chord.time); if(!isPlaying) togglePlay(); } }}
                        className={`flex-shrink-0 relative w-64 h-40 rounded-2xl border transition-all duration-700 cursor-pointer overflow-hidden flex flex-col items-center justify-center ${
                          isActive 
                            ? 'bg-blue-600 border-white/40 shadow-[0_32px_64px_rgba(37,99,235,0.4)] scale-110 ring-2 ring-white/20 z-30' 
                            : 'bg-[#1a1a1e] border-white/5 opacity-40 hover:opacity-100 hover:scale-105 active:scale-95'
                        }`}
                        style={{ scrollSnapAlign: 'center' }}
                      >
                        <div className={`absolute top-6 text-[10px] font-black tracking-widest ${isActive ? 'text-white/60' : 'text-gray-500'}`}>
                          {formatTime(chord.time)}
                        </div>
                        
                        <div className={`max-w-[92%] truncate px-2 text-4xl font-black mb-1 drop-shadow-2xl transition-all duration-700 ${isActive ? 'text-white scale-105' : 'text-gray-400'}`}>
                          {chord.chord}
                        </div>
                        
                        {isActive && (
                          <div className="absolute bottom-10 flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                             <div className="text-[9px] uppercase tracking-[0.2em] font-black text-blue-100 mb-2">Current Harmony</div>
                             <div className="w-12 h-1 bg-white/40 rounded-full overflow-hidden">
                               <div className="h-full bg-white animate-[progress_2s_linear_infinite]" style={{ width: '100%' }} />
                             </div>
                          </div>
                        )}
                        
                        {!isActive && (
                          <div className="w-8 h-1 bg-white/5 rounded-full mt-4" />
                        )}
                      </div>
                    )
                  })}
                  
                  {chords.length === 0 && !isAnalyzing && (
                    <div className="flex-1 flex flex-col items-center justify-center py-20 min-w-full">
                      <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <Activity className="w-8 h-8 text-gray-700" />
                      </div>
                      <p className="text-gray-500 font-bold uppercase tracking-widest text-sm">Harmonic Data Pending</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Analysis Footer */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
                <button
                  onClick={startNewAnalysis}
                  className="flex items-center space-x-2 text-gray-500 hover:text-white transition-colors text-sm font-bold"
                >
                  <RotateCcw size={16} />
                  <span>Nuevo análisis</span>
                </button>
                <div className="flex items-center space-x-6">
                   <div className="flex items-center space-x-2">
                     <Globe size={14} className="text-blue-500" />
                     <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Neural Link Secure</span>
                   </div>
                   <div className="h-4 w-px bg-white/10" />
                   <p className="text-[10px] text-gray-600 font-bold">POWERED BY MOISES CORE v4.1</p>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes bounce {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(1.8); }
        }
        .custom-scrollbar-h::-webkit-scrollbar {
          height: 4px;
        }
        .custom-scrollbar-h::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-h::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes progress {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}

export default ChordAnalysisModal
