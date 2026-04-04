'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  X, Play, Pause, RotateCcw, Music, Volume2, 
  Target, Upload, Loader2, Download, Square,
  Zap, Disc, Waves, Activity, Info, ChevronRight,
  Settings, Sliders, Layout, Monitor, Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import { getBackendUrl } from '@/lib/config'

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
  const [key, setKey] = useState<string>('Esperando...')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav')
  
  // Refs
  const wavesurferRef = useRef<any>(null)
  const waveformContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const grainPlayerRef = useRef<any>(null)

  // Engine Init
  useEffect(() => {
    if (!isOpen || !audioFile || !waveformContainerRef.current) return

    let ws: any = null
    let Tone: any = null
    let interval: any = null

    const initEngine = async () => {
      try {
        const WSModule = await import('wavesurfer.js')
        const WaveSurfer = WSModule.default
        const ToneModule = await import('tone')
        Tone = ToneModule
        
        await Tone.start()
        const url = URL.createObjectURL(audioFile)
        
        grainPlayerRef.current = new Tone.GrainPlayer(url, () => {
          setDuration(grainPlayerRef.current.buffer.duration)
        }).toDestination()
        
        grainPlayerRef.current.playbackRate = tempo / 100
        grainPlayerRef.current.detune = pitch * 100
        grainPlayerRef.current.grainSize = 0.1
        grainPlayerRef.current.overlap = 0.05

        ws = WaveSurfer.create({
          container: waveformContainerRef.current!,
          waveColor: '#3b82f633',
          progressColor: '#3b82f6',
          cursorColor: '#ffffff',
          barWidth: 2,
          barGap: 3,
          barRadius: 3,
          height: 80,
          normalize: true,
          fillParent: true,
          hideScrollbar: true,
          interact: true
        })

        ws.on('ready', () => setDuration(ws.getDuration()))

        ws.on('interaction', (newProgress: number) => {
          if (grainPlayerRef.current) {
            const time = newProgress * ws.getDuration()
            if (grainPlayerRef.current.state === 'started') {
              grainPlayerRef.current.stop()
              grainPlayerRef.current.start(undefined, time)
            } else {
              setCurrentTime(time)
            }
          }
        })

        ws.load(url)
        wavesurferRef.current = ws

        interval = setInterval(() => {
          if (grainPlayerRef.current && grainPlayerRef.current.state === 'started') {
            const time = grainPlayerRef.current.seconds
            const dur = ws.getDuration()
            if (isFinite(time) && isFinite(dur) && dur > 0) {
              setCurrentTime(time)
              ws.seekTo(time / dur)
            }
          }
        }, 100)

        return () => {
          clearInterval(interval)
          URL.revokeObjectURL(url)
          if (ws) ws.destroy()
        }
      } catch (err) {
        console.error('DSP Engine Error:', err)
      }
    }

    initEngine()

    return () => {
      if (interval) clearInterval(interval)
      if (ws) ws.destroy()
      if (grainPlayerRef.current) {
        grainPlayerRef.current.stop()
        grainPlayerRef.current.dispose()
      }
    }
  }, [isOpen, audioFile])

  useEffect(() => {
    if (grainPlayerRef.current) {
      grainPlayerRef.current.playbackRate = tempo / 100
    }
  }, [tempo])

  useEffect(() => {
    if (grainPlayerRef.current) {
      grainPlayerRef.current.detune = pitch * 100
    }
  }, [pitch])

  useEffect(() => {
    if (grainPlayerRef.current) {
      import('tone').then(Tone => {
        grainPlayerRef.current.volume.value = Tone.gainToDb(volume / 100)
      })
    }
  }, [volume])

  const togglePlay = () => {
    if (!grainPlayerRef.current) return
    if (isPlaying) {
      grainPlayerRef.current.stop()
    } else {
      grainPlayerRef.current.start(undefined, currentTime)
    }
    setIsPlaying(!isPlaying)
  }

  const stopAudio = () => {
    if (grainPlayerRef.current) {
      grainPlayerRef.current.stop()
      setIsPlaying(false)
      setCurrentTime(0)
      if (wavesurferRef.current) wavesurferRef.current.seekTo(0)
    }
  }

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

  const handleExport = async () => {
    if (!audioFile) return
    setIsExporting(true)
    const toastId = toast.loading(`Exportando Máster 24-bit (${exportFormat.toUpperCase()})...`)
    try {
      const Tone = await import('tone')
      const renderDuration = duration / (tempo / 100)
      const offlineBuffer = await Tone.Offline(async () => {
        const url = URL.createObjectURL(audioFile)
        const shifter = new Tone.GrainPlayer(url).toDestination()
        await shifter.buffer.load(url)
        shifter.playbackRate = tempo / 100
        shifter.detune = pitch * 100
        shifter.start(0)
      }, renderDuration)
      let blob: Blob
      if (exportFormat === 'wav') {
        blob = audioBufferToWav24Bit(offlineBuffer)
      } else {
        blob = await audioBufferToMp3(offlineBuffer)
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `moises_master_24bit_${pitch}st_${tempo}p.${exportFormat}`
      a.click()
      toast.success(`¡${exportFormat.toUpperCase()} Exportado con éxito!`, { id: toastId })
    } catch (err) {
      toast.error('Error en exportación.', { id: toastId })
    } finally {
      setIsExporting(false)
    }
  }

  function audioBufferToWav24Bit(buffer: any) {
    const numOfChan = buffer.numberOfChannels, length = buffer.length * numOfChan * 3 + 44, bufferData = new ArrayBuffer(length), view = new DataView(bufferData), channels = [], sampleRate = buffer.sampleRate
    let offset = 0, pos = 0
    function setUint32(data: any) { view.setUint32(pos, data, true); pos += 4 }
    function setUint16(data: any) { view.setUint16(pos, data, true); pos += 2 }
    setUint32(0x46464952); setUint32(length - 8); setUint32(0x45564157); setUint32(0x20746d66); setUint32(16); setUint16(1); setUint16(numOfChan); setUint32(sampleRate); setUint32(sampleRate * 3 * numOfChan); setUint16(numOfChan * 3); setUint16(24); setUint32(0x61746164); setUint32(length - pos - 4)
    for (let i = 0; i < buffer.numberOfChannels; i++) channels.push(buffer.getChannelData(i))
    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]))
        sample = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF
        view.setUint8(pos++, sample & 0xFF)
        view.setUint8(pos++, (sample >> 8) & 0xFF)
        view.setUint8(pos++, (sample >> 16) & 0xFF)
      }
      offset++
    }
    return new Blob([bufferData], { type: 'audio/wav' })
  }

  async function audioBufferToMp3(buffer: any) {
    const lamejs = await import('lamejs')
    const channels = buffer.numberOfChannels, sampleRate = buffer.sampleRate, mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 320), mp3Data = [], sampleBlockSize = 576, leftData = buffer.getChannelData(0), rightData = channels > 1 ? buffer.getChannelData(1) : leftData
    const leftPcm = new Int16Array(leftData.length), rightPcm = new Int16Array(rightData.length)
    for (let i = 0; i < leftData.length; i++) {
      leftPcm[i] = leftData[i] < 0 ? leftData[i] * 0x8000 : leftData[i] * 0x7FFF
      rightPcm[i] = rightData[i] < 0 ? rightData[i] * 0x8000 : rightData[i] * 0x7FFF
    }
    for (let i = 0; i < leftPcm.length; i += sampleBlockSize) {
      const leftChunk = leftPcm.subarray(i, i + sampleBlockSize), rightChunk = rightPcm.subarray(i, i + sampleBlockSize)
      const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk)
      if (mp3buf.length > 0) mp3Data.push(mp3buf)
    }
    const mp3buf = mp3encoder.flush()
    if (mp3buf.length > 0) mp3Data.push(mp3buf)
    return new Blob(mp3Data as any, { type: 'audio/mp3' })
  }

  const getShiftedKey = () => {
    if (key === 'Esperando...' || key === 'Analizando...' || key === 'N/A' || pitch === 0) return key
    const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    const parts = key.split(' ')
    const baseNote = parts[0], mode = parts[1] || '', idx = notes.indexOf(baseNote)
    if (idx === -1) return key
    let newIdx = (idx + pitch) % 12
    if (newIdx < 0) newIdx += 12
    return notes[newIdx] + (mode ? ' ' + mode : '')
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[1100] p-4 backdrop-blur-xl">
      <div className="bg-[#0f0f12] border border-white/10 rounded-[2.5rem] w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Glows */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/5 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/5 blur-[120px] pointer-events-none rounded-full" />

        {/* Dynamic Header */}
        <div className="px-10 py-6 flex items-center justify-between border-b border-white/5 bg-black/40 flex-shrink-0">
           <div className="flex items-center space-x-6">
              <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-white/10">
                <Disc className="w-6 h-6 text-white animate-spin-slow" />
              </div>
              <div>
                 <h2 className="text-2xl font-black text-white tracking-tighter italic">MASTER <span className="text-blue-500 font-bold">ENGINE</span></h2>
                 <p className="text-[10px] font-black text-blue-500/50 uppercase tracking-widest">{audioFile ? 'Neural DSP Pro Session Active' : 'Waiting for Signal Interface'}</p>
              </div>
           </div>
           <button onClick={onClose} className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all border border-white/5">
             <X className="w-5 h-5" />
           </button>
        </div>

        {/* Content Interior */}
        <div className="flex-1 overflow-y-auto px-10 py-8 space-y-8 custom-scrollbar">
          
          <div className="grid grid-cols-12 gap-10">
            
            {/* Sidebar Data */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
               <div className="bg-[#16161a] border border-white/5 rounded-[2rem] p-8 shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/50" />
                  <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6 flex items-center">
                    <Activity className="w-4 h-4 mr-2 text-blue-500" /> AI SCAN DATA
                  </h3>

                  <div className="space-y-4">
                     <div className="p-5 bg-black/40 rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-2 tracking-widest">Harmonic Key</p>
                        <span className={`font-black text-white ${key.includes('...') ? 'text-lg animate-pulse' : 'text-4xl'}`}>
                          {key === 'Esperando...' ? '--' : key}
                        </span>
                     </div>
                     <div className="p-5 bg-black/40 rounded-2xl border border-white/5">
                        <p className="text-[9px] text-gray-500 font-bold uppercase mb-2 tracking-widest">BPM Original</p>
                        <div className="flex items-baseline space-x-2">
                           <span className="text-4xl font-black text-white">{detectedBpm > 0 ? Math.round(detectedBpm) : '--'}</span>
                           <span className="text-[10px] font-black text-gray-600">BPM</span>
                        </div>
                     </div>
                  </div>

                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-[#16161a]/90 backdrop-blur-md flex flex-col items-center justify-center space-y-4 z-10">
                       <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                       <p className="text-[7px] font-black text-white uppercase tracking-[0.3em] animate-pulse">Analizando Señal...</p>
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
                  <p className="text-gray-600 text-[9px] font-bold uppercase tracking-widest">WAV / MP3 / FLAC / M4A</p>
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileSelect} className="hidden" />
               </div>
            </div>

            {/* Main Console */}
            <div className="col-span-12 lg:col-span-8 space-y-10">
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
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
                        <p className="text-[10px] font-black text-purple-500 uppercase mt-2 tracking-widest">{detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : '--'} BPM SYNC</p>
                     </div>
                     <div className="space-y-6">
                        <input 
                          type="range" min="50" max="200" step="1" value={tempo} 
                          onChange={(e) => setTempo(Number(e.target.value))}
                          className="w-full h-1.5 bg-white/5 rounded-full appearance-none cursor-pointer accent-purple-600"
                        />
                        <div className="flex gap-4">
                           <button onClick={() => setTempo(Math.max(50, tempo - 5))} className="flex-1 py-4 bg-white/5 rounded-xl text-[10px] font-black uppercase hover:bg-white/10 transition-all border border-white/5 font-bold">- 5%</button>
                           <button onClick={() => setTempo(Math.min(200, tempo + 5))} className="flex-1 py-4 bg-white/5 rounded-xl text-[10px] font-black uppercase hover:bg-white/10 transition-all border border-white/5 text-white font-bold">+ 5%</button>
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
                          onClick={togglePlay}
                          disabled={!audioFile}
                          className="w-20 h-20 bg-white hover:bg-gray-200 text-black rounded-[1.75rem] flex items-center justify-center transition-all disabled:opacity-20 shadow-xl active:scale-95"
                        >
                          {isPlaying ? <Pause size={30} fill="black" /> : <Play size={30} fill="black" className="ml-1" />}
                        </button>
                        <div>
                           <h5 className="text-white font-black text-lg tracking-tight truncate max-w-[250px] font-mono">{audioFile?.name || 'VIRTUAL DECK EMPTY'}</h5>
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
                        <button onClick={stopAudio} className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-gray-500 hover:text-red-500 transition-all border border-white/5">
                           <Square size={20} fill="currentColor" />
                        </button>
                     </div>
                  </div>
                  <div className="relative h-32 bg-black/80 rounded-3xl px-6 flex flex-col justify-center border border-white/5 overflow-hidden">
                     {!audioFile && <p className="text-center text-[9px] font-black text-gray-700 uppercase tracking-widest italic animate-pulse">Scanning Signal...</p>}
                     <div ref={waveformContainerRef} className="w-full" />
                  </div>
               </div>
            </div>
          </div>

          {/* Master Section - THIS IS THE ONLY PART WE COMPACTED TO AVOID SCROLL */}
          <div className="flex items-stretch gap-6 h-32">
             <div className="flex-[3] bg-gradient-to-br from-[#16161a] to-[#0a0a0c] border border-white/5 rounded-[2.5rem] px-10 flex items-center justify-around shadow-xl overflow-hidden">
                <div className="text-center whitespace-nowrap min-w-[150px]">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-2 tracking-widest">Target Key</p>
                   <p className={`font-black text-blue-500 truncate ${getShiftedKey().length > 10 ? 'text-3xl' : 'text-5xl'}`}>{getShiftedKey() || '--'}</p>
                </div>
                <div className="h-12 w-px bg-white/5 flex-shrink-0" />
                <div className="text-center whitespace-nowrap min-w-[100px]">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-2 tracking-widest">Elastic BPM</p>
                   <p className="text-5xl font-black text-purple-500">{detectedBpm > 0 ? Math.round(detectedBpm * tempo / 100) : '--'}</p>
                </div>
                <div className="h-12 w-px bg-white/5 flex-shrink-0" />
                <div className="text-center whitespace-nowrap min-w-[150px]">
                   <p className="text-[10px] font-black text-gray-600 uppercase mb-2 tracking-widest">Master Bit-Depth</p>
                   <p className="text-2xl font-black text-white italic">24-BIT HIGH-RES</p>
                </div>
             </div>

             <div className="flex-1 bg-white rounded-[2.5rem] p-4 flex flex-col justify-between shadow-xl min-w-[200px]">
                <div className="flex bg-black/5 p-1 rounded-2xl">
                   <button 
                     onClick={() => setExportFormat('wav')}
                     className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all ${exportFormat === 'wav' ? 'bg-black text-white shadow-md' : 'text-black/30 hover:text-black'}`}
                   >
                     WAV
                   </button>
                   <button 
                     onClick={() => setExportFormat('mp3')}
                     className={`flex-1 py-3 text-[10px] font-black rounded-xl transition-all ${exportFormat === 'mp3' ? 'bg-black text-white shadow-md' : 'text-black/30 hover:text-black'}`}
                   >
                     MP3
                   </button>
                </div>
                <button 
                  onClick={handleExport}
                  disabled={isExporting || !audioFile}
                  className="w-full h-12 bg-black text-white rounded-2xl flex items-center justify-center space-x-3 transition-all hover:bg-gray-900 active:scale-95 disabled:opacity-30 group"
                >
                   {isExporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5 group-hover:translate-y-1 transition-transform" />}
                   <span className="text-[9px] font-black uppercase tracking-widest">{isExporting ? 'Processing' : 'Export Master'}</span>
                </button>
             </div>
          </div>

        </div>

        {/* Telemetry Footer */}
        <div className="px-10 py-5 border-t border-white/5 bg-black/60 flex items-center justify-between text-[8px] font-black tracking-[0.3em] text-gray-600 flex-shrink-0">
           <div className="flex items-center space-x-6">
              <p className="flex items-center"><div className="w-1 h-1 bg-blue-500 rounded-full mr-2 animate-ping" /> CORE: NEURAL 24-BIT</p>
              <p>ENCODER: {exportFormat.toUpperCase()} ACTIVE</p>
              <p>SIGNAL: STABLE</p>
           </div>
           <p className="opacity-30 tracking-[0.5em]">STUDIO MASTER ENGINE v9.0 // READY FOR SESSION</p>
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