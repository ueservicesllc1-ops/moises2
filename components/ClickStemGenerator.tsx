'use client'
import React, { useState, useEffect, useRef } from 'react'
import { Download, Music } from 'lucide-react'
import { updateSongBpm } from '@/lib/firestore'

interface ClickStemGeneratorProps {
  songTitle: string
  songId?: string
  originalUrl?: string
  bpm?: number
  duration?: number
  accentOffset?: number
  onBpmUpdate?: (newBpm: number) => void
  onGeneratingChange?: (isGenerating: boolean) => void
  onAccentOffsetChange?: (offset: number) => void
  isPlaying?: boolean
  onGenerate?: (blob: Blob) => void
}

const ClickStemGenerator: React.FC<ClickStemGeneratorProps> = ({ 
  songTitle,
  songId,
  originalUrl,
  bpm,
  duration,
  accentOffset = 0,
  onBpmUpdate,
  onGeneratingChange,
  onAccentOffsetChange,
  isPlaying = false,
  onGenerate
}) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioData, setAudioData] = useState<{
    bpm: number
    duration: number
    offset: number
  } | null>(null)
  
  // Web Audio API para click en tiempo real
  const audioCtxRef = useRef<AudioContext | null>(null)
  const intervalRef = useRef<number | null>(null)

  // Limpiar estado cuando cambie la canción
  useEffect(() => {
    if (originalUrl) {
      console.log('🔄 Nueva canción detectada, limpiando estado...')
      setAudioData(null)
      stopClick()
    }
  }, [originalUrl])

  // Función para reproducir click
  const playClick = (accent = false) => {
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
    const ctx = audioCtxRef.current

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "square"
    osc.frequency.value = accent ? 1000 : 700 // acento más agudo
    gain.gain.value = 0.2

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start()
    osc.stop(ctx.currentTime + 0.05) // click muy corto
  }

  // Función para iniciar click
  const startClick = () => {
    if (!audioData || intervalRef.current) return

    let beat = 0
    const interval = (60 / audioData.bpm) * 1000 // ms por beat
    const currentOffsetValue = accentOffset || 0

    // Primer click con acento si el offset está en beat 0
    const firstBeatWithOffset = (beat + currentOffsetValue + 4) % 4
    playClick(firstBeatWithOffset === 0)

    intervalRef.current = setInterval(() => {
      beat = (beat + 1) % 4
      const beatWithOffset = (beat + currentOffsetValue + 4) % 4
      playClick(beatWithOffset === 0)
    }, interval) as unknown as number
  }

  // Función para detener click
  const stopClick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  // Sincronizar con el estado de reproducción
  useEffect(() => {
    if (isPlaying && audioData) {
      startClick()
    } else {
      stopClick()
    }
  }, [isPlaying, audioData, accentOffset])

  // Cleanup
  useEffect(() => {
    return () => stopClick()
  }, [])

  // Analizar audio automáticamente cuando se monte el componente
  useEffect(() => {
    console.log('🔄 useEffect[originalUrl] ejecutado:', { originalUrl, audioData, isGenerating })
    if (originalUrl && !isGenerating) {
      console.log('🚀 Condiciones cumplidas, iniciando análisis completo...')
      handleAnalyzeAudio()
    } else {
      console.log('⏸️ Condiciones no cumplidas para análisis')
    }
  }, [originalUrl, isGenerating])

  // Solo metrónomo en vivo - NO generar archivos

  const handleAnalyzeAudio = async () => {
    if (!originalUrl) {
      console.log('❌ No hay originalUrl disponible')
      return
    }

    console.log('🎵 Iniciando análisis completo de audio:', originalUrl)
    setIsGenerating(true)
    if (onGeneratingChange) {
      onGeneratingChange(true)
    }
    try {
      // Descargar el archivo original de la canción
      console.log('📥 Descargando archivo de audio...')
      const response = await fetch(originalUrl)
      const blob = await response.blob()
      const file = new File([blob], 'song.mp3', { type: 'audio/mpeg' })
      console.log('📁 Archivo descargado, tamaño:', blob.size, 'bytes')

      const formData = new FormData()
      formData.append('file', file)

      console.log('🚀 Enviando a backend para análisis completo...')
      const analyzeResponse = await fetch('/api/analyze-audio', {
        method: 'POST',
        body: formData,
      })

      console.log('📊 Respuesta del backend:', analyzeResponse.status)
      const data = await analyzeResponse.json()
      console.log('📋 Datos recibidos:', data)
      
      if (data.success) {
        // Redondear BPM a entero
        const roundedBpm = Math.round(data.bpm)
        console.log('BPM analizado:', data.bpm, '→ redondeado:', roundedBpm)
        setAudioData({
          bpm: roundedBpm,
          duration: data.duration,
          offset: data.offset
        })
        
        // Notificar el nuevo BPM al componente padre (siempre)
        if (onBpmUpdate) {
          console.log('Actualizando BPM del header:', bpm, '→', roundedBpm)
          onBpmUpdate(roundedBpm)
        }
        
        // Actualizar BPM en Firestore si tenemos songId (siempre)
        if (songId) {
          try {
            console.log('Guardando BPM analizado en Firestore...')
            await updateSongBpm(songId, roundedBpm)
            console.log('BPM guardado permanentemente en Firestore')
          } catch (error) {
            console.error('Error guardando BPM en Firestore:', error)
          }
        }
        
        console.log('✅ Audio analizado exitosamente:', data)
      } else {
        console.error('❌ Error analizando audio:', data.error)
        // Fallback a datos del header si el análisis falla
        if (bpm && duration) {
          setAudioData({
            bpm: bpm,
            duration: duration,
            offset: 0.1
          })
        }
      }
    } catch (error) {
      console.error('💥 Error en análisis de audio:', error)
      // Fallback a datos del header si hay error
      if (bpm && duration) {
        setAudioData({
          bpm: bpm,
          duration: duration,
          offset: 0.1
        })
      }
    } finally {
      setIsGenerating(false)
      if (onGeneratingChange) {
        onGeneratingChange(false)
      }
    }
  }


  // Mostrar controles de offset del acento
  return (
    <div className="bg-gray-800 p-4 rounded border border-gray-600">
      <h3 className="text-white text-lg font-semibold mb-4">Click Track</h3>
      
      {/* Offset control */}
      <div className="flex gap-2 items-center justify-center mb-4">
        <button
          onClick={() => {
            const newOffset = (accentOffset || 0) - 1
            if (onAccentOffsetChange) {
              onAccentOffsetChange(newOffset)
            }
          }}
          className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
        >
          -
        </button>
        <span className="text-white font-mono">Offset: {accentOffset || 0}</span>
        <button
          onClick={() => {
            const newOffset = (accentOffset || 0) + 1
            if (onAccentOffsetChange) {
              onAccentOffsetChange(newOffset)
            }
          }}
          className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded"
        >
          +
        </button>
      </div>

      {/* Info */}
      <div className="text-center text-xs text-gray-400">
        Metrónomo en vivo • Se reproduce automáticamente con los tracks • Beat 1 = Acento (rojo)
      </div>
    </div>
  )
}

export default ClickStemGenerator
