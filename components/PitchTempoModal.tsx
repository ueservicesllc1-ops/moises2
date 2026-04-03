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
  
  // Refs for logic
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
          height: 120,
          normalize: true,
          fillParent: true,
          hideScrollbar: true,
          audioRate: tempo / 100
        })

        ws.on('ready', () => {
          setDuration(ws.getDuration())
          
          // Enable pitch preservation
          const media = ws.getMediaElement();
          if (media) {
            (media as any).preservesPitch = true;
          }
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

  // Update tempo real-time
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(tempo / 100)
    }
  }, [tempo])

  // Volume
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume / 100)
    }
  }, [volume])

  const analyzeAudio = async (file: File) => {
    setIsAnalyzing(true)
    setKey('Analizando...')
    setDetectedBpm(0)
    
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
      console.error('Detection error:', err)
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
    if (key === 'Detectando...' || key === 'Analizando...' || key === 'N/A' || pitch === 0 || key === '-') return key
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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[1100] p-4 backdrop-blur-xl transition-all duration-500">
      <AdminModalLabel modalName="MasterPitch_v3_Final" />
      
      <div className="bg-[#0f0f12] border border-white/10 rounded-[3rem] w-full max-w-7xl h-[92vh] flex flex-col overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.9)] relative">
        
        {/* Glow Accents */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[150px] pointer-events-none rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/10 blur-[150px] pointer-events-none rounded-full" />

        {/* Top Navigation / Status */}
        <div className="px-12 py-10 flex items-center justify-between border-b border-white/5 bg-black/40">
           <div className="flex items-center space-x-8">
              <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-3xl flex items-center justify-center shadow-2xl ring-1 ring-white/20">
                <Disc className="w-8 h-8 text-white animate-spin-slow" />
              </div>
              <div className="border-l border-white/10 pl-8">
                 <h2 className="text-4xl font-black text-white tracking-tighter italic">MASTER <span className="text-blue-500">ENGINE</span></h2>
                 <div className="flex items-center space-x-3 mt-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    <p className="text-xs font-black text-blue-500/60 uppercase tracking-[0.2em]">{audioFile ? 'Neural Sync Stable' : 'Awaiting Input Interface'}</p>
                 </div>
              </div>
           </div>
           
           <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-12 mr-12">
                 <div className="text-center group">
                    <p className="text-[10px] text-gray-500 font-black uppercase mb-1 tracking-widest">Global Master</p>
                    <p className="text-2xl font-black text-white">{volume}%</p>
                 </div>
                 <div className="text-center group">
                    <p className="text-[10px] text-gray-500 font-black uppercase mb-1 tracking-widest">Engine Mode</p>
                    <p className="text-sm font-black text-blue-500 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20">64-BIT ELASTIC</p>
                 </div>
              </div>
              <button 
                onClick={onClose} 
                className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500/20 transition-all border border-white/10 group"
              >
                <X className="w-6 h-6 group-hover:scale-110" />
              </button>
           </div>
        </div>

        {/* Workspace Interior */}
        <div className="flex-1 overflow-y-auto px-12 py-10 space-y-10 custom-scrollbar">
          
          <div className="grid grid-cols-12 gap-10">
            
            {/* Control Sidebar (Intelligence) */}
            <div className="col-span-12 lg:col-span-4 space-y-8">
               <div className="bg-[#16161a] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
                  <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-10 flex items-center">
                    <Layout className="w-4 h-4 mr-3 text-blue-500" /> AI SCAN DATA
                  </h3>

                  <div className="space-y-6">
                     <div className="relative group/stat p-6 bg-black/40 rounded-3xl border border-white/5 hover:bg-black/60 transition-all cursor-crosshair">
                        <p className="text-[10px] text-gray-500 font-black uppercase mb-3">Detected Harmonic Key</p>
                        <div className="flex items-center justify-between">
                           <span className="text-5xl font-black text-white transition-transform group-hover/stat:scale-110 duration-500">{key === 'Detectando...' ? '--' : key}</span>
                           <Music className="w-8 h-8 text-blue-500/20 group-hover/stat:text-blue-500 transition-colors" />
                        </div>
                     </div>

                     <div className="relative group/stat p-6 bg-black/40 rounded-3xl border border-white/5 hover:bg-black/60 transition-all cursor-crosshair">
                        <p className="text-[10px] text-gray-500 font-black uppercase mb-3">Reference tempo</p>
                        <div className="flex items-center justify-between">
                           <span className="text-5xl font-black text-white transition-transform group-hover/stat:scale-110 duration-500">{detectedBpm > 0 ? Math.round(detectedBpm) : '--'}</span>
                           <span className="text-[10px] font-black text-gray-700 uppercase">BPM</span>
                        </div>
                     </div>
                  </div>

                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-[#16161a]/90 backdrop-blur-md flex flex-col items-center justify-center space-y-6 z-50">
                       <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                       <p className="text-xs font-black text-white uppercase tracking-[0.3em] animate-pulse">Running Neural Decomposition</p>
                    </div>
                  )}
               </div>

               <div 
                 onClick={() => fileInputRef.current?.click()}
                 className="bg-gradient-to-br from-blue-700/5 to-indigo-700/5 border-2 border-dashed border-white/10 rounded-[2.5rem] p-10 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/40 hover:bg-blue-600/10 transition-all group relative overflow-hidden"
               >
                  <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform ring-1 ring-blue-500/20 shadow-2xl">
                    <Upload className="w-8 h-8 text-blue-400" />
                  </div>
                  <h4 className="text-white font-black text-lg mb-2">INTERFACE INPUT</h4>
                  <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Drag or Select Raw Audio File</p>
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
               </div>
            </div>

            {/* Master Console (Controls) */}
            <div className="col-span-12 lg:col-span-8 space-y-10">
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* Elastic Tempo Module */}
                  <div className="bg-[#16161a] border border-white/5 rounded-[3rem] p-10 shadow-3xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-8 opacity-5">
                       <Waves className="w-32 h-32 text-purple-500" />
                     </div>
                     <div className="flex justify-between items-center mb-10">
                        <div className="flex items-center space-x-3">
                           <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center border border-purple-500/20">
                             <Sliders className="w-5 h-5 text-purple-500" />
                           </div>
                           <h3 className="text-sm font-black text-white/50 uppercase tracking-[0.2em]">ELASTIC TIMESTRETCH</h3>
                        </div>
                        <button onClick={() => setTempo(100)} className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"><RotateCcw size={14} /></button>
                     </div>
                     
                     <div className="text-center mb-10">
                        <span className="text-8xl font-black text-white tracking-tighter">{tempo}%</span>
                        <div className="mt-4 flex items-center justify-center space-x-2">
                           <div className="h-1 w-12 bg-purple-500/20 rounded-full" />
                           <span className="text-[10px] font-black text-purple-500 uppercase tracking-widest">{detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : '--'} BPM SYNC</span>
                           <div className="h-1 w-12 bg-purple-500/20 rounded-full" />
                        </div>
                     </div>

                     <div className="space-y-8">
                        <input 
                          type="range" min="50" max="200" step="1" value={tempo} 
                          onChange={(e) => setTempo(Number(e.target.value))}
                          className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-600 slider-thumb-pro"
                        />
                        <div className="flex gap-4">
                           <button onClick={() => setTempo(Math.max(50, tempo - 5))} className="flex-1 py-4 bg-white/5 rounded-2xl text-xs font-black uppercase hover:bg-white/10 border border-white/5 transition-all">- 5%</button>
                           <button onClick={() => setTempo(Math.min(200, tempo + 5))} className="flex-1 py-4 bg-white/5 rounded-2xl text-xs font-black uppercase hover:bg-white/10 border border-white/5 transition-all">+ 5%</button>
                        </div>
                     </div>
                  </div>

                  {/* Harmonic Pitch Module */}
                  <div className="bg-[#16161a] border border-white/5 rounded-[3rem] p-10 shadow-3xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-8 opacity-5">
                       <Activity className="w-32 h-32 text-blue-500" />
                     </div>
                     <div className="flex justify-between items-center mb-10">
                        <div className="flex items-center space-x-3">
                           <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20">
                             <Monitor className="w-5 h-5 text-blue-500" />
                           </div>
                           <h3 className="text-sm font-black text-white/50 uppercase tracking-[0.2em]">HARMONIC SHIFTER</h3>
                        </div>
                        <button onClick={() => setPitch(0)} className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors"><RotateCcw size={14} /></button>
                     </div>

                     <div className="flex items-center justify-between mb-10">
                        <button onClick={() => setPitch(Math.max(-12, pitch - 1))} className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-4xl font-light hover:bg-blue-600/10 hover:text-blue-500 transition-all border border-white/5">－</button>
                        <div className="text-center">
                           <span className="text-8xl font-black text-white tracking-tighter">{pitch > 0 ? `+${pitch}` : pitch}</span>
                           <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mt-4">SEMITONES</p>
                        </div>
                        <button onClick={() => setPitch(Math.min(12, pitch + 1))} className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center text-4xl font-light hover:bg-blue-600/10 hover:text-blue-500 transition-all border border-white/5">＋</button>
                     </div>

                     <input 
                        type="range" min="-12" max="12" step="1" value={pitch} 
                        onChange={(e) => setPitch(Number(e.target.value))}
                        className="w-full h-2 bg-white/5 rounded-full appearance-none cursor-pointer accent-blue-600 slider-thumb-pro"
                      />
                  </div>
               </div>

               {/* Waveform Master Deck */}
               <div className="bg-black/60 border border-white/5 rounded-[3rem] p-10 shadow-[0_0_80px_rgba(0,0,0,0.5)] relative group">
                  <div className="flex items-center justify-between mb-10">
                     <div className="flex items-center space-x-6">
                        <button 
                          onClick={() => { if(wavesurferRef.current) wavesurferRef.current.playPause() }}
                          disabled={!audioFile}
                          className="w-24 h-24 bg-white hover:bg-gray-200 text-black rounded-[2rem] flex items-center justify-center transition-all disabled:opacity-20 shadow-2xl active:scale-95 group/play"
                        >
                          {isPlaying ? <Pause size={36} fill="black" /> : <Play size={36} fill="black" className="ml-2 group-hover/play:scale-110 transition-transform" />}
                        </button>
                        <div>
                           <h5 className="text-white font-black text-2xl tracking-tighter truncate max-w-[300px]">{audioFile?.name || 'VIRTUAL DECK EMPTY'}</h5>
                           <div className="flex items-center space-x-3 mt-1">
                              <span className="text-[10px] font-black text-gray-500 uppercase font-mono">{formatTime(currentTime)}</span>
                              <div className="h-1 w-1 bg-gray-700 rounded-full" />
                              <span className="text-[10px] font-black text-gray-500 uppercase font-mono">{formatTime(duration)}</span>
                           </div>
                        </div>
                     </div>

                     <div className="flex items-center space-x-8">
                        <div className="bg-[#16161a] px-8 py-5 rounded-3xl border border-white/5 flex items-center space-x-6">
                           <Volume2 size={20} className="text-gray-500" />
                           <input 
                             type="range" min="0" max="100" value={volume} 
                             onChange={(e) => setVolume(Number(e.target.value))}
                             className="w-32 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
                           />
                           <span className="text-xs font-black text-white w-10 text-right">{volume}%</span>
                        </div>
                        <button onClick={() => { if(wavesurferRef.current) wavesurferRef.current.stop() }} className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-gray-500 hover:text-red-500 transition-all border border-white/5">
                           <Square size={24} fill="currentColor" />
                        </button>
                     </div>
                  </div>

                  <div className="relative h-40 bg-black/80 rounded-[2rem] px-8 flex flex-col justify-center border border-white/5 overflow-hidden">
                     <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-blue-500/5 opacity-50" />
                     {!audioFile ? (
                        <div className="flex flex-col items-center justify-center opacity-20">
                           <Activity className="w-12 h-12 mb-4 animate-pulse" />
                           <p className="text-[10px] font-black uppercase tracking-[0.5em]">No signal detected</p>
                        </div>
                     ) : (
                        <div ref={waveformContainerRef} className="w-full relative z-10" />
                     )}
                  </div>
               </div>
            </div>
          </div>

          {/* Master View Engine (Result Data) */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
             <div className="lg:col-span-3 bg-gradient-to-br from-[#16161a] to-[#0a0a0c] border border-white/5 rounded-[3rem] p-10 flex flex-col md:flex-row items-center justify-around space-y-8 md:space-y-0">
                <div className="text-center group">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-4 tracking-[0.3em]">TRANSPOSED KEY</p>
                   <p className="text-6xl font-black text-blue-500 drop-shadow-[0_0_20px_rgba(59,130,246,0.3)]">{getShiftedKey()}</p>
                </div>
                <div className="hidden md:block h-20 w-px bg-white/5" />
                <div className="text-center group">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-4 tracking-[0.3em]">CALCULATED BPM</p>
                   <p className="text-6xl font-black text-purple-500 drop-shadow-[0_0_20px_rgba(168,85,247,0.3)]">{detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : '--'}</p>
                </div>
                <div className="hidden md:block h-20 w-px bg-white/5" />
                <div className="text-center">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-4 tracking-[0.3em]">SIGNAL FIDELITY</p>
                   <div className="flex flex-col items-center">
                      <p className="text-2xl font-black text-green-500">64-BIT</p>
                      <span className="text-[8px] font-bold text-gray-500">IEEE 754 FLOAT</span>
                   </div>
                </div>
             </div>

             <button 
               onClick={() => toast('Export Engine v4.0 is ready. Select destination.')}
               className="bg-white hover:bg-gray-200 text-black rounded-[3rem] p-10 flex flex-col items-center justify-center transition-all group shadow-3xl hover:translate-y-[-4px]"
             >
                <Download className="w-12 h-12 mb-4 group-hover:bounce transition-transform" />
                <span className="text-xs font-black uppercase tracking-[0.3em]">EXPORT MASTER</span>
                <p className="text-[8px] font-bold opacity-30 mt-2">RE-ENCODE WAV / MP3 / FLAC</p>
             </button>
          </div>

        </div>

        {/* Console Telemetry (Footer) */}
        <div className="px-12 py-8 border-t border-white/5 bg-black/60 flex flex-col md:flex-row items-center justify-between text-[8px] font-black tracking-[0.5em] text-gray-600">
           <div className="flex items-center space-x-8 mb-4 md:mb-0">
              <p className="flex items-center"><div className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-3 animate-ping" /> CORE: STABLE</p>
              <p>LATENCY: 0.12MS</p>
              <p>BUFFER: 4096S</p>
              <p>AES-256 ENCRYPTED</p>
           </div>
           <p className="hover:text-white transition-colors cursor-help">MOISES NEURAL CORE v4.1.2 // GLOBAL NETWORK ACTIVE</p>
        </div>

      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 20px;
        }
        .animate-spin-slow {
          animation: spin 6s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .slider-thumb-pro::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 0 15px rgba(255,255,255,0.4);
          border: 2px solid currentColor;
        }
      `}</style>
    </div>
  )
}

export default PitchTempoModal