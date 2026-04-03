'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  X, Play, Pause, RotateCcw, Music, Volume2, 
  Target, Upload, Loader2, Download, Square,
  Zap, Disc, Waves, Activity, Info, ChevronRight,
  Maximize2
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
  const [key, setKey] = useState<string>('No detectada')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Refs
  const wavesurferRef = useRef<any>(null)
  const waveformRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // dynamic import for wavesurfer
  useEffect(() => {
    if (!isOpen || !audioFile || !waveformRef.current) return

    let ws: any = null

    const initWS = async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default
        
        ws = WaveSurfer.create({
          container: waveformRef.current!,
          waveColor: '#2563eb33',
          progressColor: '#2563eb',
          cursorColor: '#ffffff',
          barWidth: 2,
          barGap: 3,
          height: 60,
          normalize: true,
          fillParent: true,
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
        setKey(data.key || 'N/A')
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
    analyzeAudio(file)
  }

  const getShiftedKey = () => {
    if (key === 'No detectada' || key === 'Analizando...' || key === 'N/A' || pitch === 0) return key
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    const baseNote = key.split(' ')[0]
    const idx = notes.indexOf(baseNote)
    if (idx === -1) return key
    let newIdx = (idx + pitch) % 12
    if (newIdx < 0) newIdx += 12
    return notes[newIdx] + (key.includes('m') ? 'm' : '')
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[1100] p-4 backdrop-blur-sm">
      <AdminModalLabel modalName="PitchTempoModal_FixedLayout" />
      
      {/* Container matching screenshot structure but with premium styling */}
      <div className="bg-[#121216] border border-white/10 w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Top Header */}
        <div className="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-black/40">
          <div className="flex items-center space-x-3 text-white">
            <Music className="w-5 h-5" />
            <h2 className="text-lg font-black tracking-tight uppercase italic">Pitch & Tempo Control <span className="text-blue-500 ml-2">PRO</span></h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Content with GRID mirroring your screenshot */}
        <div className="flex-1 overflow-y-auto p-8 bg-[#0a0a0c]">
          <div className="grid grid-cols-2 gap-6 h-full max-h-full">
            
            {/* ROW 1: Intelligence & Upload */}
            <div className="bg-[#1a1a1f] border border-white/5 p-6 rounded-xl flex flex-col">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
                   <Music className="w-4 h-4 mr-2" /> Tonalidad Detectada
                 </h3>
                 {isAnalyzing && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
              </div>
              <div className="flex-1 bg-black/40 border border-white/5 rounded-xl flex flex-col items-center justify-center p-6 space-y-2">
                 <div className="text-4xl font-black text-white">{key}</div>
                 <div className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                   BPM: {detectedBpm > 0 ? Math.round(detectedBpm) : 'No detectado'}
                 </div>
              </div>
            </div>

            <div className="bg-[#1a1a1f] border border-white/5 p-6 rounded-xl flex flex-col">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center mb-4">
                 <Upload className="w-4 h-4 mr-2" /> Subir Canción
               </h3>
               <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 bg-white hover:bg-gray-200 text-black rounded-xl font-black text-lg transition-all flex flex-col items-center justify-center space-y-2 group shadow-lg"
               >
                 <Upload className="w-8 h-8 group-hover:scale-110 transition-transform" />
                 <span>Seleccionar Archivo</span>
                 <p className="text-[10px] opacity-40 uppercase">MP3, WAV, OGG, FLAC, M4A</p>
               </button>
               <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
            </div>

            {/* ROW 2: Tempo & Preview */}
            <div className="bg-[#1a1a1f] border border-white/5 p-8 rounded-xl flex flex-col justify-center relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10">
                 <Target className="w-32 h-32 text-blue-500" />
               </div>
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
                   <Target className="w-4 h-4 mr-2 text-blue-500" /> Tempo (Velocidad)
                 </h3>
                 <button onClick={() => setTempo(100)} className="text-gray-600 hover:text-white transition-colors"><RotateCcw size={14} /></button>
               </div>
               
               <div className="text-center mb-8">
                  <div className="text-6xl font-black text-white tracking-tighter">{tempo}%</div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2">BPM: {detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : 'No detectado'}</p>
               </div>

               <input 
                  type="range" min="50" max="200" step="1" value={tempo} 
                  onChange={(e) => setTempo(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-white mb-6"
                />

               <div className="flex gap-4">
                  <button onClick={() => setTempo(Math.max(50, tempo - 5))} className="flex-1 py-4 bg-white/5 rounded-xl text-xs font-black hover:bg-white/10 border border-white/5 transition-all">- 5%</button>
                  <button onClick={() => setTempo(Math.min(200, tempo + 5))} className="flex-1 py-4 bg-white/5 rounded-xl text-xs font-black hover:bg-white/10 border border-white/5 transition-all text-white">+ 5%</button>
               </div>
            </div>

            <div className="bg-[#1a1a1f] border border-white/5 p-8 rounded-xl flex flex-col justify-between">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6">Audio Preview</h3>
               
               <div className="mb-6 flex-1 flex flex-col justify-center">
                  <div className="flex justify-between text-[10px] font-black font-mono text-gray-500 mb-2">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div ref={waveformRef} className="w-full h-16 bg-black/40 rounded-xl" />
               </div>

               <div className="flex items-center justify-center space-x-6">
                  <button 
                    onClick={() => wavesurferRef.current?.playPause()}
                    disabled={!audioFile}
                    className="w-20 h-20 bg-white hover:bg-gray-200 text-black rounded-2xl flex items-center justify-center transition-all disabled:opacity-30 shadow-2xl active:scale-95"
                  >
                    {isPlaying ? <Pause size={32} fill="black" /> : <Play size={32} fill="black" className="ml-1" />}
                  </button>
                  <button 
                    onClick={() => wavesurferRef.current?.stop()}
                    disabled={!audioFile}
                    className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-gray-500 hover:text-red-500 transition-all border border-white/5"
                  >
                    <Square size={24} fill="currentColor" />
                  </button>
               </div>
            </div>

            {/* ROW 3: Pitch & Stats */}
            <div className="bg-[#1a1a1f] border border-white/5 p-8 rounded-xl flex flex-col justify-center relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none transition-opacity group-hover:opacity-10">
                 <Music className="w-32 h-32 text-indigo-500" />
               </div>
               <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center">
                   <Music className="w-4 h-4 mr-2 text-indigo-500" /> Pitch / Tono
                 </h3>
                 <button onClick={() => setPitch(0)} className="text-gray-600 hover:text-white transition-colors"><RotateCcw size={14} /></button>
               </div>

               <div className="flex items-center justify-between mb-8">
                  <button onClick={() => setPitch(Math.max(-12, pitch - 1))} className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center text-2xl font-light hover:bg-white/10 transition-all border border-white/5">－</button>
                  <div className="text-center">
                     <span className="text-6xl font-black text-white tracking-tighter">{pitch > 0 ? `+${pitch}` : pitch}</span>
                     <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-2">{pitch === 0 ? 'Original' : pitch > 0 ? 'More Acute' : 'Depper'}</p>
                  </div>
                  <button onClick={() => setPitch(Math.min(12, pitch + 1))} className="w-14 h-14 bg-white/5 rounded-xl flex items-center justify-center text-2xl font-light hover:bg-white/10 transition-all border border-white/5">＋</button>
               </div>

               <input 
                  type="range" min="-12" max="12" step="1" value={pitch} 
                  onChange={(e) => setPitch(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-indigo-500 mb-6"
                />

               <div className="flex gap-2">
                  {[-12, -6, 0, 6, 12].map(v => (
                    <button 
                      key={v}
                      onClick={() => setPitch(v)}
                      className={`flex-1 py-3 rounded-lg text-[10px] font-black transition-all ${pitch === v ? 'bg-white text-black ring-2 ring-white/50' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}
                    >
                      {v > 0 ? `+${v}` : v}
                    </button>
                  ))}
               </div>
            </div>

            <div className="bg-[#1a1a1f] border border-white/5 p-8 rounded-xl flex flex-col justify-between">
               <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center">
                 <Zap className="w-4 h-4 mr-2 text-yellow-500" /> Efectos Aplicados Real-Time
               </h3>

               <div className="flex-1 grid grid-cols-2 gap-4 h-full">
                  <div className="space-y-4">
                     <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                        <p className="text-[8px] font-black text-gray-700 uppercase mb-1">Tempo</p>
                        <p className="text-xl font-black text-white">{tempo}%</p>
                     </div>
                     <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                        <p className="text-[8px] font-black text-gray-700 uppercase mb-1">Pitch</p>
                        <p className="text-xl font-black text-white">{pitch} st</p>
                     </div>
                     <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                        <p className="text-[8px] font-black text-gray-700 uppercase mb-1">Original Key</p>
                        <p className="text-xl font-black text-white truncate">{key}</p>
                     </div>
                  </div>
                  <div className="space-y-4 flex flex-col h-full">
                     <div className="p-4 bg-black p-4 border-2 border-white/5 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <Volume2 size={12} className="text-gray-500" />
                          <span className="text-[8px] font-black text-white uppercase">Volumen</span>
                          <span className="text-xs font-bold text-white">{volume}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="100" value={volume} 
                          onChange={(e) => setVolume(Number(e.target.value))}
                          className="w-full h-1 bg-white/10 rounded-full appearance-none accent-white"
                        />
                     </div>
                     
                     <div className="p-4 bg-indigo-600/10 rounded-xl border border-indigo-500/20 flex flex-col justify-center items-center">
                        <p className="text-[8px] font-black text-indigo-500 uppercase mb-1">Tonalidad Actual</p>
                        <p className="text-2xl font-black text-indigo-400">{getShiftedKey()}</p>
                     </div>

                     <div className="flex-1 flex flex-col gap-2">
                        <button onClick={() => { setTempo(100); setPitch(0); setVolume(100); }} className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-black uppercase text-gray-400 transition-all">Reset Todo</button>
                        <button className="w-full flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black uppercase shadow-xl transition-all flex flex-col items-center justify-center">
                          <Download size={16} className="mb-1" />
                          Export Audio
                        </button>
                     </div>
                  </div>
               </div>
            </div>

          </div>
        </div>

        {/* Neural Signal Footer */}
        <div className="px-10 py-4 bg-black/60 border-t border-white/5 flex items-center justify-between text-[8px] font-black tracking-[0.4em] text-gray-600">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-ping" />
              <span className="text-blue-500/60 uppercase">System Ready</span>
            </div>
            <span>Bitrate: 320kbps</span>
            <span>Latency: Low</span>
          </div>
          <span className="opacity-40">Powered by Moises Engine Alpha</span>
        </div>

      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  )
}

export default PitchTempoModal