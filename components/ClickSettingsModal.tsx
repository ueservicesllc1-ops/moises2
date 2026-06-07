'use client'

import React, { useState, useEffect } from 'react'
import { X, Clock, Settings, RotateCcw, ChevronLeft, ChevronRight, Check, Magnet } from 'lucide-react'

interface ClickConfig {
  bpm?: number
  offsetMs?: number
  timeSignature?: '4/4' | '3/4' | '2/4' | '6/8'
  downbeatSec?: number
  isManual?: boolean
}

interface ClickSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  songTitle: string
  currentBpm: number
  currentTime: number
  initialConfig?: ClickConfig
  onSave: (config: ClickConfig) => void
  onSnap?: () => Promise<number | undefined>
}

const ClickSettingsModal: React.FC<ClickSettingsModalProps> = ({
  isOpen,
  onClose,
  songTitle,
  currentBpm,
  currentTime,
  initialConfig,
  onSave,
  onSnap
}) => {
  const [config, setConfig] = useState<ClickConfig>({
    bpm: currentBpm,
    offsetMs: 0,
    timeSignature: '4/4',
    downbeatSec: 0,
    isManual: false,
    ...initialConfig
  })

  useEffect(() => {
    if (isOpen) {
      setConfig({
        bpm: currentBpm,
        offsetMs: 0,
        timeSignature: '4/4',
        downbeatSec: 0,
        isManual: false,
        ...initialConfig
      })
    }
  }, [isOpen, initialConfig, currentBpm])

  if (!isOpen) return null

  const handleShift = (ms: number) => {
    setConfig(prev => ({ ...prev, offsetMs: (prev.offsetMs || 0) + ms }))
  }

  const handleSetDownbeat = () => {
    setConfig(prev => ({ 
      ...prev, 
      downbeatSec: currentTime,
      isManual: true 
    }))
  }

  const handleSave = () => {
    onSave(config)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-[#121212] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-900 to-black">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Settings className="w-5 h-5 text-teal-400" />
              Configuración de Click
            </h2>
            <p className="text-xs text-gray-400 mt-1 truncate max-w-[280px]">{songTitle}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          {/* 1. Downbeat Marker */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Alineación de Compás
            </label>
            <div className="bg-black/40 rounded-xl p-4 border border-gray-800/50 flex flex-col items-center gap-4">
              <div className="text-center">
                <div className="text-3xl font-mono font-bold text-teal-400 tracking-tighter">
                  {currentTime.toFixed(3)}s
                </div>
                <p className="text-[10px] text-gray-500 mt-1 italic">Posición actual del cursor</p>
              </div>
              <button
                onClick={handleSetDownbeat}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-lg ${
                  config.isManual 
                    ? 'bg-teal-500 text-black hover:bg-teal-400' 
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                {config.isManual && <Check className="w-4 h-4" />}
                Marcar como &quot;Tiempo 1&quot; (Downbeat)
              </button>
              
              {onSnap && (
                <button
                  onClick={async () => {
                    const snapped = await onSnap();
                    if (snapped !== undefined) {
                      setConfig(prev => ({ 
                        ...prev, 
                        downbeatSec: snapped,
                        isManual: true 
                      }));
                    }
                  }}
                  className="w-full py-2 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-500 hover:to-indigo-500 transition-all flex items-center justify-center gap-2 shadow-lg border border-white/10"
                >
                  <Magnet className="w-4 h-4" />
                  Ajustar al &quot;golpe&quot; más cercano (Snap)
                </button>
              )}
              {config.downbeatSec !== undefined && config.downbeatSec > 0 && (
                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                  <span>Anclado en: {config.downbeatSec.toFixed(3)}s</span>
                  <button 
                    onClick={() => setConfig(prev => ({ ...prev, downbeatSec: 0, isManual: false }))}
                    className="text-red-400 hover:underline ml-2"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 2. Offset Adjustment */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Ajuste Fino (Offset en ms)
            </label>
            <div className="flex items-center justify-between gap-4">
              <button 
                onClick={() => handleShift(-10)}
                className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              
              <div className="flex-1 text-center bg-black/60 py-3 rounded-xl border border-gray-800 font-mono text-xl font-bold text-white">
                {(config.offsetMs ?? 0) > 0 ? '+' : ''}{config.offsetMs ?? 0} ms
              </div>

              <button 
                onClick={() => handleShift(10)}
                className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-white transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={() => handleShift(-1)} className="text-[10px] px-2 py-1 bg-gray-900 rounded text-gray-400 hover:text-white">-1ms</button>
              <button onClick={() => setConfig(prev => ({ ...prev, offsetMs: 0 }))} className="text-[10px] px-2 py-1 bg-gray-900 rounded text-gray-400 hover:text-white flex items-center gap-1">
                <RotateCcw className="w-2.5 h-2.5" /> Reset
              </button>
              <button onClick={() => handleShift(1)} className="text-[10px] px-2 py-1 bg-gray-900 rounded text-gray-400 hover:text-white">+1ms</button>
            </div>
          </div>

          {/* 3. Time Signature */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Armadura de Compás
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['4/4', '3/4', '2/4', '6/8'] as const).map((sig) => (
                <button
                  key={sig}
                  onClick={() => setConfig(prev => ({ ...prev, timeSignature: sig }))}
                  className={`py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                    config.timeSignature === sig 
                      ? 'bg-teal-500 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' 
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  {sig}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-black/40 border-t border-gray-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-bold transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-[2] py-3 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-black font-bold shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2"
          >
            Aplicar y Sincronizar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ClickSettingsModal
