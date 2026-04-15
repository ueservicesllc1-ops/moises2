'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Play, Pause } from 'lucide-react'
import DJKnob from './DJKnob'
import AdminModalLabel from './AdminModalLabel'

interface MetronomeModalProps {
  isOpen: boolean
  onClose: () => void
  embedded?: boolean
}

const MetronomeModal: React.FC<MetronomeModalProps> = ({ isOpen, onClose, embedded = false }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [bpm, setBpm] = useState(120)
  const [volume, setVolume] = useState(0.5)
  const [isMuted, setIsMuted] = useState(false)
  const [previousVolume, setPreviousVolume] = useState(0.5) // Guardar volumen antes de mutear
  const [clickSound, setClickSound] = useState<'click' | 'beep' | 'wood'>('click')
  const [timeSignature, setTimeSignature] = useState<'4/4' | '3/4' | '5/8' | '6/8'>('4/4')
  const [currentBeat, setCurrentBeat] = useState(0)
  
  // Controles avanzados de click
  const [accentVolume, setAccentVolume] = useState(1.0) // Volumen del acento (primer beat)
  const [offbeatVolume, setOffbeatVolume] = useState(0) // Volumen de los offbeats (clicks entre tiempos)
  const [isRendering, setIsRendering] = useState(false)
  
  // Función para mute/unmute
  const toggleMute = () => {
    if (isMuted) {
      // Unmute: Restaurar volumen anterior
      setVolume(previousVolume)
      setIsMuted(false)
    } else {
      // Mute: Guardar volumen actual y poner a 0
      setPreviousVolume(volume)
      setVolume(0)
      setIsMuted(true)
    }
  }
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Refs para valores de volumen (para que playClick siempre tenga los valores actuales)
  const volumeRef = useRef(volume)
  const accentVolumeRef = useRef(accentVolume)
  const offbeatVolumeRef = useRef(offbeatVolume)
  
  // Actualizar refs cuando cambian los valores
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])
  
  useEffect(() => {
    accentVolumeRef.current = accentVolume
  }, [accentVolume])
  
  useEffect(() => {
    offbeatVolumeRef.current = offbeatVolume
  }, [offbeatVolume])

  // Crear contexto de audio
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // Obtener el número de beats según el compás
  const getBeatsPerMeasure = () => {
    switch (timeSignature) {
      case '4/4': return 4
      case '3/4': return 3
      case '5/8': return 5
      case '6/8': return 6
      default: return 4
    }
  }

  // Generar sonido del click principal
  const playClick = (isAccent: boolean = false) => {
    if (!audioContextRef.current || isMuted) return

    const audioContext = audioContextRef.current
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Diferentes frecuencias según el tipo de sonido
    let baseFrequency = 1000
    switch (clickSound) {
      case 'click':
        baseFrequency = 1000
        break
      case 'beep':
        baseFrequency = 800
        break
      case 'wood':
        baseFrequency = 600
        break
    }

    // El primer beat (acento) suena más agudo y con volumen personalizado
    if (isAccent) {
      oscillator.frequency.value = baseFrequency * 1.5
      gainNode.gain.value = volumeRef.current * accentVolumeRef.current
    } else {
      // Beats normales (2, 3, 4, etc.)
      oscillator.frequency.value = baseFrequency
      gainNode.gain.value = volumeRef.current
    }

    oscillator.type = 'sine'

    const currentTime = audioContext.currentTime
    oscillator.start(currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.05)
    oscillator.stop(currentTime + 0.05)
  }

  // Generar sonido del offbeat (click entre tiempos)
  const playOffbeat = () => {
    if (!audioContextRef.current || isMuted || offbeatVolumeRef.current === 0) return

    const audioContext = audioContextRef.current
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Usar el mismo sonido seleccionado pero más suave
    let baseFrequency = 1000
    switch (clickSound) {
      case 'click':
        baseFrequency = 1000
        break
      case 'beep':
        baseFrequency = 800
        break
      case 'wood':
        baseFrequency = 600
        break
    }

    oscillator.frequency.value = baseFrequency // Misma frecuencia que beats normales
    gainNode.gain.value = volumeRef.current * offbeatVolumeRef.current

    oscillator.type = 'sine'

    const currentTime = audioContext.currentTime
    oscillator.start(currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, currentTime + 0.05)
    oscillator.stop(currentTime + 0.05)
  }

  // Renderizar y descargar click
  const renderAndDownloadClick = async () => {
    setIsRendering(true)
    try {
      const offlineContext = new OfflineAudioContext(2, 44100 * 60, 44100) // 60 segundos de audio
      const beatsPerMeasure = getBeatsPerMeasure()
      const beatInterval = 60 / bpm
      const totalBeats = Math.floor(60 / beatInterval) // Beats en 60 segundos
      
      for (let i = 0; i < totalBeats; i++) {
        const time = i * beatInterval
        const isAccent = (i % beatsPerMeasure) === 0
        
        const oscillator = offlineContext.createOscillator()
        const gainNode = offlineContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(offlineContext.destination)
        
        // Frecuencia según tipo de sonido
        let baseFrequency = 1000
        switch (clickSound) {
          case 'click': baseFrequency = 1000; break
          case 'beep': baseFrequency = 800; break
          case 'wood': baseFrequency = 600; break
        }
        
        oscillator.frequency.value = isAccent ? baseFrequency * 1.5 : baseFrequency
        gainNode.gain.value = isAccent ? volume * accentVolume : volume * offbeatVolume
        oscillator.type = 'sine'
        
        oscillator.start(time)
        gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
        oscillator.stop(time + 0.05)
      }
      
      const buffer = await offlineContext.startRendering()
      
      // Convertir a WAV y descargar
      const wav = audioBufferToWav(buffer)
      const blob = new Blob([wav], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `metronome_${bpm}bpm_${timeSignature}.wav`
      a.click()
      URL.revokeObjectURL(url)
      
      console.log('✅ Click renderizado y descargado')
    } catch (error) {
      console.error('Error al renderizar click:', error)
      alert('Error al renderizar el click')
    } finally {
      setIsRendering(false)
    }
  }

  // Convertir AudioBuffer a WAV
  const audioBufferToWav = (buffer: AudioBuffer): ArrayBuffer => {
    const numOfChan = buffer.numberOfChannels
    const length = buffer.length * numOfChan * 2 + 44
    const bufferArray = new ArrayBuffer(length)
    const view = new DataView(bufferArray)
    const channels = []
    let offset = 0
    let pos = 0

    // Write WAV header
    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true)
      pos += 2
    }
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true)
      pos += 4
    }

    setUint32(0x46464952) // "RIFF"
    setUint32(length - 8) // file length - 8
    setUint32(0x45564157) // "WAVE"
    setUint32(0x20746d66) // "fmt " chunk
    setUint32(16) // length = 16
    setUint16(1) // PCM (uncompressed)
    setUint16(numOfChan)
    setUint32(buffer.sampleRate)
    setUint32(buffer.sampleRate * 2 * numOfChan) // avg. bytes/sec
    setUint16(numOfChan * 2) // block-align
    setUint16(16) // 16-bit
    setUint32(0x61746164) // "data" - chunk
    setUint32(length - pos - 4) // chunk length

    // Write interleaved data
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i))
    }

    while (pos < length) {
      for (let i = 0; i < numOfChan; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]))
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        view.setInt16(pos, sample, true)
        pos += 2
      }
      offset++
    }

    return bufferArray
  }

  // Controlar el metrónomo
  useEffect(() => {
    if (isPlaying) {
      const beatInterval = (60 / bpm) * 1000 // Intervalo entre beats principales
      const offbeatInterval = beatInterval / 2 // Offbeat entre beats (la mitad del tiempo)
      const beatsPerMeasure = getBeatsPerMeasure()
      
      setCurrentBeat(0)
      playClick(true) // Click inicial con acento
      
      let beat = 0
      let tickCount = 0
      
      // Usar un intervalo más pequeño para manejar beats y offbeats
      intervalRef.current = setInterval(() => {
        tickCount++
        
        if (tickCount % 2 === 1) {
          // Offbeat (click entre tiempos)
          playOffbeat()
        } else {
          // Beat principal
          beat = (beat + 1) % beatsPerMeasure
          setCurrentBeat(beat)
          playClick(beat === 0) // Acento en el primer beat
        }
      }, offbeatInterval)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setCurrentBeat(0)
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, bpm, clickSound, timeSignature])

  const togglePlay = () => {
    setIsPlaying(!isPlaying)
  }

  const handleBpmChange = (value: number) => {
    setBpm(Math.max(40, Math.min(240, value)))
  }

  if (!embedded && !isOpen) return null

  return (
    <div className={embedded ? '' : 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-2 md:p-4'}>
      {!embedded && <AdminModalLabel modalName="MetronomeModal" />}
      <div className={`bg-gray-900 border-2 border-gray-700 p-4 md:p-6 max-w-6xl w-full shadow-2xl ${embedded ? '' : 'h-[100dvh] overflow-y-auto md:h-auto md:mx-4'}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Metrónomo</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Main Content - Horizontal Layout */}
        <div className="flex gap-8 items-center justify-center max-w-5xl mx-auto -mt-12">
          {/* Left Section - BPM Display & Beat Indicator */}
          <div className="flex-shrink-0 flex flex-col items-center space-y-4 w-80">
            {/* BPM Display - LED Style */}
            <div className="text-center">
              {/* Pantalla LED para BPM */}
              <div 
                className="relative px-6 py-4"
                style={{
                  background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                  boxShadow: `
                    inset 0 3px 6px rgba(0,0,0,0.9),
                    inset 0 -2px 4px rgba(255,255,255,0.05),
                    0 4px 12px rgba(0,0,0,0.7)
                  `,
                  borderRadius: '4px'
                }}
              >
                {/* Beat Indicator LEDs - Arriba dentro de la pantalla */}
                <div className="flex justify-center space-x-2 mb-3">
                  {Array.from({ length: getBeatsPerMeasure() }).map((_, index) => (
                    <div
                      key={index}
                      className={`w-3 h-3 rounded-full transition-all duration-100 ${
                        isPlaying && index === currentBeat
                          ? index === 0
                            ? 'bg-red-500'
                            : 'bg-blue-400'
                          : 'bg-gray-800'
                      }`}
                      style={{
                        boxShadow: isPlaying && index === currentBeat 
                          ? index === 0
                            ? '0 0 8px rgba(239, 68, 68, 1), 0 0 4px rgba(239, 68, 68, 0.8)'
                            : '0 0 8px rgba(96, 165, 250, 1), 0 0 4px rgba(96, 165, 250, 0.8)'
                          : 'inset 0 1px 2px rgba(0,0,0,0.5)'
                      }}
                    />
                  ))}
                </div>

                {/* Pantalla interior */}
                <div 
                  className="relative px-8 py-4"
                  style={{
                    background: 'linear-gradient(180deg, #000d1a 0%, #001a33 50%, #000d1a 100%)',
                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.95)',
                    border: '2px solid #001122',
                    borderRadius: '2px'
                  }}
                >
                  {/* Número BPM */}
                  <div 
                    className="text-8xl font-bold text-center tabular-nums"
                    style={{
                      color: '#00d9ff',
                      textShadow: `
                        0 0 20px rgba(0,217,255,0.8),
                        0 0 10px rgba(0,217,255,0.6),
                        0 0 5px rgba(0,217,255,0.4)
                      `,
                      fontFamily: 'monospace',
                      letterSpacing: '0.05em'
                    }}
                  >
                    {bpm}
                  </div>
                </div>
                
                {/* Label BPM */}
                <div 
                  className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-3 py-0.5"
                  style={{
                    background: '#0a0a0a',
                    border: '1px solid #333'
                  }}
                >
                  <span 
                    className="text-xs font-bold tracking-widest"
                    style={{
                      color: '#00d9ff',
                      textShadow: '0 0 4px rgba(0,217,255,0.6)',
                      fontFamily: 'monospace'
                    }}
                  >
                    BPM
                  </span>
                </div>
              </div>
            </div>

            {/* Play/Pause Button */}
            <button
              onClick={togglePlay}
              className={`w-48 py-4 font-bold text-lg transition-all duration-200 flex items-center justify-center space-x-2 backdrop-blur-md border ${
                isPlaying
                  ? 'bg-red-600/80 hover:bg-red-600/90 text-white border-red-500/50 shadow-lg shadow-red-500/20'
                  : 'bg-blue-600/80 hover:bg-blue-600/90 text-white border-blue-500/50 shadow-lg shadow-blue-500/20'
              }`}
              style={{
                boxShadow: isPlaying
                  ? '0 6px 12px rgba(220, 38, 38, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                  : '0 6px 12px rgba(37, 99, 235, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
              }}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-6 h-6" />
                  <span>Detener</span>
                </>
              ) : (
                <>
                  <Play className="w-6 h-6" />
                  <span>Iniciar</span>
                </>
              )}
            </button>
          </div>

          {/* Right Section - Controls */}
          <div className="flex-1 grid grid-cols-2 gap-6 items-start">
            {/* Column 1 */}
            <div className="space-y-6 flex flex-col items-center">
              {/* Time Signature Selector */}
              <div className="w-full">
                <label className="text-gray-300 text-sm mb-2 block text-center">Compás</label>
                <div className="grid grid-cols-4 gap-2">
                  {['4/4', '3/4', '5/8', '6/8'].map((sig) => (
                    <button
                      key={sig}
                      onClick={() => setTimeSignature(sig as any)}
                      className={`py-3 px-2 font-bold transition-all duration-200 ${
                        timeSignature === sig
                          ? 'bg-gradient-to-br from-white/30 via-white/20 to-white/10 text-white border border-white/40 shadow-xl'
                          : 'bg-gradient-to-br from-black/40 via-black/30 to-black/20 text-gray-400 hover:from-white/20 hover:to-white/10 border border-gray-600/40'
                      }`}
                      style={{
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        boxShadow: timeSignature === sig 
                          ? '0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
                          : '0 4px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)'
                      }}
                    >
                      {sig}
                    </button>
                  ))}
                </div>
              </div>

              {/* Click Sound Selector */}
              <div className="w-full">
                <label className="text-gray-300 text-sm mb-2 block text-center">Sonido del Click</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setClickSound('click')}
                    className={`py-3 px-2 transition-all duration-200 ${
                      clickSound === 'click'
                        ? 'bg-gradient-to-br from-white/30 via-white/20 to-white/10 text-white border border-white/40 shadow-xl'
                        : 'bg-gradient-to-br from-black/40 via-black/30 to-black/20 text-gray-400 hover:from-white/20 hover:to-white/10 border border-gray-600/40'
                    }`}
                    style={{
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      boxShadow: clickSound === 'click'
                        ? '0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
                        : '0 4px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)'
                    }}
                  >
                    Click
                  </button>
                  <button
                    onClick={() => setClickSound('beep')}
                    className={`py-3 px-2 transition-all duration-200 ${
                      clickSound === 'beep'
                        ? 'bg-gradient-to-br from-white/30 via-white/20 to-white/10 text-white border border-white/40 shadow-xl'
                        : 'bg-gradient-to-br from-black/40 via-black/30 to-black/20 text-gray-400 hover:from-white/20 hover:to-white/10 border border-gray-600/40'
                    }`}
                    style={{
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      boxShadow: clickSound === 'beep'
                        ? '0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
                        : '0 4px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)'
                    }}
                  >
                    Beep
                  </button>
                  <button
                    onClick={() => setClickSound('wood')}
                    className={`py-3 px-2 transition-all duration-200 ${
                      clickSound === 'wood'
                        ? 'bg-gradient-to-br from-white/30 via-white/20 to-white/10 text-white border border-white/40 shadow-xl'
                        : 'bg-gradient-to-br from-black/40 via-black/30 to-black/20 text-gray-400 hover:from-white/20 hover:to-white/10 border border-gray-600/40'
                    }`}
                    style={{
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      boxShadow: clickSound === 'wood'
                        ? '0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
                        : '0 4px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)'
                    }}
                  >
                    Wood
                  </button>
                </div>
              </div>

              {/* BPM Slider */}
              <div className="w-full">
                <label className="text-gray-300 text-sm mb-2 block text-center">Tempo</label>
                <input
                  type="range"
                  min="40"
                  max="240"
                  value={bpm}
                  onChange={(e) => handleBpmChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 appearance-none cursor-pointer accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>40</span>
                  <span>240</span>
                </div>
              </div>

              {/* Controles Avanzados de Click */}
              <div className="bg-gray-800 border border-gray-700 p-3 space-y-3 w-full">
                {/* Volumen Acento */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-gray-400" style={{ fontSize: '10px' }}>Volumen Acento</label>
                    <span className="text-gray-300 font-mono" style={{ fontSize: '10px' }}>{Math.round(accentVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={accentVolume}
                    onChange={(e) => setAccentVolume(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Volumen Offbeat */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-gray-400" style={{ fontSize: '10px' }}>Volumen Offbeat</label>
                    <span className="text-gray-300 font-mono" style={{ fontSize: '10px' }}>{Math.round(offbeatVolume * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={offbeatVolume}
                    onChange={(e) => setOffbeatVolume(parseFloat(e.target.value))}
                    className="w-full h-1 bg-gray-700 appearance-none cursor-pointer accent-green-500"
                  />
                </div>
              </div>
            </div>

            {/* Column 2 */}
            <div className="space-y-6 flex flex-col items-center justify-start h-full">
              {/* Volume Control - DJ Knob */}
              <div>
                <DJKnob
                  value={volume}
                  onChange={setVolume}
                  size={140}
                  label="VOLUMEN"
                  isMuted={isMuted}
                  onMuteToggle={toggleMute}
                />
              </div>

              {/* Botón Exportar Click */}
              <div>
                <button
                  onClick={renderAndDownloadClick}
                  disabled={isRendering}
                  className={`w-48 py-3 font-bold text-sm transition-all duration-200 flex items-center justify-center space-x-2 backdrop-blur-md border ${
                    isRendering
                      ? 'bg-black/40 text-gray-500 cursor-not-allowed border-gray-700/50'
                      : 'bg-green-600/80 hover:bg-green-600/90 text-white border-green-500/50 shadow-lg shadow-green-500/20'
                  }`}
                  style={{
                    boxShadow: isRendering
                      ? '0 2px 4px rgba(0,0,0,0.2)'
                      : '0 6px 12px rgba(34, 197, 94, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
                  }}
                >
                  {isRendering ? (
                    <>
                      <span>Renderizando...</span>
                    </>
                  ) : (
                    <>
                      <span>⬇</span>
                      <span>Exportar Click</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MetronomeModal

