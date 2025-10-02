/**
 * ProfessionalDAW - Interfaz de DAW profesional con tracks horizontales y sliders
 * Implementa la funcionalidad de DAWs como Cubase, FL Studio, Ableton, Pro Tools
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import ProfessionalSlider from './ProfessionalSlider';

interface TrackData {
  id: string;
  name: string;
  src: string;
  color: string;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  waveSurfer?: any;
}

interface SongData {
  id: string;
  title: string;
  artist: string;
  stems: Record<string, string>;
  bpm: number;
  key: string;
  timeSignature: string;
  duration: string;
}

interface ProfessionalDAWProps {
  isOpen: boolean;
  onClose: () => void;
  songData: SongData;
}

const ProfessionalDAW: React.FC<ProfessionalDAWProps> = ({ isOpen, onClose, songData }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allTracksLoaded, setAllTracksLoaded] = useState(false);
  
  const trackRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Inicializar tracks basados en los stems disponibles
  useEffect(() => {
    console.log('🎵 Stems disponibles:', songData.stems);
    if (songData.stems && Object.keys(songData.stems).length > 0) {
      const trackColors = {
        vocals: '#ff6b6b',
        drums: '#4ecdc4',
        bass: '#45b7d1',
        other: '#96ceb4',
        instrumental: '#feca57'
      };

      // Solo crear tracks para los stems disponibles, máximo 4
      const newTracks: TrackData[] = Object.entries(songData.stems)
        .slice(0, 4) // Limitar a máximo 4 tracks
        .map(([key, url]) => ({
          id: key,
          name: key.charAt(0).toUpperCase() + key.slice(1),
          src: url,
          color: trackColors[key as keyof typeof trackColors] || '#6c757d',
          volume: 0.8,
          pan: 0,
          muted: false,
          solo: false
        }));

      console.log('🎵 Creando tracks:', newTracks.length, 'tracks');
      setTracks(newTracks);
      setAllTracksLoaded(false); // Resetear estado de carga
      setIsLoading(false);
    }
  }, [songData.stems]);

  // Crear instancias de WaveSurfer para cada track
  useEffect(() => {
    if (tracks.length > 0) {
      createWaveSurferInstances().catch(console.error);
    }
  }, [tracks.length]); // Solo ejecutar cuando cambie la cantidad de tracks

  // Cleanup al desmontar el componente
  useEffect(() => {
    return () => {
      tracks.forEach(track => {
        if (track.waveSurfer) {
          track.waveSurfer.destroy();
        }
      });
    };
  }, []);

  const createWaveSurferInstances = async () => {
    console.log('🎵 Creando instancias de WaveSurfer para', tracks.length, 'tracks');
    
    // Verificar si ya hay instancias creadas
    const tracksWithWaveSurfer = tracks.filter(track => track.waveSurfer);
    if (tracksWithWaveSurfer.length > 0) {
      console.log('🎵 Ya hay instancias de WaveSurfer creadas, saltando...');
      return;
    }
    
    // Cargar WaveSurfer dinámicamente
    const WaveSurferModule = await import('wavesurfer.js');
    const WaveSurfer = WaveSurferModule.default;
    
    tracks.forEach((track, index) => {
      console.log('🎵 Procesando track:', track.id, track.name);
      if (track.src && track.id !== 'metronome' && !track.waveSurfer) {
        const container = trackRefs.current.get(track.id);
        if (container) {
          console.log('🎵 Creando WaveSurfer para track:', track.id);
          const waveSurfer = WaveSurfer.create({
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
            fillParent: true,
            minPxPerSec: 1,
            hideScrollbar: true,
            audioRate: 1,
            dragToSeek: true
          });

          waveSurfer.load(track.src);
          
          waveSurfer.on('ready', () => {
            setTracks(prev => {
              const updatedTracks = prev.map(t => 
                t.id === track.id ? { ...t, waveSurfer } : t
              );
              
              // Verificar si todos los tracks están cargados
              const loadedCount = updatedTracks.filter(t => t.waveSurfer).length;
              if (loadedCount === updatedTracks.length) {
                setAllTracksLoaded(true);
                console.log('✅ Todos los tracks están cargados y listos para reproducir');
              }
              
              return updatedTracks;
            });
          });

          waveSurfer.on('interaction', () => {
            const currentTime = waveSurfer.getCurrentTime();
            setCurrentTime(currentTime);
          });
        }
      }
    });
  };

  const handlePlayPause = () => {
    // No permitir reproducción hasta que todos los tracks estén cargados
    if (!allTracksLoaded && !isPlaying) {
      console.log('⏳ Esperando a que todos los tracks se carguen...');
      return;
    }

    if (isPlaying) {
      tracks.forEach(track => {
        if (track.waveSurfer) {
          track.waveSurfer.pause();
        }
      });
      setIsPlaying(false);
    } else {
      tracks.forEach(track => {
        if (track.waveSurfer) {
          track.waveSurfer.play();
          // Aplicar el estado de mute después de iniciar reproducción
          if (track.muted) {
            track.waveSurfer.setVolume(0);
          } else {
            track.waveSurfer.setVolume(track.volume);
          }
        }
      });
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    tracks.forEach(track => {
      if (track.waveSurfer) {
        track.waveSurfer.stop();
      }
    });
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleTrackUpdate = (trackId: string, updates: Partial<TrackData>) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, ...updates } : track
    ));
  };

  const handleMute = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      const newMutedState = !track.muted;
      handleTrackUpdate(trackId, { muted: newMutedState });
      
      if (track.waveSurfer) {
        // MUTE = silenciar (volumen 0), UNMUTE = restaurar volumen original
        if (newMutedState) {
          track.waveSurfer.setVolume(0);
        } else {
          track.waveSurfer.setVolume(track.volume);
        }
      }
    }
  };

  const handleSolo = (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      const newSolo = !track.solo;
      handleTrackUpdate(trackId, { solo: newSolo });
      
      if (newSolo) {
        // Solo: mute all other tracks and unmute the soloed track
        handleTrackUpdate(trackId, { muted: false });
        tracks.forEach(t => {
          if (t.id !== trackId) {
            handleTrackUpdate(t.id, { muted: true });
            if (t.waveSurfer) {
              t.waveSurfer.setVolume(0);
            }
          }
        });
        // Restore volume for soloed track
        if (track.waveSurfer) {
          track.waveSurfer.setVolume(track.volume);
        }
      } else {
        // Un-solo: unmute all tracks
        tracks.forEach(t => {
          handleTrackUpdate(t.id, { muted: false });
          if (t.waveSurfer) {
            t.waveSurfer.setVolume(t.volume);
          }
        });
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-bold">Professional DAW</h2>
          <div className="text-sm text-gray-300">
            {songData.title} - {songData.artist}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-2xl"
        >
          ×
        </button>
      </div>

      {/* Área principal de tracks (60% de la pantalla) */}
      <div className="flex-1 bg-gray-800 p-4 overflow-y-auto">
        <div className="space-y-4">
          {tracks.map((track) => (
            <div key={track.id} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <span className="text-white font-medium">{track.name}</span>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleMute(track.id)}
                      className={`p-2 rounded text-xs ${track.muted ? 'bg-red-600' : 'bg-gray-600'} hover:bg-opacity-80`}
                    >
                      {track.muted ? 'MUTE' : 'MUTE'}
                    </button>
                    <button
                      onClick={() => handleSolo(track.id)}
                      className={`p-2 rounded text-xs ${track.solo ? 'bg-yellow-600' : 'bg-gray-600'} hover:bg-opacity-80`}
                    >
                      SOLO
                    </button>
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <ProfessionalSlider
                    value={track.volume}
                    onChange={(value) => handleTrackUpdate(track.id, { volume: value })}
                    min={0}
                    max={1}
                    step={0.01}
                    orientation="horizontal"
                    size="small"
                    color={track.color}
                    label="Vol"
                    showValue={false}
                  />
                  <ProfessionalSlider
                    value={track.pan}
                    onChange={(value) => handleTrackUpdate(track.id, { pan: value })}
                    min={-1}
                    max={1}
                    step={0.01}
                    orientation="horizontal"
                    size="small"
                    color="#f59e0b"
                    label="Pan"
                    showValue={false}
                  />
                </div>
              </div>
              
              {/* Waveform container */}
              <div 
                ref={(el) => {
                  if (el) trackRefs.current.set(track.id, el);
                }}
                className="w-full h-16 bg-gray-600 rounded"
                style={{ minHeight: '60px' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Controles de transporte */}
      <div className="bg-gray-900 p-4 flex items-center justify-center space-x-4">
        <button
          onClick={handleStop}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
        >
          STOP
        </button>
        <button
          onClick={handlePlayPause}
          disabled={!allTracksLoaded && !isPlaying}
          className={`p-3 rounded text-white font-bold transition-all duration-200 ${
            !allTracksLoaded && !isPlaying 
              ? 'bg-gray-600 cursor-not-allowed opacity-50' 
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {!allTracksLoaded && !isPlaying ? 'LOADING...' : (isPlaying ? 'PAUSE' : 'PLAY')}
        </button>
        <div className="text-white text-sm">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Sección de mixer (30% de la pantalla) */}
      <div className="h-1/3 bg-gray-900 p-4">
        <div className="text-white mb-4">
          <h3 className="text-lg font-bold">Audio Controls</h3>
        </div>
        
        <div className="flex space-x-4 h-full">
          {/* Tracks mixer */}
          <div className="flex space-x-2 flex-1">
            {tracks.map((track) => (
              <div key={track.id} className="flex flex-col items-center space-y-2">
                <div className="text-white text-xs">{track.name}</div>
                <ProfessionalSlider
                  value={track.volume}
                  onChange={(value) => handleTrackUpdate(track.id, { volume: value })}
                  min={0}
                  max={1}
                  step={0.01}
                  orientation="vertical"
                  size="medium"
                  color={track.color}
                  showValue={true}
                />
                <div className="flex space-x-1">
                  <button
                    onClick={() => handleMute(track.id)}
                    className={`p-1 rounded text-xs ${track.muted ? 'bg-red-600' : 'bg-gray-600'}`}
                  >
                    M
                  </button>
                  <button
                    onClick={() => handleSolo(track.id)}
                    className={`p-1 rounded text-xs ${track.solo ? 'bg-yellow-600' : 'bg-gray-600'}`}
                  >
                    S
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {/* Master fader */}
          <div className="flex flex-col items-center space-y-2">
            <div className="text-white text-xs">Master</div>
            <ProfessionalSlider
              value={masterVolume}
              onChange={setMasterVolume}
              min={0}
              max={1}
              step={0.01}
              orientation="vertical"
              size="medium"
              color="#ef4444"
              label="Master"
              showValue={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDAW;