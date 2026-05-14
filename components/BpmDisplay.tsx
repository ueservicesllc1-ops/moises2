'use client'
import React from 'react'

interface BpmDisplayProps {
  songId?: string
  originalUrl?: string
  headerBpm?: number
  headerKey?: string
  /** Cabecera del mezclador: menos padding y tipografía más pequeña */
  compact?: boolean
}

const BpmDisplay: React.FC<BpmDisplayProps> = ({
  headerBpm,
  headerKey,
  compact = false,
}) => {
  const lab = compact
    ? 'text-[10px] font-mono text-white/90 md:text-xs'
    : 'text-sm font-mono text-white md:text-base'
  const box = compact
    ? 'font-mono font-bold tracking-wider px-2 py-0.5 text-sm md:px-2.5 md:py-1 md:text-base'
    : 'font-mono text-lg font-bold tracking-wider px-4 py-2 md:text-xl md:px-5 md:py-2.5'

  return (
    <div
      className={`flex flex-wrap items-center ${compact ? 'gap-x-2 gap-y-1 md:gap-x-3' : 'gap-x-4 gap-y-2'}`}
    >
      {/* BPM Display */}
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        <span className={lab}>BPM:</span>
        <div className={`bg-black shadow-lg ${compact ? 'p-0.5' : 'p-1'}`}>
          {headerBpm ? (
            <div className={`bg-gray-800 text-gray-200 ${box}`}>
              {headerBpm % 1 === 0 ? headerBpm.toFixed(0) : headerBpm.toFixed(1)}
            </div>
          ) : (
            <div className={`bg-gray-900 text-gray-500 ${box}`}>-</div>
          )}
        </div>
      </div>

      {/* Key Display */}
      <div className={`flex items-center ${compact ? 'gap-1' : 'gap-2'}`}>
        <span className={lab}>KEY:</span>
        <div className={`bg-black shadow-lg ${compact ? 'p-0.5' : 'p-1'}`}>
          {headerKey ? (
            <div className={`bg-gray-700 text-gray-100 ${box}`}>{headerKey}</div>
          ) : (
            <div className={`bg-gray-900 text-gray-500 ${box}`}>-</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BpmDisplay
