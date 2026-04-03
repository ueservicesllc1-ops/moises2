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
}

interface ChordInfo {
  time: number
  endTime?: number
  chord: string
  confidence: number
}

const ChordAnalysisModal: React.FC<ChordAnalysisModalProps> = ({ isOpen, onClose, isPremium }) => {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [chords, setChords] = useState<ChordInfo[]>([])
  const [detectedKey, setDetectedKey] = useState<{key: string; mode: string} | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cardsRef = useRef<(HTMLDivElement | null)[]>([])

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

  // Auto-scroll logic
  useEffect(() => {
    const activeIndex = chords.findIndex((c, i) => 
      currentTime >= c.time && (i === chords.length - 1 || currentTime < chords[i+1].time)
    )
    if (activeIndex !== -1 && cardsRef.current[activeIndex]) {
      cardsRef.current[activeIndex]?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center',
        inline: 'center'
      })
    }
  }, [currentTime, chords])

  const togglePlay = () => {
    if (!audioRef.current) return
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
    if (!upRes.ok) throw new Error('Failed to reach AI engine.')
    
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

    setAudioFile(file)
    setAudioUrl(URL.createObjectURL(file))
    setIsAnalyzing(true)
    setChords([])
    setDetectedKey(null)

    try {
      const result = await analyzeChords(file)
      setChords(result.chords)
      setDetectedKey(result.key)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-[#0a0a0c]/98 flex items-center justify-center z-[10000] p-4 font-sans backdrop-blur-sm">
      <AdminModalLabel modalName="ChordAnalysisModal_ULTIMATE" />
      
      <div className="bg-[#141417] border border-white/5 rounded-[2rem] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden shadow-[0_32px_128px_rgba(0,0,0,0.8)] relative group">
        
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
          
          {!audioFile && !isAnalyzing ? (
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
                    <p className="text-white font-bold truncate text-sm">{audioFile?.name}</p>
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
                        style={{ width: `${(currentTime/duration)*100}%` }}
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

              {/* Harmonic Timeline */}
              <div className="flex-1 min-h-0 relative">
                <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-[#141417] to-transparent z-10" />
                <div className="h-full overflow-y-auto px-1 custom-scrollbar pb-10 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {chords.map((chord, i) => {
                      const isActive = currentTime >= chord.time && (i === chords.length - 1 || currentTime < chords[i+1].time)
                      return (
                        <div 
                          key={i}
                          ref={el => { cardsRef.current[i] = el }}
                          onClick={() => { if(audioRef.current) { audioRef.current.currentTime = chord.time; setCurrentTime(chord.time); if(!isPlaying) togglePlay(); } }}
                          className={`group/card relative h-36 rounded-3xl border transition-all duration-500 cursor-pointer overflow-hidden ${
                            isActive 
                              ? 'bg-blue-600 border-white/30 shadow-[0_20px_50px_rgba(37,99,235,0.3)] scale-[1.03] ring-1 ring-white/50' 
                              : 'bg-[#1a1a1e] border-white/5 hover:border-white/10'
                          }`}
                        >
                          <div className="absolute top-2 right-3 text-[9px] font-black opacity-30 group-hover/card:opacity-100 transition-opacity">
                            {formatTime(chord.time)}
                          </div>
                          <div className="flex flex-col items-center justify-center h-full p-4">
                             <div className={`text-4xl font-black mb-1 drop-shadow-xl ${isActive ? 'text-white scale-110' : 'text-gray-200'} transition-transform duration-500`}>
                              {chord.chord}
                             </div>
                             <div className={`text-[10px] uppercase tracking-widest font-black ${isActive ? 'text-blue-100' : 'text-gray-500'}`}>
                               {isActive ? 'Active Harmony' : 'Detection Layer'}
                             </div>
                             {/* Confidence Bar */}
                             <div className="w-16 h-1 bg-black/20 rounded-full mt-4 overflow-hidden">
                               <div 
                                 className={`h-full ${isActive ? 'bg-white' : 'bg-blue-500/40'} transition-all`}
                                 style={{ width: `${chord.confidence * 100}%` }}
                               />
                             </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {chords.length === 0 && !isAnalyzing && (
                    <div className="flex flex-col items-center justify-center py-20 bg-white/[0.02] border border-white/5 rounded-[2rem]">
                      <Info className="w-10 h-10 text-gray-700 mb-4" />
                      <p className="text-gray-500 font-bold">No harmony data available in this region</p>
                    </div>
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-[#141417] via-[#141417]/80 to-transparent z-10" />
              </div>

              {/* Analysis Footer */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
                <button 
                  onClick={() => { setAudioFile(null); setChords([]); setDetectedKey(null); }}
                  className="flex items-center space-x-2 text-gray-500 hover:text-white transition-colors text-sm font-bold"
                >
                  <RotateCcw size={16} />
                  <span>Reiniciar Motor de IA</span>
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
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
      `}</style>
    </div>
  )
}

export default ChordAnalysisModal
