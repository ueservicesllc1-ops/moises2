/**
 * WaveSurferEditor - Editor de audio con visualización de ondas para múltiples pistas
 * Integra WaveSurfer.js para edición profesional de audio
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  SkipBack, 
  SkipForward,
  RotateCcw,
  Lock,
  Unlock
} from 'lucide-react';
import './WaveSurferStyles.css';

interface TrackData {
  id: string;
  name: string;
  src: string;
  color: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
}

interface WaveSurferEditorProps {
  tracks: TrackData[];
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onTrackUpdate: (trackId: string, updates: Partial<TrackData>) => void;
  onSeek: (time: number) => void;
  currentTime: number;
  duration: number;
}

const WaveSurferEditor: React.FC<WaveSurferEditorProps> = ({
  tracks,
  isPlaying,
  onPlay,
  onPause,
  onTrackUpdate,
  onSeek,
  currentTime,
  duration
}) => {
  const waveformRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const wavesurferRefs = useRef<Map<string, any>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [loadedTracks, setLoadedTracks] = useState<Set<string>>(new Set());

  // Cargar WaveSurfer.js dinámicamente
  useEffect(() => {
    const loadWaveSurfer = async () => {
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        
        // Crear instancias de WaveSurfer para cada pista
        for (const track of tracks) {
          const container = waveformRefs.current.get(track.id);
          if (container && track.src) {
            const wavesurfer = WaveSurfer.create({
              container: container,
              waveColor: track.color,
              progressColor: track.color,
              cursorColor: '#ffffff',
              barWidth: 1,
              barGap: 0.5,
              barRadius: 2,
              height: 60,
              normalize: true,
              backend: 'WebAudio',
              mediaControls: false,
              interact: true,
              // Configuraciones para ondas más realistas
              fillParent: true,
              minPxPerSec: 1,
              hideScrollbar: true,
              audioRate: 1,
              dragToSeek: true
            });

            // Event listeners
            wavesurfer.on('ready', () => {
              setLoadedTracks(prev => {
                const newSet = new Set(prev);
                newSet.add(track.id);
                return newSet;
              });
              if (loadedTracks.size === tracks.length - 1) {
                setIsLoading(false);
              }
            });

            wavesurfer.on('interaction', () => {
              const currentTime = wavesurfer.getCurrentTime();
              onSeek(currentTime);
            });

            wavesurfer.on('audioprocess', (time: number) => {
              // Sincronizar todas las pistas
              const progress = duration > 0 ? time / duration : 0;
              wavesurferRefs.current.forEach((ws, id) => {
                if (id !== track.id) {
                  ws.seekTo(progress);
                }
              });
            });

            wavesurfer.on('finish', () => {
              onPause();
            });

            // Cargar el archivo de audio
            wavesurfer.load(track.src);
            wavesurferRefs.current.set(track.id, wavesurfer);
          }
        }
      } catch (error) {
        console.error('Error loading WaveSurfer:', error);
        setIsLoading(false);
      }
    };

    if (tracks.length > 0) {
      loadWaveSurfer();
    }

    // Cleanup
    return () => {
      wavesurferRefs.current.forEach(wavesurfer => {
        wavesurfer.destroy();
      });
      wavesurferRefs.current.clear();
    };
  }, [tracks, duration, onSeek, onPause]);

  // Controlar reproducción de todas las pistas
  useEffect(() => {
    wavesurferRefs.current.forEach((wavesurfer, trackId) => {
      const track = tracks.find(t => t.id === trackId);
      if (track && !track.muted && (track.solo || !tracks.some(t => t.solo && !t.muted))) {
        if (isPlaying) {
          wavesurfer.play();
        } else {
          wavesurfer.pause();
        }
      } else {
        wavesurfer.pause();
      }
    });
  }, [isPlaying, tracks]);

  // Controlar volúmenes
  useEffect(() => {
    wavesurferRefs.current.forEach((wavesurfer, trackId) => {
      const track = tracks.find(t => t.id === trackId);
      if (track) {
        wavesurfer.setVolume(track.muted ? 0 : track.volume);
      }
    });
  }, [tracks]);

  // Sincronizar tiempo actual
  useEffect(() => {
    if (duration > 0) {
      const progress = currentTime / duration;
      wavesurferRefs.current.forEach(wavesurfer => {
        wavesurfer.seekTo(progress);
      });
    }
  }, [currentTime, duration]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      onPause();
    } else {
      onPlay();
    }
  }, [isPlaying, onPlay, onPause]);

  const handleTrackToggle = useCallback((trackId: string, type: 'mute' | 'solo') => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      if (type === 'mute') {
        onTrackUpdate(trackId, { muted: !track.muted });
      } else {
        onTrackUpdate(trackId, { solo: !track.solo });
      }
    }
  }, [tracks, onTrackUpdate]);

  const handleVolumeChange = useCallback((trackId: string, volume: number) => {
    onTrackUpdate(trackId, { volume });
  }, [onTrackUpdate]);

  const handlePanChange = useCallback((trackId: string, pan: number) => {
    onTrackUpdate(trackId, { pan });
  }, [onTrackUpdate]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex-1 bg-gray-900 p-4">
      <div className="space-y-2">
        {tracks.map((track) => (
          <div key={track.id} className="h-16 bg-gray-700 rounded-lg flex items-center px-4 relative">
            <div className="flex items-center w-full">
              {/* Track Info */}
              <div className="flex items-center space-x-3 w-32">
                <div 
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ backgroundColor: track.color }}
                >
                  <span className="text-white text-xs font-bold">
                    {track.name.charAt(0)}
                  </span>
                </div>
                <span className="text-white text-sm font-medium">{track.name}</span>
              </div>

              {/* Track Controls */}
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => handleTrackToggle(track.id, 'mute')}
                  className={`w-6 h-6 rounded text-xs font-bold ${
                    track.muted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}
                >
                  M
                </button>
                <button
                  onClick={() => handleTrackToggle(track.id, 'solo')}
                  className={`w-6 h-6 rounded text-xs font-bold ${
                    track.solo ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300'
                  }`}
                >
                  S
                </button>
              </div>

              {/* Waveform */}
              <div className="flex-1 ml-4">
                <div 
                  ref={(el) => {
                    if (el) {
                      waveformRefs.current.set(track.id, el);
                    }
                  }}
                  className={`w-full h-12 bg-gray-600 rounded cursor-pointer wavesurfer-container ${track.id}`}
                  style={{ minHeight: '48px' }}
                />
              </div>

              {/* Volume Control */}
              <div className="flex items-center space-x-2 ml-4 w-24">
                <Volume2 className="w-4 h-4 text-gray-400" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={track.volume}
                  onChange={(e) => handleVolumeChange(track.id, parseFloat(e.target.value))}
                  className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Pan Control */}
              <div className="flex items-center space-x-2 ml-4 w-24">
                <span className="text-gray-400 text-xs">L</span>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.01"
                  value={track.pan}
                  onChange={(e) => handlePanChange(track.id, parseFloat(e.target.value))}
                  className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-gray-400 text-xs">R</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center h-32">
          <div className="text-gray-400 text-sm">Cargando pistas de audio...</div>
        </div>
      )}
    </div>
  );
};

export default WaveSurferEditor;
