'use client'

import React, { useState, useRef } from 'react'
import { X, Upload, Download, Play, Pause, Square } from 'lucide-react'
import DJKnob from './DJKnob'
import ProfessionalEQ from './ProfessionalEQ'
import AdminModalLabel from './AdminModalLabel'

interface VolumeEQModalProps {
  isOpen: boolean
  onClose: () => void
  embedded?: boolean
}

const VolumeEQModal: React.FC<VolumeEQModalProps> = ({ isOpen, onClose, embedded = false }) => {
  const [masterVolume, setMasterVolume] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)
  
  // EQ Bands (3 bandas)
  const [lowEQ, setLowEQ] = useState(0.5) // Bajos (0-500Hz)
  const [midEQ, setMidEQ] = useState(0.5) // Medios (500-2000Hz)
  const [highEQ, setHighEQ] = useState(0.5) // Agudos (2000Hz+)

  // Audio processing
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Audio playback
  const [isPlaying, setIsPlaying] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const lowShelfRef = useRef<BiquadFilterNode | null>(null)
  const midPeakRef = useRef<BiquadFilterNode | null>(null)
  const highShelfRef = useRef<BiquadFilterNode | null>(null)
  
  // EQ Pro toggle
  const [eqProEnabled, setEqProEnabled] = useState(false)
  const eqChainRef = useRef<AudioNode | null>(null) // Último nodo de la cadena EQ básico
  const [shouldStopEQPro, setShouldStopEQPro] = useState(false)
  const [eqProBands, setEqProBands] = useState<any[]>([]) // Datos de las 8 bandas del EQ Pro

  const toggleMute = () => {
    setIsMuted(!isMuted)
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = !isMuted ? 0 : masterVolume
    }
  }

  // Actualizar volumen en tiempo real
  React.useEffect(() => {
    if (gainNodeRef.current && !isMuted) {
      gainNodeRef.current.gain.value = masterVolume
    }
  }, [masterVolume, isMuted])

  // Actualizar EQ básico en tiempo real (solo si NO está en modo Pro)
  React.useEffect(() => {
    if (lowShelfRef.current && !eqProEnabled) {
      lowShelfRef.current.gain.value = (lowEQ - 0.5) * 24
    }
  }, [lowEQ, eqProEnabled])

  React.useEffect(() => {
    if (midPeakRef.current && !eqProEnabled) {
      midPeakRef.current.gain.value = (midEQ - 0.5) * 24
    }
  }, [midEQ, eqProEnabled])

  React.useEffect(() => {
    if (highShelfRef.current && !eqProEnabled) {
      highShelfRef.current.gain.value = (highEQ - 0.5) * 24
    }
  }, [highEQ, eqProEnabled])

  // Play audio
  const playAudio = () => {
    if (!audioBuffer) return

    // Si está en modo PRO, solo cambia el estado
    if (eqProEnabled) {
      setIsPlaying(true)
      return
    }

    // MODO BÁSICO: manejar reproducción aquí
    // Stop if already playing
    stopAudio()

    try {
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer

      // Create MASTER gain node (AL FINAL de la cadena)
      const gainNode = audioContext.createGain()
      gainNode.gain.value = isMuted ? 0 : masterVolume
      gainNodeRef.current = gainNode

      // MODO BÁSICO: Crear y conectar filtros EQ básicos
      const lowShelf = audioContext.createBiquadFilter()
      lowShelf.type = 'lowshelf'
      lowShelf.frequency.value = 500
      lowShelf.gain.value = (lowEQ - 0.5) * 24
      lowShelfRef.current = lowShelf

      const mid = audioContext.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 1000
      mid.Q.value = 1
      mid.gain.value = (midEQ - 0.5) * 24
      midPeakRef.current = mid

      const highShelf = audioContext.createBiquadFilter()
      highShelf.type = 'highshelf'
      highShelf.frequency.value = 2000
      highShelf.gain.value = (highEQ - 0.5) * 24
      highShelfRef.current = highShelf

      // Connect chain: Source → EQ Básico → Master Volume → Destination
      source.connect(lowShelf)
      lowShelf.connect(mid)
      mid.connect(highShelf)
      highShelf.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      eqChainRef.current = highShelf
      sourceNodeRef.current = source

      source.start()
      setIsPlaying(true)

      source.onended = () => {
        setIsPlaying(false)
      }
    } catch (error) {
      console.error('Error al reproducir:', error)
    }
  }

  // Pause audio
  const pauseAudio = () => {
    if (eqProEnabled) {
      setIsPlaying(false)
    } else if (audioContextRef.current) {
      audioContextRef.current.suspend()
      setIsPlaying(false)
    }
  }

  // Resume audio
  const resumeAudio = () => {
    if (eqProEnabled) {
      setIsPlaying(true)
    } else if (audioContextRef.current) {
      audioContextRef.current.resume()
      setIsPlaying(true)
    }
  }

  // Stop audio
  const stopAudio = () => {
    if (eqProEnabled) {
      console.log('⏹️ Stop en modo PRO - Enviando señal de stop')
      setShouldStopEQPro(true)
      // Esperar un momento antes de cambiar isPlaying para que el efecto de stop se ejecute primero
      setTimeout(() => {
        setIsPlaying(false)
      }, 10)
    } else {
      if (sourceNodeRef.current) {
        sourceNodeRef.current.stop()
        sourceNodeRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      setIsPlaying(false)
    }
  }

  // Callback cuando el EQ Pro completa el stop
  const handleEQProStopComplete = () => {
    setShouldStopEQPro(false)
    console.log('✅ Stop completado en EQ Pro')
  }

  // Cargar archivo de audio
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Detener audio si está reproduciéndose
    stopAudio()

    setAudioFile(file)
    setIsProcessing(true)

    try {
      const arrayBuffer = await file.arrayBuffer()
      const audioContext = new AudioContext()
      const buffer = await audioContext.decodeAudioData(arrayBuffer)
      setAudioBuffer(buffer)
      
      // Resetear todos los valores del EQ
      setMasterVolume(0.8)
      setIsMuted(false)
      setLowEQ(0.5)
      setMidEQ(0.5)
      setHighEQ(0.5)
      setEqProEnabled(false) // Volver a EQ básico
      
      console.log('✅ Audio cargado:', file.name)
      console.log('🔄 EQ reseteado a valores por defecto')
    } catch (error) {
      console.error('❌ Error cargando audio:', error)
      alert('Error al cargar el archivo de audio')
    } finally {
      setIsProcessing(false)
    }
  }

  // Procesar audio con volumen y EQ
  const processAudioWithEQ = async (bandsData?: any[]): Promise<AudioBuffer> => {
    if (!audioBuffer) throw new Error('No hay audio cargado')

    console.log('🎵 Procesando audio con EQ...')
    console.log('   Modo:', eqProEnabled ? 'EQ PRO' : 'EQ BÁSICO')

    const audioContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    )

    // Crear source
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer

    let lastNode: AudioNode = source

    if (eqProEnabled && bandsData) {
      // MODO PRO: Aplicar las 8 bandas del EQ paramétrico
      console.log('   Aplicando 8 bandas del EQ Pro...')
      bandsData.forEach((band, index) => {
        const filter = audioContext.createBiquadFilter()
        filter.type = band.type
        filter.frequency.value = band.frequency
        filter.gain.value = band.gain
        filter.Q.value = band.q
        lastNode.connect(filter)
        lastNode = filter
        console.log(`   Band ${index + 1}: ${band.name} - ${band.gain.toFixed(1)}dB @ ${band.frequency.toFixed(0)}Hz`)
      })
    } else {
      // MODO BÁSICO: Aplicar las 3 bandas del EQ básico
      console.log('   Aplicando 3 bandas del EQ Básico...')
      const lowShelf = audioContext.createBiquadFilter()
      lowShelf.type = 'lowshelf'
      lowShelf.frequency.value = 500
      lowShelf.gain.value = (lowEQ - 0.5) * 24
      console.log(`   Low: ${lowShelf.gain.value.toFixed(1)}dB @ 500Hz`)

      const mid = audioContext.createBiquadFilter()
      mid.type = 'peaking'
      mid.frequency.value = 1000
      mid.Q.value = 1
      mid.gain.value = (midEQ - 0.5) * 24
      console.log(`   Mid: ${mid.gain.value.toFixed(1)}dB @ 1000Hz`)

      const highShelf = audioContext.createBiquadFilter()
      highShelf.type = 'highshelf'
      highShelf.frequency.value = 2000
      highShelf.gain.value = (highEQ - 0.5) * 24
      console.log(`   High: ${highShelf.gain.value.toFixed(1)}dB @ 2000Hz`)

      lastNode.connect(lowShelf)
      lowShelf.connect(mid)
      mid.connect(highShelf)
      lastNode = highShelf
    }

    // Crear gain node para volumen
    const gainNode = audioContext.createGain()
    gainNode.gain.value = isMuted ? 0 : masterVolume
    console.log(`   Master Volume: ${(masterVolume * 100).toFixed(0)}%`)

    // Conectar la cadena final
    lastNode.connect(gainNode)
    gainNode.connect(audioContext.destination)

    source.start()
    console.log('🔄 Renderizando audio...')
    const rendered = await audioContext.startRendering()
    console.log('✅ Audio procesado correctamente')
    return rendered
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

    const setUint16 = (data: number) => {
      view.setUint16(pos, data, true)
      pos += 2
    }
    const setUint32 = (data: number) => {
      view.setUint32(pos, data, true)
      pos += 4
    }

    setUint32(0x46464952) // "RIFF"
    setUint32(length - 8)
    setUint32(0x45564157) // "WAVE"
    setUint32(0x20746d66) // "fmt "
    setUint32(16)
    setUint16(1) // PCM
    setUint16(numOfChan)
    setUint32(buffer.sampleRate)
    setUint32(buffer.sampleRate * 2 * numOfChan)
    setUint16(numOfChan * 2)
    setUint16(16)
    setUint32(0x61746164) // "data"
    setUint32(length - pos - 4)

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

  // Descargar como WAV
  const downloadAsWav = async () => {
    if (!audioBuffer) {
      alert('Por favor, carga un archivo de audio primero')
      return
    }

    setIsProcessing(true)
    try {
      // Pasar las bandas del EQ Pro si está activado
      const processedBuffer = await processAudioWithEQ(eqProEnabled ? eqProBands : undefined)
      const wav = audioBufferToWav(processedBuffer)
      const blob = new Blob([wav], { type: 'audio/wav' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const eqMode = eqProEnabled ? 'EQPro' : 'EQBasic'
      a.download = `${audioFile?.name.replace(/\.[^/.]+$/, '')}_${eqMode}_processed.wav`
      a.click()
      URL.revokeObjectURL(url)
      console.log('✅ Audio descargado como WAV con efectos aplicados')
    } catch (error) {
      console.error('❌ Error:', error)
      alert('Error al procesar el audio')
    } finally {
      setIsProcessing(false)
    }
  }

  // Convertir AudioBuffer a MP3 usando lamejs
  const getBrowserLameEncoder = async () => {
    const w = window as any
    if (w.lamejs?.Mp3Encoder) return w.lamejs

    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-lamejs-cdn="1"]') as HTMLScriptElement | null
      if (existing) {
        if ((window as any).lamejs?.Mp3Encoder) return resolve()
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Failed to load lamejs CDN script')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://unpkg.com/lamejs@1.2.1/lame.min.js'
      script.async = true
      script.dataset.lamejsCdn = '1'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load lamejs CDN script'))
      document.head.appendChild(script)
    })

    if (!(window as any).lamejs?.Mp3Encoder) {
      throw new Error('lamejs encoder not available after CDN load')
    }
    return (window as any).lamejs
  }

  const audioBufferToMp3 = async (buffer: AudioBuffer): Promise<Blob> => {
    const lamejs: any = await getBrowserLameEncoder()
    
    const channels = buffer.numberOfChannels
    const sampleRate = buffer.sampleRate
    const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128) // 128 kbps
    
    const samples = []
    for (let i = 0; i < channels; i++) {
      samples.push(buffer.getChannelData(i))
    }
    
    // Convertir Float32Array a Int16Array
    const convert = (data: Float32Array): Int16Array => {
      const int16 = new Int16Array(data.length)
      for (let i = 0; i < data.length; i++) {
        const s = Math.max(-1, Math.min(1, data[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
      }
      return int16
    }
    
    const mp3Data = []
    const sampleBlockSize = 1152 // Tamaño de bloque para MP3
    
    if (channels === 1) {
      // Mono
      const left = convert(samples[0])
      for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize)
        const mp3buf = mp3encoder.encodeBuffer(leftChunk)
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf)
        }
      }
    } else {
      // Stereo
      const left = convert(samples[0])
      const right = convert(samples[1])
      for (let i = 0; i < left.length; i += sampleBlockSize) {
        const leftChunk = left.subarray(i, i + sampleBlockSize)
        const rightChunk = right.subarray(i, i + sampleBlockSize)
        const mp3buf = mp3encoder.encodeBuffer(leftChunk, rightChunk)
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf)
        }
      }
    }
    
    // Flush final data
    const mp3buf = mp3encoder.flush()
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf)
    }
    
    return new Blob(mp3Data as any, { type: 'audio/mpeg' })
  }

  // Descargar como MP3
  const downloadAsMp3 = async () => {
    if (!audioBuffer) {
      alert('Por favor, carga un archivo de audio primero')
      return
    }

    setIsProcessing(true)
    try {
      console.log('🎵 Procesando audio para MP3...')
      // Pasar las bandas del EQ Pro si está activado
      const processedBuffer = await processAudioWithEQ(eqProEnabled ? eqProBands : undefined)

      console.log('🔄 Exportando MP3 en backend...')
      const wav = audioBufferToWav(processedBuffer)
      const wavBlob = new Blob([wav], { type: 'audio/wav' })
      const tempName = `${audioFile?.name.replace(/\.[^/.]+$/, '') || 'audio'}_eq_temp.wav`
      const tempFile = new File([wavBlob], tempName, { type: 'audio/wav' })

      const formData = new FormData()
      formData.append('file', tempFile)
      formData.append('tempo_percent', '100')
      formData.append('pitch_semitones', '0')
      formData.append('export_format', 'mp3')
      formData.append('filename', audioFile?.name.replace(/\.[^/.]+$/, '') || 'audio_eq')

      const response = await fetch('/api/export-audio', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => null as any)
        throw new Error(errorData?.details || errorData?.error || `Export failed: ${response.status}`)
      }

      const mp3Blob = await response.blob()
      const contentDisposition = response.headers.get('content-disposition') || ''
      const match = /filename=\"?([^\";]+)\"?/.exec(contentDisposition)
      const suggested = match?.[1]

      const url = URL.createObjectURL(mp3Blob)
      const a = document.createElement('a')
      a.href = url
      const eqMode = eqProEnabled ? 'EQPro' : 'EQBasic'
      a.download = suggested || `${audioFile?.name.replace(/\.[^/.]+$/, '')}_${eqMode}.mp3`
      a.click()
      URL.revokeObjectURL(url)
      console.log('✅ Audio descargado como MP3 (128 kbps) con todos los efectos aplicados')
    } catch (error) {
      console.error('❌ Error:', error)
      alert('Error al convertir a MP3.')
    } finally {
      setIsProcessing(false)
    }
  }

  // Limpiar al cerrar el modal
  React.useEffect(() => {
    return () => {
      stopAudio()
    }
  }, [])

  if (!embedded && !isOpen) return null

  return (
    <div className={embedded ? "w-full" : "fixed inset-0 z-[10000] flex items-center justify-center bg-black/80"}>
      {!embedded && <AdminModalLabel modalName="VolumeEQModal" />}
      <div className={embedded ? "h-[76vh] w-full overflow-y-auto rounded-[2.5rem] border border-white/10 bg-[#0f0f12] p-6 shadow-2xl" : "mx-4 w-full max-w-4xl max-h-[95vh] overflow-y-auto border-2 border-gray-700 bg-gray-900 p-6 shadow-2xl custom-scrollbar"}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Control de Volumen y Ecualización</h2>
          {!embedded && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Botón de Cargar Audio */}
        <div className="mb-6">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full py-3 font-bold text-sm transition-all duration-200 flex items-center justify-center space-x-2 border bg-gradient-to-br from-blue-500/40 via-blue-600/30 to-blue-700/20 hover:from-blue-500/50 text-white border-blue-400/40"
            style={{
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
            }}
          >
            <Upload className="w-5 h-5" />
            <span>{audioFile ? audioFile.name : 'Cargar Audio'}</span>
          </button>
        </div>

        {/* Controles de Reproducción + Toggle EQ Pro */}
        {audioBuffer && (
          <div className="flex gap-6 justify-center items-center mb-6">
            <button
              onClick={isPlaying ? pauseAudio : (audioContextRef.current?.state === 'suspended' ? resumeAudio : playAudio)}
              className="px-6 py-3 font-bold text-sm transition-all duration-200 flex items-center space-x-2 border bg-gradient-to-br from-blue-500/40 via-blue-600/30 to-blue-700/20 hover:from-blue-500/50 text-white border-blue-400/40"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 8px 20px rgba(37, 99, 235, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
              }}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>{isPlaying ? 'Pausar' : 'Play'}</span>
            </button>
            <button
              onClick={stopAudio}
              className="px-6 py-3 font-bold text-sm transition-all duration-200 flex items-center space-x-2 border bg-gradient-to-br from-red-500/40 via-red-600/30 to-red-700/20 hover:from-red-500/50 text-white border-red-400/40"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 8px 20px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
              }}
            >
              <Square className="w-5 h-5" />
              <span>Stop</span>
            </button>

            {/* Separator */}
            <div className="h-8 w-px bg-gray-600" />

            {/* Toggle EQ PRO */}
            <div className="flex items-center space-x-3 bg-gray-800/50 border border-gray-700 px-4 py-2 rounded-lg backdrop-blur-md">
              <span className={`text-sm font-medium transition-colors ${!eqProEnabled ? 'text-green-400' : 'text-gray-500'}`}>
                EQ BÁSICO
              </span>
              <button
                onClick={() => {
                  const newMode = !eqProEnabled
                  
                  // SIEMPRE detener reproducción al cambiar de modo
                  if (isPlaying) {
                    stopAudio()
                  }
                  
                  // Esperar a que se detenga antes de cambiar modo
                  setTimeout(() => {
                    setEqProEnabled(newMode)
                    console.log(newMode ? '🎛️ Modo EQ PRO activado' : '🎚️ Modo EQ BÁSICO activado')
                  }, 100)
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  eqProEnabled ? 'bg-purple-600' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-lg ${
                    eqProEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className={`text-sm font-medium transition-colors ${eqProEnabled ? 'text-purple-400' : 'text-gray-500'}`}>
                EQ PRO
              </span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex gap-8 items-start">
          {/* Left Section - Controles Básicos */}
          <div className="flex gap-10 items-center">
            {/* Master Volume */}
            <div>
              <DJKnob
                value={masterVolume}
                onChange={setMasterVolume}
                size={128}
                label="MASTER"
                isMuted={isMuted}
                onMuteToggle={toggleMute}
              />
            </div>

            {/* Separator Line */}
            <div className="h-52 w-px bg-gray-700" />

            {/* EQ Básico - Solo visible cuando EQ Pro está desactivado */}
            {!eqProEnabled && (
              <div className="flex gap-6">
                {/* Low EQ */}
                <div>
                  <DJKnob
                    value={lowEQ}
                    onChange={setLowEQ}
                    size={96}
                    label="BAJOS"
                  />
                </div>

                {/* Mid EQ */}
                <div>
                  <DJKnob
                    value={midEQ}
                    onChange={setMidEQ}
                    size={96}
                    label="MEDIOS"
                  />
                </div>

                {/* High EQ */}
                <div>
                  <DJKnob
                    value={highEQ}
                    onChange={setHighEQ}
                    size={96}
                    label="AGUDOS"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Section - EQ Profesional (WEQ8) */}
          {eqProEnabled && audioBuffer && (
            <div className="border-l-2 border-gray-700 pl-8 flex-1">
              <ProfessionalEQ
                audioBuffer={audioBuffer}
                masterVolume={masterVolume}
                isMuted={isMuted}
                isPlaying={isPlaying}
                shouldStop={shouldStopEQPro}
                onPlayStateChange={setIsPlaying}
                onStopComplete={handleEQProStopComplete}
                onBandsChange={setEqProBands}
              />
            </div>
          )}
        </div>

        {/* Botones de Descarga */}
        {audioBuffer && (
          <div className="flex gap-4 justify-center mt-8">
            <button
              onClick={downloadAsWav}
              className="px-8 py-3 font-bold text-sm transition-all duration-200 flex items-center space-x-2 border bg-gradient-to-br from-green-500/40 via-green-600/30 to-green-700/20 hover:from-green-500/50 text-white border-green-400/40"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 8px 20px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
              }}
            >
              <Download className="w-5 h-5" />
              <span>Descargar WAV</span>
            </button>
            <button
              onClick={downloadAsMp3}
              className="px-8 py-3 font-bold text-sm transition-all duration-200 flex items-center space-x-2 border bg-gradient-to-br from-purple-500/40 via-purple-600/30 to-purple-700/20 hover:from-purple-500/50 text-white border-purple-400/40"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 8px 20px rgba(168, 85, 247, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
              }}
            >
              <Download className="w-5 h-5" />
              <span>Descargar MP3</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default VolumeEQModal
