'use client'

import React from 'react'
import { Zap, Loader2, Sparkles, Search } from 'lucide-react'

interface SyncLoadingOverlayProps {
  isVisible: boolean
}

const SyncLoadingOverlay: React.FC<SyncLoadingOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-500">
      <div className="relative max-w-sm w-full mx-4 p-8 rounded-3xl bg-gradient-to-b from-gray-900 to-black border border-teal-500/30 shadow-[0_0_50px_rgba(20,184,166,0.2)] overflow-hidden">
        {/* Scanning Animation Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-teal-400 to-transparent animate-scan opacity-50" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className="relative">
            <div className="absolute inset-0 bg-teal-500/20 blur-xl rounded-full animate-pulse" />
            <div className="relative bg-gray-800 p-4 rounded-full border border-teal-500/50">
              <Sparkles className="w-10 h-10 text-teal-400 animate-bounce" />
            </div>
            <div className="absolute -top-2 -right-2">
              <Loader2 className="w-6 h-6 text-teal-300 animate-spin" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white tracking-tight uppercase">
              Sincronización <span className="text-teal-400">IA</span>
            </h3>
            <p className="text-gray-400 text-sm font-medium">
              Analizando transitorios, BPM y fase de la batería...
            </p>
          </div>

          {/* Progress Indicator - Fake but aesthetic */}
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
            <div className="h-full bg-gradient-to-r from-teal-600 via-teal-400 to-teal-600 animate-loading-bar" />
          </div>

          <div className="flex gap-4 text-[10px] font-bold text-teal-500/70 uppercase tracking-widest">
            <span className="flex items-center gap-1"><Search className="w-3 h-3" /> BPM</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> PHASE</span>
            <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> SYNC</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          50% { opacity: 0.5; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes loading-bar {
          0% { width: 0%; transform: translateX(-100%); }
          50% { width: 70%; transform: translateX(0%); }
          100% { width: 100%; transform: translateX(100%); }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
        .animate-loading-bar {
          animation: loading-bar 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}

export default SyncLoadingOverlay
