/**
 * WaveSurferPlayer - Componente reproductor de audio con visualización de ondas
 * Integra WaveSurfer.js para una mejor experiencia de usuario
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward } from 'lucide-react';
import './WaveSurferStyles.css';

interface WaveSurferPlayerProps {
  src: string;
  title: string;
  artist: string;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  height?: number;
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  barWidth?: number;
  barGap?: number;
  responsive?: boolean;
}

const WaveSurferPlayer: React.FC<WaveSurferPlayerProps> = ({
  src,
  title,
  artist,
  isPlaying,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  height = 60,
  waveColor = '#3b82f6',
  progressColor = '#1d4ed8',
  cursorColor = '#1e40af',
  barWidth = 2,
  barGap = 1,
  responsive = true
}) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Cargar WaveSurfer.js dinámicamente
  useEffect(() => {
    const loadWaveSurfer = async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        
        if (waveformRef.current && src) {
          // Crear instancia de WaveSurfer con configuraciones más realistas
          wavesurferRef.current = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: waveColor,
            progressColor: progressColor,
            cursorColor: cursorColor,
            barWidth: barWidth,
            barGap: barGap,
            barRadius: 2,
            height: height,
            normalize: true,
            backend: 'WebAudio',
            mediaControls: false,
            // Configuraciones para ondas más realistas
            fillParent: true,
            minPxPerSec: 1,
            hideScrollbar: true,
            audioRate: 1,
            dragToSeek: true
          });

          // Event listeners
          wavesurferRef.current.on('ready', () => {
            setIsLoading(false);
            setDuration(wavesurferRef.current.getDuration());
          });

          wavesurferRef.current.on('audioprocess', (time: number) => {
            setCurrentTime(time);
          });

          wavesurferRef.current.on('seek', (progress: number) => {
            const time = progress * duration;
            setCurrentTime(time);
          });

          wavesurferRef.current.on('finish', () => {
            onPause();
          });

          // Cargar el archivo de audio
          wavesurferRef.current.load(src);
        }
      } catch (error) {
        console.error('Error loading WaveSurfer:', error);
        setIsLoading(false);
      }
    };

    loadWaveSurfer();

    // Cleanup
    return () => {
      if (wavesurferRef.current) {
        wavesurferRef.current.destroy();
      }
    };
  }, [src, waveColor, progressColor, cursorColor, barWidth, barGap, height, responsive, onPause]);

  // Controlar reproducción
  useEffect(() => {
    if (wavesurferRef.current) {
      if (isPlaying) {
        wavesurferRef.current.play();
      } else {
        wavesurferRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Controlar volumen
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(isMuted ? 0 : volume);
    }
  }, [volume, isMuted]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (wavesurferRef.current && duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const progress = x / rect.width;
      const time = progress * duration;
      
      wavesurferRef.current.seekTo(progress);
      setCurrentTime(time);
    }
  }, [duration]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4">
      <div className="flex items-center space-x-4">
        {/* Información de la canción */}
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-medium truncate">
            {title}
          </div>
          <div className="text-gray-400 text-xs truncate">
            {artist}
          </div>
        </div>

        {/* Controles de reproducción */}
        <div className="flex items-center space-x-2">
          <button
            onClick={onPrevious}
            disabled={!onPrevious}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button
            onClick={handlePlayPause}
            className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          
          <button
            onClick={onNext}
            disabled={!onNext}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Waveform y barra de progreso */}
        <div className="flex-1 max-w-md">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400 text-xs w-8">
              {formatTime(currentTime)}
            </span>
            <div 
              ref={waveformRef}
              className="flex-1 h-12 bg-gray-700 rounded cursor-pointer wavesurfer-container"
              onClick={handleSeek}
              style={{ minHeight: `${height}px` }}
            />
            <span className="text-gray-400 text-xs w-8">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Control de volumen */}
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMute}
            className="p-2 text-gray-400 hover:text-white"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};

export default WaveSurferPlayer;
