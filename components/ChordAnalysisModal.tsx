'use client'

import React, { useState, useRef, useEffect } from 'react'
import { X, Upload, Music2, Loader2, Play, Pause, RotateCcw } from 'lucide-react'
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
  const [detectedKey, setDetectedKey] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Manejar audio y tiempo
  useEffect(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl)
      audioRef.current = audio
      
      const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
      const handleLoadedMetadata = () => setDuration(audio.duration)
      const handleEnded = () => setIsPlaying(false)
      
      audio.addEventListener('timeupdate', handleTimeUpdate)
      audio.addEventListener('loadedmetadata', handleLoadedMetadata)
      audio.addEventListener('ended', handleEnded)
      
      return () => {
        audio.removeEventListener('timeupdate', handleTimeUpdate)
        audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
        audio.removeEventListener('ended', handleEnded)
        audio.pause()
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [audioUrl])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleChordClick = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
      if (!isPlaying) {
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  // Análisis de acordes usando el backend
  const analyzeChords = async (file: File) => {
    if (!isPremium) {
      throw new Error("PRO Feature: Chord analysis requires a PRO account.")
    }
    console.log('🎸 Enviando al backend para análisis de acordes...')
    
    try {
      // Paso 1: Subir archivo al backend
      const formData = new FormData()
      formData.append('file', file)
      
      const uploadResponse = await fetch('/api/analyze-chords', {
        method: 'POST',
        body: formData
      })
      
      if (!uploadResponse.ok) {
        throw new Error('Error al subir archivo al backend')
      }
      
      const uploadData = await uploadResponse.json()
      const taskId = uploadData.task_id
      console.log('✅ Archivo subido, task ID:', taskId)
      
      // Paso 2: Polling para obtener resultados
      let attempts = 0
      const maxAttempts = 60 // 60 segundos máximo
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)) // Esperar 1 segundo
        
        const statusResponse = await fetch(`/api/chord-analysis/${taskId}`)
        const statusData = await statusResponse.json()
        
        console.log(`Intento ${attempts + 1}: Status =`, statusData.status, `Progress =`, statusData.progress)
        
        if (statusData.status === 'completed') {
          console.log('✅ Análisis completado!')
          
          // Convertir formato del backend al formato del componente
          const detectedChords: ChordInfo[] = (statusData.chords || []).map((c: any) => ({
            time: c.start_time,
            endTime: c.end_time,
            chord: c.chord,
            confidence: c.confidence
          }))
          
          return {
            chords: detectedChords,
            key: statusData.key?.key || 'Unknown'
          }
        }
        
        if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Análisis falló')
        }
        
        attempts++
      }
      
      throw new Error('Timeout: El análisis tardó demasiado')
      
    } catch (error) {
      console.error('❌ Error en análisis de acordes:', error)
      throw error
    }
  }

  // Cargar y analizar archivo
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setAudioFile(file)
    setAudioUrl(URL.createObjectURL(file))
    setIsAnalyzing(true)
    setChords([])
    setDetectedKey(null)
    setIsPlaying(false)
    setCurrentTime(0)

    try {
      console.log('📁 Cargando archivo:', file.name)
      
      // Analizar acordes con el backend
      const result = await analyzeChords(file)
      setChords(result.chords)
      setDetectedKey(result.key)
      
      console.log(`✅ ${result.chords.length} acordes detectados, tonalidad: ${result.key}`)
      
    } catch (error) {
      console.error('❌ Error analizando acordes:', error)
      alert('Error al analizar el archivo de audio: ' + (error instanceof Error ? error.message : 'Error desconocido'))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000]">
      <AdminModalLabel modalName="ChordAnalysisModal" />
      <div className="bg-gray-900 border-2 border-gray-700 rounded-lg p-8 max-w-4xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Music2 className="w-8 h-8 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Análisis de Acordes</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Botón de Cargar Audio */}
        <div className="mb-8">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="w-full py-4 font-bold text-base transition-all duration-200 flex items-center justify-center space-x-3 border bg-gradient-to-br from-blue-500/40 via-blue-600/30 to-blue-700/20 hover:from-blue-500/50 text-white border-blue-400/40 rounded-lg"
            style={{
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
            }}
          >
            <Upload className="w-6 h-6" />
            <span>{audioFile ? audioFile.name : 'Cargar Audio para Analizar Acordes'}</span>
          </button>
        </div>

        {/* Estado de Análisis */}
        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-16 h-16 text-blue-500 animate-spin mb-4" />
            <p className="text-white text-lg font-semibold">Analizando acordes...</p>
            <p className="text-gray-400 text-sm mt-2">Esto puede tomar unos segundos</p>
          </div>
        )}

        {/* Resultados */}
        {!isAnalyzing && (chords.length > 0 || detectedKey) && (
          <div className="space-y-6">
            
            {/* Reproductor de Audio */}
            {audioUrl && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center space-x-4 shadow-lg">
                <button
                  onClick={togglePlay}
                  className="w-12 h-12 flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center transition-all shadow-lg"
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
                </button>
                
                <div className="flex-1 flex flex-col space-y-1">
                  <div className="flex justify-between text-xs text-gray-400 font-mono">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
                
                <button
                  onClick={() => { if(audioRef.current) audioRef.current.currentTime = 0; setCurrentTime(0); }}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                  title="Reiniciar"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Tonalidad Detectada */}
            {/* Tonalidad Detectada */}
            {detectedKey && (
              <div className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-2 border-blue-500/50 rounded-lg p-6 text-center">
                <p className="text-gray-400 text-sm mb-2">Tonalidad Principal</p>
                <div className="text-5xl font-bold text-white mb-2"
                  style={{
                    textShadow: '0 0 20px rgba(59, 130, 246, 0.5)'
                  }}
                >
                  {detectedKey}
                </div>
                <p className="text-gray-400 text-xs">Acorde más frecuente</p>
              </div>
            )}

            {/* Lista de Acordes */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-white font-bold text-lg mb-4">Progresión de Acordes</h3>
              
              {chords.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {chords.map((chord, index) => {
                    const isActive = currentTime >= chord.time && (index === chords.length - 1 || currentTime < chords[index + 1].time)
                    
                    return (
                      <div
                        key={index}
                        onClick={() => handleChordClick(chord.time)}
                        className={`bg-gradient-to-br border rounded-lg p-3 transition-all cursor-pointer ${
                          isActive 
                            ? 'from-blue-600/40 to-blue-900/40 border-blue-400 scale-105 shadow-[0_0_15px_rgba(59,130,246,0.5)] z-10' 
                            : 'from-gray-700/50 to-gray-800/50 border-gray-600 hover:border-gray-500'
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <span className={`text-xs mb-1 ${isActive ? 'text-blue-300 font-bold' : 'text-gray-400'}`}>
                            {formatTime(chord.time)}
                          </span>
                          <span className={`text-xl font-bold ${isActive ? 'text-white' : 'text-gray-200'}`}>
                            {chord.chord}
                          </span>
                          <div className="w-full bg-gray-900 rounded-full h-1 mt-2">
                            <div 
                              className={`h-1 rounded-full transition-all ${isActive ? 'bg-blue-300' : 'bg-blue-500/50'}`}
                              style={{ width: `${chord.confidence * 100}%` }}
                            />
                          </div>
                          <span className="text-gray-500 text-[10px] mt-1">{(chord.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-12 border-2 border-dashed border-gray-700 rounded-lg text-center">
                  <p className="text-gray-500 italic">No se detectaron cambios de acordes claros en esta pieza.</p>
                </div>
              )}
            </div>

            {/* Botón para analizar otro archivo */}
            <button
              onClick={() => {
                setChords([])
                setDetectedKey(null)
                setAudioFile(null)
                fileInputRef.current?.click()
              }}
              className="w-full py-3 font-bold text-sm transition-all duration-200 flex items-center justify-center space-x-2 border bg-gradient-to-br from-gray-700/40 via-gray-800/30 to-gray-900/20 hover:from-gray-700/50 text-white border-gray-600/40 rounded-lg"
            >
              <Upload className="w-5 h-5" />
              <span>Analizar Otro Archivo</span>
            </button>
          </div>
        )}

        {/* Mensaje inicial */}
        {!isAnalyzing && chords.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Music2 className="w-20 h-20 text-blue-500/50 mb-4" />
            <p className="text-gray-400 text-lg">Carga un archivo de audio para detectar acordes</p>
            <p className="text-gray-500 text-sm mt-2">El análisis identifica la progresión de acordes automáticamente</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChordAnalysisModal

