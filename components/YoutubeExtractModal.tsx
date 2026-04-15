'use client'

import React, { useState } from 'react'
import { X, Youtube, Download, Loader2, Music2 } from 'lucide-react'
import AdminModalLabel from './AdminModalLabel'

interface YoutubeExtractModalProps {
  isOpen: boolean
  onClose: () => void
  onSeparateTrack?: (file: File) => void
  isPremium: boolean
}

const YoutubeExtractModal: React.FC<YoutubeExtractModalProps> = ({ 
  isOpen, 
  onClose,
  onSeparateTrack,
  isPremium
}) => {
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractedAudio, setExtractedAudio] = useState<File | null>(null)
  const [videoTitle, setVideoTitle] = useState('')
  const [error, setError] = useState('')

  // Validar URL de YouTube
  const isValidYoutubeUrl = (url: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
    return youtubeRegex.test(url)
  }

  // Extraer audio de YouTube
  const handleExtract = async () => {
    if (!youtubeUrl.trim()) {
      setError('Por favor ingresa una URL de YouTube')
      return
    }

    if (!isValidYoutubeUrl(youtubeUrl)) {
      setError('URL de YouTube inválida')
      return
    }

    if (!isPremium) {
      setError('⭐️ La extracción de audio por YouTube es exclusiva para PRO Bro.')
      return
    }

    setIsExtracting(true)
    setError('')

    try {
      console.log('🎬 Extrayendo audio de YouTube:', youtubeUrl)

      // Llamar al backend para extraer audio
      const response = await fetch('/api/youtube-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }))
        console.error('❌ Error del servidor:', errorData)
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('✅ Respuesta del servidor:', data)
      
      if (!data.success) {
        throw new Error(data.error || 'Error al extraer audio')
      }
      
      console.log('✅ Audio extraído:', data.title)

      if (!data.audioData) {
        throw new Error('No se recibieron datos de audio')
      }

      // Convertir base64 a Blob
      const binaryString = atob(data.audioData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' })
      
      // Crear archivo
      const fileName = `${data.title}.mp3`.replace(/[<>:"/\\|?*]/g, '_') // Limpiar nombre
      const audioFile = new File([audioBlob], fileName, { type: 'audio/mpeg' })

      setExtractedAudio(audioFile)
      setVideoTitle(data.title)
      console.log('✅ Audio listo para descargar o procesar')
      console.log('   Nombre:', fileName)
      console.log('   Tamaño:', (audioFile.size / 1024 / 1024).toFixed(2), 'MB')
      console.log('   Duración:', Math.floor(data.duration / 60), 'min', data.duration % 60, 'seg')

    } catch (err: any) {
      console.error('❌ Error:', err)
      setError(err.message || 'Error al extraer audio de YouTube')
    } finally {
      setIsExtracting(false)
    }
  }

  // Descargar el audio extraído
  const handleDownload = () => {
    if (!extractedAudio) return

    const url = URL.createObjectURL(extractedAudio)
    const a = document.createElement('a')
    a.href = url
    a.download = extractedAudio.name
    a.click()
    URL.revokeObjectURL(url)
    console.log('✅ Audio descargado:', extractedAudio.name)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-2 md:p-4">
      <AdminModalLabel modalName="YoutubeExtractModal" />
      <div className="bg-gray-900 border-2 border-gray-700 rounded-lg p-4 md:p-8 max-w-2xl w-full mx-0 md:mx-4 shadow-2xl h-[100dvh] md:h-auto overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Youtube className="w-8 h-8 text-red-500" />
            <h2 className="text-2xl font-bold text-white">Extraer Audio de YouTube</h2>
          </div>
          <button
            onClick={onClose}
            className="mobile-touch-target text-gray-400 hover:text-white transition-colors inline-flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Input de URL */}
        <div className="mb-6">
          <label className="block text-white font-semibold mb-2">URL del Video</label>
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => {
              setYoutubeUrl(e.target.value)
              setError('')
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="mobile-touch-target w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            disabled={isExtracting}
          />
          {error && (
            <p className="text-red-400 text-sm mt-2">{error}</p>
          )}
        </div>

        {/* Botón de Extraer */}
        {!extractedAudio && (
          <>
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="mobile-touch-target w-full py-4 font-bold text-base transition-all duration-200 flex items-center justify-center space-x-3 border bg-gradient-to-br from-red-500/40 via-red-600/30 to-red-700/20 hover:from-red-500/50 text-white border-red-400/40 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
              }}
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span>Extrayendo Audio...</span>
                </>
              ) : (
                <>
                  <Youtube className="w-6 h-6" />
                  <span>Extraer Audio</span>
                </>
              )}
            </button>
            
            {/* Mensaje de espera cuando está extrayendo */}
            {isExtracting && (
              <div className="mt-4 space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                  <p className="text-blue-400 text-sm">⏱️ La extracción de audio puede tardar unos minutos...</p>
                  <p className="text-gray-400 text-xs mt-2">Estamos procesando tu pedido, bro 💪</p>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
                  <p className="text-yellow-400 text-xs">
                    ⚠️ Ten paciencia, YouTube limita la velocidad de descarga
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Resultado - Audio Extraído */}
        {extractedAudio && (
          <div className="space-y-6">
            {/* Info del video */}
            <div className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border-2 border-red-500/50 rounded-lg p-6">
              <div className="flex items-center space-x-3 mb-3">
                <Youtube className="w-6 h-6 text-red-500" />
                <h3 className="text-white font-bold text-lg">Audio Extraído</h3>
              </div>
              <p className="text-white text-base">{videoTitle}</p>
              <p className="text-gray-400 text-sm mt-2">
                Tamaño: {(extractedAudio.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>

            {/* Opciones */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Descargar */}
              <button
                onClick={handleDownload}
                className="mobile-touch-target py-6 px-6 font-bold text-base transition-all duration-200 flex flex-col items-center justify-center space-y-3 border bg-gradient-to-br from-green-500/40 via-green-600/30 to-green-700/20 hover:from-green-500/50 text-white border-green-400/40 rounded-lg"
                style={{
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  boxShadow: '0 8px 20px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
                }}
              >
                <Download className="w-8 h-8" />
                <span>Descargar Audio</span>
                <span className="text-xs text-green-200">MP3 en tu PC</span>
              </button>

              {/* Separar Track */}
              <button
                onClick={() => {
                  if (onSeparateTrack && extractedAudio) {
                    onSeparateTrack(extractedAudio)
                    onClose()
                  }
                }}
                className="mobile-touch-target py-6 px-6 font-bold text-base transition-all duration-200 flex flex-col items-center justify-center space-y-3 border bg-gradient-to-br from-blue-500/40 via-blue-600/30 to-blue-700/20 hover:from-blue-500/50 text-white border-blue-400/40 rounded-lg"
                style={{
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                  boxShadow: '0 8px 20px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 0 rgba(0,0,0,0.2)'
                }}
              >
                <Music2 className="w-8 h-8" />
                <span>Separar Track</span>
                <span className="text-xs text-blue-200">Extraer stems con IA</span>
              </button>
            </div>

            {/* Botón para extraer otro */}
            <button
              onClick={() => {
                setExtractedAudio(null)
                setVideoTitle('')
                setYoutubeUrl('')
              }}
              className="mobile-touch-target w-full py-3 font-bold text-sm transition-all duration-200 flex items-center justify-center space-x-2 border bg-gradient-to-br from-gray-700/40 via-gray-800/30 to-gray-900/20 hover:from-gray-700/50 text-white border-gray-600/40 rounded-lg"
            >
              <Youtube className="w-5 h-5" />
              <span>Extraer Otro Video</span>
            </button>
          </div>
        )}

        {/* Mensaje inicial */}
        {!isExtracting && !extractedAudio && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Youtube className="w-20 h-20 text-red-500/50 mb-4" />
            <p className="text-gray-400 text-base">Pega la URL de un video de YouTube</p>
            <p className="text-gray-500 text-sm mt-2">Extrae el audio y descárgalo o separa sus tracks</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default YoutubeExtractModal

