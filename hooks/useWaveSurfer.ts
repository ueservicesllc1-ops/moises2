/**
 * useWaveSurfer - Hook personalizado para manejar WaveSurfer.js
 */

import { useRef, useEffect, useState, useCallback } from 'react';

interface WaveSurferOptions {
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  barWidth?: number;
  barGap?: number;
  height?: number;
  responsive?: boolean;
  normalize?: boolean;
  backend?: string;
  mediaControls?: boolean;
  interact?: boolean;
}

interface UseWaveSurferReturn {
  waveformRef: React.RefObject<HTMLDivElement>;
  wavesurfer: any;
  isLoading: boolean;
  isReady: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  seekTo: (progress: number) => void;
  destroy: () => void;
}

export const useWaveSurfer = (
  src: string,
  options: WaveSurferOptions = {}
): UseWaveSurferReturn => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  // Cargar WaveSurfer.js dinámicamente
  useEffect(() => {
    const loadWaveSurfer = async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        
        if (waveformRef.current && src) {
          // Crear instancia de WaveSurfer con configuraciones más realistas
          wavesurferRef.current = WaveSurfer.create({
            container: waveformRef.current,
            waveColor: options.waveColor || '#3b82f6',
            progressColor: options.progressColor || '#1d4ed8',
            cursorColor: options.cursorColor || '#1e40af',
            barWidth: options.barWidth || 1,
            barGap: options.barGap || 0.5,
            barRadius: 2,
            height: options.height || 60,
            normalize: options.normalize !== false,
            backend: (options.backend as 'WebAudio' | 'MediaElement') || 'WebAudio',
            mediaControls: options.mediaControls || false,
            interact: options.interact !== false,
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
            setIsReady(true);
            setDuration(wavesurferRef.current.getDuration());
          });

          wavesurferRef.current.on('audioprocess', (time: number) => {
            setCurrentTime(time);
          });

          wavesurferRef.current.on('seek', (progress: number) => {
            const time = progress * duration;
            setCurrentTime(time);
          });

          wavesurferRef.current.on('play', () => {
            setIsPlaying(true);
          });

          wavesurferRef.current.on('pause', () => {
            setIsPlaying(false);
          });

          wavesurferRef.current.on('finish', () => {
            setIsPlaying(false);
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
  }, [src, options]);

  const play = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.play();
    }
  }, [isReady]);

  const pause = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.pause();
    }
  }, [isReady]);

  const stop = useCallback(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.stop();
    }
  }, [isReady]);

  const setVolume = useCallback((newVolume: number) => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.setVolume(newVolume);
      setVolumeState(newVolume);
    }
  }, [isReady]);

  const seekTo = useCallback((progress: number) => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.seekTo(progress);
    }
  }, [isReady]);

  const destroy = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
  }, []);

  return {
    waveformRef,
    wavesurfer: wavesurferRef.current,
    isLoading,
    isReady,
    duration,
    currentTime,
    volume,
    isPlaying,
    play,
    pause,
    stop,
    setVolume,
    seekTo,
    destroy
  };
};
