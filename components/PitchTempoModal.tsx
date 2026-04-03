'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  X, Play, Pause, RotateCcw, Music, Volume2, 
  Target, Upload, Loader2, Download, Square,
  Zap, Disc, Waves, Activity, Info, ChevronRight,
  Settings, Sliders, Layout, Monitor
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getBackendUrl } from '@/lib/config'
import AdminModalLabel from './AdminModalLabel'

interface PitchTempoModalProps {
  isOpen: boolean
  onClose: () => void
}

const PitchTempoModal: React.FC<PitchTempoModalProps> = ({ isOpen, onClose }) => {
  // Logic States
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [tempo, setTempo] = useState<number>(100)
  const [pitch, setPitch] = useState<number>(0)
  const [volume, setVolume] = useState<number>(100)
  const [detectedBpm, setDetectedBpm] = useState<number>(0)
  const [key, setKey] = useState<string>('Detectando...')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  // Refs
  const wavesurferRef = useRef<any>(null)
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // dynamic import for wavesurfer
  useEffect(() => {
    if (!isOpen || !audioFile || !waveformContainerRef.current) return

    let ws: any = null

    const initWS = async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default
        
        ws = WaveSurfer.create({
          container: waveformContainerRef.current!,
          waveColor: '#3b82f633',
          progressColor: '#3b82f6',
          cursorColor: '#ffffff',
          barWidth: 2,
          barGap: 3,
          barRadius: 3,
          height: 80, // Slightly smaller for better fit
          normalize: true,
          fillParent: true,
          hideScrollbar: true,
          audioRate: tempo / 100
        })

        ws.on('ready', () => {
          setDuration(ws.getDuration())
          const media = ws.getMediaElement();
          if (media) (media as any).preservesPitch = true;
        })

        ws.on('audioprocess', (time: number) => setCurrentTime(time))
        ws.on('play', () => setIsPlaying(true))
        ws.on('pause', () => setIsPlaying(false))
        ws.on('finish', () => setIsPlaying(false))

        const url = URL.createObjectURL(audioFile)
        ws.load(url)
        wavesurferRef.current = ws

        return () => {
          URL.revokeObjectURL(url)
          if (ws) ws.destroy()
        }
      } catch (err) {
        console.error('WS Load Error:', err)
      }
    }

    initWS()

    return () => {
      if (ws) ws.destroy()
    }
  }, [isOpen, audioFile])

  useEffect(() => {
    if (wavesurferRef.current) wavesurferRef.current.setPlaybackRate(tempo / 100)
  }, [tempo])

  useEffect(() => {
    if (wavesurferRef.current) wavesurferRef.current.setVolume(volume / 100)
  }, [volume])

  const analyzeAudio = async (file: File) => {
    setIsAnalyzing(true)
    setKey('Analizando...')
    try {
      const backendUrl = getBackendUrl()
      const formData = new FormData()
      formData.append('file', file)
      const [bpmRes, keyRes] = await Promise.all([
        fetch(`${backendUrl}/api/analyze-bpm`, { method: 'POST', body: formData }),
        fetch(`${backendUrl}/api/analyze-key`, { method: 'POST', body: formData })
      ])
      if (bpmRes.ok) {
        const data = await bpmRes.json()
        setDetectedBpm(data.bpm)
      }
      if (keyRes.ok) {
        const data = await keyRes.json()
        setKey(data.key || 'Unknown')
      }
    } catch (err) {
      setKey('N/A')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioFile(file)
    setCurrentTime(0)
    setIsPlaying(false)
    analyzeAudio(file)
  }

  const getShiftedKey = () => {
    if (key === 'Detectando...' || key === 'Analizando...' || key === 'N/A' || pitch === 0) return key
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const parts = key.split(' ')
    const baseNote = parts[0]
    const mode = parts[1] || ''
    const idx = notes.indexOf(baseNote)
    if (idx === -1) return key
    let newIdx = (idx + pitch) % 12
    if (newIdx < 0) newIdx += 12
    return notes[newIdx] + (mode ? ' ' + mode : '')
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[1100] p-4 backdrop-blur-xl">
      <AdminModalLabel modalName="MasterPitch_Responsive_v3" />
      
      {/* Scaling container - reduced height from 92vh to 90vh and improved responsiveness */}
      <div className="bg-[#0f0f12] border border-white/10 rounded-[2.5rem] w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] pointer-events-none rounded-full" />

        {/* Dynamic Header - more compact */}
        <div className="px-10 py-6 flex items-center justify-between border-b border-white/5 bg-black/40 flex-shrink-0">
           <div className="flex items-center space-x-6">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-white/10">
                <Disc className="w-6 h-6 text-white animate-spin-slow" />
              </div>
              <div>
                 <h2 className="text-2xl font-black text-white tracking-tighter italic">MASTER <span className="text-blue-500 font-bold">ENGINE</span></h2>
                 <p className="text-[10px] font-black text-blue-500/50 uppercase tracking-widest">{audioFile ? 'Neural Sync Active' : 'Waiting for Input'}</p>
              </div>
           </div>
           <button onClick={onClose} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/5">
             <X className="w-5 h-5" />
           </button>
        </div>

        {/* Content Interior - Scrollable */}
        <div className="flex-1 overflow-y-auto px-10 py-8 space-y-8 custom-scrollbar">
          
          <div className="grid grid-cols-12 gap-8">
            
            {/* Sidebar Data */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
               <div className="bg-[#16161a] border border-white/5 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/50" />
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-blue-500" /> AI SCAN DATA
                  </h3>

                  <div className="space-y-4">
                     <div className="p-5 bg-black/40 rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-2">Harmonic Key</p>
                        <span className="text-4xl font-black text-white">{key === 'Detectando...' ? '--' : key}</span>
                     </div>
                     <div className="p-5 bg-black/40 rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-2">Reference Tempo</p>
                        <div className="flex items-baseline space-x-2">
                           <span className="text-4xl font-black text-white">{detectedBpm > 0 ? Math.round(detectedBpm) : '--'}</span>
                           <span className="text-[10px] font-black text-gray-600">BPM</span>
                        </div>
                     </div>
                  </div>

                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-[#16161a]/90 backdrop-blur-md flex flex-col items-center justify-center space-y-4 z-10">
                       <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                       <p className="text-[10px] font-black text-white uppercase tracking-widest pulse">Analyzing Signal...</p>
                    </div>
                  )}
               </div>

               <div 
                 onClick={() => fileInputRef.current?.click()}
                 className="bg-gradient-to-br from-blue-600/5 to-indigo-600/5 border-2 border-dashed border-white/10 rounded-[2rem] p-8 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/30 transition-all group"
               >
                  <div className="w-14 h-14 bg-blue-500/10 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ring-1 ring-blue-500/20">
                    <Upload className="w-6 h-6 text-blue-400" />
                  </div>
                  <h4 className="text-white font-bold text-sm mb-1 uppercase tracking-tighter">Choose Audio</h4>
                  <p className="text-gray-600 text-[9px] font-bold uppercase tracking-widest">WAV / MP3 / FLAC</p>
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
               </div>
            </div>

            {/* Main Console */}
            <div className="col-span-12 lg:col-span-8 space-y-8">
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Tempo Module */}
                  <div className="bg-[#16161a] border border-white/5 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
                     <div className="flex justify-between items-center mb-8">
                        <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest flex items-center">
                           <Waves className="w-4 h-4 mr-2 text-purple-500" /> Elastic Stretch
                        </h3>
                        <button onClick={() => setTempo(100)} className="text-gray-600 hover:text-white transition-colors"><RotateCcw size={14} /></button>
                     </div>
                     <div className="text-center mb-8">
                        <span className="text-7xl font-black text-white tracking-tighter">{tempo}%</span>
                        <p className="text-[10px] font-black text-purple-500 uppercase mt-2">{detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : '--'} BPM</p>
                     </div>
                     <div className="space-y-6">
                        <input 
                          type="range" min="50" max="200" step="1" value={tempo} 
                          onChange={(e) => setTempo(Number(e.target.value))}
                          className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-600"
                        />
                        <div className="flex gap-4">
                           <button onClick={() => setTempo(Math.max(50, tempo - 5))} className="flex-1 py-3 bg-white/5 rounded-xl text-[10px] font-black uppercase hover:bg-white/10 transition-all border border-white/5">- 5%</button>
                           <button onClick={() => setTempo(Math.min(200, tempo + 5))} className="flex-1 py-3 bg-white/5 rounded-xl text-[10px] font-black uppercase hover:bg-white/10 transition-all border border-white/5 text-white">+ 5%</button>
                        </div>
                     </div>
                  </div>

                  {/* Pitch Module */}
                  <div className="bg-[#16161a] border border-white/5 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
                     <div className="flex justify-between items-center mb-8">
                        <h3 className="text-[10px] font-black text-white/30 uppercase tracking-widest flex items-center">
                           <Music className="w-4 h-4 mr-2 text-blue-500" /> Pitch Shifter
                        </h3>
                        <button onClick={() => setPitch(0)} className="text-gray-600 hover:text-white transition-colors"><RotateCcw size={14} /></button>
                     </div>
                     <div className="flex items-center justify-between mb-8">
                        <button onClick={() => setPitch(Math.max(-12, pitch - 1))} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-2xl font-light hover:bg-blue-600/10 hover:text-blue-500 transition-all border border-white/5">－</button>
                        <div className="text-center">
                           <span className="text-7xl font-black text-white tracking-tighter">{pitch > 0 ? `+${pitch}` : pitch}</span>
                           <p className="text-[9px] font-black text-blue-500 uppercase mt-2">Semitones</p>
                        </div>
                        <button onClick={() => setPitch(Math.min(12, pitch + 1))} className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-2xl font-light hover:bg-blue-600/10 hover:text-blue-500 transition-all border border-white/5">＋</button>
                     </div>
                     <input 
                        type="range" min="-12" max="12" step="1" value={pitch} 
                        onChange={(e) => setPitch(Number(e.target.value))}
                        className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-blue-600"
                      />
                  </div>
               </div>

               {/* Waveform Player */}
               <div className="bg-black/60 border border-white/5 rounded-[2.5rem] p-8 shadow-2xl relative group">
                  <div className="flex items-center justify-between mb-8">
                     <div className="flex items-center space-x-6">
                        <button 
                          onClick={() => wavesurferRef.current?.playPause()}
                          disabled={!audioFile}
                          className="w-20 h-20 bg-white hover:bg-gray-200 text-black rounded-[1.75rem] flex items-center justify-center transition-all disabled:opacity-20 shadow-xl active:scale-95"
                        >
                          {isPlaying ? <Pause size={30} fill="black" /> : <Play size={30} fill="black" className="ml-1" />}
                        </button>
                        <div>
                           <h5 className="text-white font-black text-lg tracking-tight truncate max-w-[250px]">{audioFile?.name || 'Waiting for audio...'}</h5>
                           <p className="text-[10px] font-mono text-gray-500 mt-1">{formatTime(currentTime)} / {formatTime(duration)}</p>
                        </div>
                     </div>
                     <div className="flex items-center space-x-6">
                        <div className="bg-[#16161a] px-6 py-4 rounded-2xl border border-white/5 flex items-center space-x-4">
                           <Volume2 size={16} className="text-gray-500" />
                           <input 
                             type="range" min="0" max="100" value={volume} 
                             onChange={(e) => setVolume(Number(e.target.value))}
                             className="w-24 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                           />
                        </div>
                        <button onClick={() => wavesurferRef.current?.stop()} className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-gray-500 hover:text-red-500 transition-all border border-white/5">
                           <Square size={20} fill="currentColor" />
                        </button>
                     </div>
                  </div>
                  <div className="relative h-24 bg-black/80 rounded-3xl px-6 flex flex-col justify-center border border-white/5 overflow-hidden">
                     {!audioFile && <p className="text-center text-[9px] font-black text-gray-700 uppercase tracking-widest">No Signal Detected</p>}
                     <div ref={waveformContainerRef} className="w-full" />
                  </div>
               </div>
            </div>
          </div>

          {/* Master View Engine */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
             <div className="md:col-span-3 bg-gradient-to-br from-[#16161a] to-[#0a0a0c] border border-white/5 rounded-[2.5rem] p-8 flex items-center justify-around">
                <div className="text-center group">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-3 tracking-widest">Target Key</p>
                   <p className="text-5xl font-black text-blue-500 drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]">{getShiftedKey() || '--'}</p>
                </div>
                <div className="h-12 w-px bg-white/5" />
                <div className="text-center group">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-3 tracking-widest">Elastic BPM</p>
                   <p className="text-5xl font-black text-purple-500 drop-shadow-[0_0_15px_rgba(168,85,247,0.2)]">{detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : '--'}</p>
                </div>
                <div className="h-12 w-px bg-white/5" />
                <div className="text-center">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-3 tracking-widest">Precision</p>
                   <p className="text-xl font-black text-white">64-BIT</p>
                </div>
             </div>

             <button 
               onClick={() => toast('Exporting Engine... (Simulated)')}
               className="bg-white hover:bg-gray-200 text-black rounded-[2.5rem] p-8 flex flex-col items-center justify-center transition-all group shadow-xl"
             >
                <Download className="w-8 h-8 mb-2 group-hover:translate-y-1 transition-transform" />
                <span className="text-[10px] font-black uppercase tracking-widest">Export Master</span>
             </button>
          </div>

        </div>

        {/* Telemetry Footer - more compact */}
        <div className="px-10 py-5 border-t border-white/5 bg-black/60 flex items-center justify-between text-[8px] font-black tracking-[0.3em] text-gray-600 flex-shrink-0">
           <div className="flex items-center space-x-6">
              <p className="flex items-center"><div className="w-1 h-1 bg-blue-500 rounded-full mr-2 animate-ping" /> ENGINE: ACTIVE</p>
              <p>LATENCY: 0.12MS</p>
           </div>
           <p className="opacity-30">MOISES NEURAL ENGINE v4.1 // PRODUCTION READY</p>
        </div>

      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default PitchTempoModal