/**
 * SimpleMixer - Mixer de audio simple sin WaveSurfer.js
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  Music, 
  Volume2, 
  SkipBack, 
  Play, 
  Pause,
  SkipForward, 
  RotateCcw,
  Settings,
  Download,
  MoreVertical
} from 'lucide-react';
import GuitarChordDiagram from './GuitarChordDiagram';

interface SimpleMixerProps {
  isOpen: boolean;
  onClose: () => void;
  songData: {
    id: string;
    title: string;
    artist: string;
    stems?: {
      vocals?: string;
      drums?: string;
      bass?: string;
      other?: string;
      instrumental?: string;
      [key: string]: string | undefined;
    };
    bpm: number;
    key: string;
    timeSignature: string;
    duration: string;
  } | null;
}

interface TrackState {
  id: string;
  name: string;
  src: string;
  color: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  audio?: HTMLAudioElement;
}

const SimpleMixer: React.FC<SimpleMixerProps> = ({ isOpen, onClose, songData }) => {
  // Función global para limpiar audio
  const cleanupAudio = () => {
    console.log('🛑 STOP completo del audio desde SimpleMixer');
    
    // STOP tracks del estado - detener completamente
    tracks.forEach(track => {
      if (track.audio) {
        console.log(`⏹️ STOPPING track: ${track.name}`);
        track.audio.pause();
        track.audio.currentTime = 0;
        track.audio.src = '';
        track.audio.load(); // Forzar recarga para detener completamente
        track.audio.removeAttribute('src'); // Remover fuente completamente
      }
    });
    
    // STOP cualquier elemento de audio en el DOM
    const allAudioElements = document.querySelectorAll('audio');
    console.log(`🎵 STOPPING ${allAudioElements.length} elementos de audio del DOM`);
    
    allAudioElements.forEach((audio, index) => {
      console.log(`⏹️ STOPPING audio DOM ${index + 1}`);
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load(); // Forzar recarga
      audio.removeAttribute('src'); // Remover fuente
    });
    
    // STOP todos los MediaElements
    const allMediaElements = document.querySelectorAll('video, audio');
    allMediaElements.forEach((media, index) => {
      console.log(`⏹️ STOPPING media element ${index + 1}`);
      media.pause();
      media.currentTime = 0;
      media.src = '';
      media.load();
      media.removeAttribute('src');
    });
    
    // Cerrar AudioContext completamente
    try {
      if (window.AudioContext) {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContext.close(); // Cerrar en lugar de suspender
        console.log('🎵 AudioContext CERRADO completamente');
      }
    } catch (e) {
      console.log('Error cerrando AudioContext:', e);
    }
    
    // Limpiar estado del mixer
    setIsPlaying(false);
    setCurrentTime(0);
    
    console.log('✅ Audio STOPPED completamente desde SimpleMixer');
  };

  // Exponer función globalmente
  (window as any).stopAllAudio = cleanupAudio;
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Datos de acordes que aparecerán automáticamente
  const chordData = [
    {
      chord: "C#m",
      type: "minor",
      frets: [4, 2, 4, 3, 0, 0],
      fingers: [4, 1, 3, 2, 0, 0],
      muted: [true, false, false, false, false, false],
      open: [false, false, false, false, true, true]
    },
    {
      chord: "G#m",
      type: "minor",
      frets: [4, 6, 6, 4, 4, 4],
      fingers: [1, 3, 4, 1, 1, 1],
      muted: [false, false, false, false, false, false],
      open: [false, false, false, false, false, false],
      capo: 4
    },
    {
      chord: "A",
      type: "major",
      frets: [0, 2, 2, 2, 2, 0],
      fingers: [0, 1, 2, 3, 4, 0],
      muted: [true, false, false, false, false, false],
      open: [false, true, false, false, false, true]
    }
  ];

  // Colores para cada pista
  const trackColors = {
    vocals: '#ef4444',
    drums: '#f59e0b', 
    bass: '#10b981',
    other: '#8b5cf6',
    instrumental: '#06b6d4',
    metronome: '#6b7280'
  };

  // Inicializar pistas cuando se abre el modal
  useEffect(() => {
    if (isOpen && songData) {
      initializeTracks();
    } else if (!isOpen) {
      console.log('🛑 Modal cerrado - STOP completo del audio');
      
      // Usar la función de limpieza completa
      cleanupAudio();
      setTracks([]);
      setIsPlaying(false);
      setCurrentTime(0);
      
      console.log('✅ Audio STOPPED completamente al cerrar modal');
    }
  }, [isOpen, songData]);

  // Cleanup cuando se desmonte el componente
  useEffect(() => {
    return () => {
      // Pausar y limpiar todos los elementos de audio
      tracks.forEach(track => {
        if (track.audio) {
          track.audio.pause();
          track.audio.src = '';
          track.audio.load();
        }
      });
    };
  }, []);

  const checkUrlAccessibility = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: AbortSignal.timeout(5000) // 5 segundos timeout
      });
      console.log(`🔍 URL accessibility check for ${url}: ${response.status}`);
      return response.ok;
    } catch (error) {
      console.error(`❌ URL accessibility check failed for ${url}:`, error);
      return false;
    }
  };

  const initializeTracks = () => {
    const newTracks: TrackState[] = [];
    
    console.log('🎵 Initializing Simple Mixer tracks for song:', songData?.title);
    console.log('📊 Song stems:', songData?.stems);
    
    // Solo agregar stems si existen
    if (songData?.stems && Object.keys(songData.stems).length > 0) {
      console.log('✅ Found stems, creating audio tracks...');
      Object.entries(songData.stems).forEach(([key, src]) => {
        if (src) {
          // Usar proxy del backend para evitar CORS
          const b2Url = src;
          // Extraer la ruta después de /audio/ para usar en el proxy
          const audioPath = b2Url.replace('https://s3.us-east-005.backblazeb2.com/moises2/audio/', '');
          const proxyUrl = `http://localhost:8000/api/audio/${audioPath}`;
          
          console.log(`🎼 Adding audio track: ${key}`);
          console.log(`🔗 Original B2 URL: ${b2Url}`);
          console.log(`🔗 Proxy URL: ${proxyUrl}`);
          
          newTracks.push({
            id: key,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            src: proxyUrl,
            color: trackColors[key as keyof typeof trackColors] || '#6b7280',
            muted: false,
            solo: false,
            volume: 0.8,
            pan: 0
          });
        }
      });
    } else {
      console.log('⚠️ No stems found for song');
    }

    // Agregar metronome
    newTracks.push({
      id: 'metronome',
      name: 'Smart Metronome',
      src: '', // Se generará dinámicamente
      color: trackColors.metronome,
      muted: false,
      solo: false,
      volume: 0.5,
      pan: 0
    });

    setTracks(newTracks);
  };

  // Crear elementos de audio para cada track (solo una vez)
  useEffect(() => {
    if (tracks.length > 0) {
      createAudioElements();
    }
  }, [tracks.length]); // Solo cuando cambie el número de tracks

  const createAudioElements = () => {
    tracks.forEach((track) => {
      // Solo crear audio si no existe ya
      if (track.src && track.id !== 'metronome' && !track.audio) {
        console.log(`🎵 Creating audio element for ${track.name}: ${track.src}`);
        
        const audio = new Audio(track.src);
        audio.preload = 'metadata';
        audio.volume = track.volume;
        
        // Event listeners (solo una vez)
        audio.addEventListener('loadedmetadata', () => {
          console.log(`🎵 Audio loaded for ${track.name}`);
          if (tracks.indexOf(track) === 0) {
            setDuration(audio.duration);
          }
        });

        audio.addEventListener('timeupdate', () => {
          if (tracks.indexOf(track) === 0) {
            setCurrentTime(audio.currentTime);
          }
        });

        audio.addEventListener('ended', () => {
          if (tracks.indexOf(track) === 0) {
            setIsPlaying(false);
          }
        });

        audio.addEventListener('loadstart', () => {
          console.log(`🔄 Loading started for ${track.name}`);
        });

        audio.addEventListener('canplay', () => {
          console.log(`✅ Audio can play for ${track.name}`);
        });

        audio.addEventListener('load', () => {
          console.log(`✅ Audio loaded successfully for ${track.name}`);
        });

        audio.addEventListener('error', (error) => {
          console.error(`❌ Error loading ${track.name}:`, error);
          console.error(`❌ Failed URL: ${track.src}`);
        });

        // Actualizar el track con el elemento de audio
        setTracks(prev => prev.map(t => 
          t.id === track.id ? { ...t, audio } : t
        ));
      }
    });
  };

  const updateTrackVolumes = (tracks: TrackState[]) => {
    // Actualizar volúmenes basados en mute y solo
    tracks.forEach(track => {
      if (track.audio) {
        let finalVolume = track.volume;
        
        // Aplicar mute
        if (track.muted) {
          finalVolume = 0;
        }
        
        // Aplicar solo (si hay algún track en solo, solo ese debe sonar)
        const hasSolo = tracks.some(t => t.solo);
        if (hasSolo && !track.solo) {
          finalVolume = 0;
        }
        
        track.audio.volume = finalVolume;
      }
    });
  };

  const handleTrackUpdate = (trackId: string, updates: Partial<TrackState>) => {
    console.log(`🔄 Updating track ${trackId}:`, updates);
    setTracks(prev => {
      const updatedTracks = prev.map(track => {
        if (track.id === trackId) {
          const updatedTrack = { ...track, ...updates };
          
          // Actualizar volumen del audio si existe
          if (track.audio && updates.volume !== undefined) {
            track.audio.volume = updates.volume;
          }
          
          return updatedTrack;
        }
        return track;
      });
      
      // Actualizar volúmenes de todos los tracks después de los cambios
      updateTrackVolumes(updatedTracks);
      
      return updatedTracks;
    });
  };

  const togglePlay = () => {
    console.log('🎮 Toggle play clicked, isPlaying:', isPlaying);
    console.log('🎵 Tracks state:', tracks.map(t => ({ name: t.name, muted: t.muted, solo: t.solo })));
    
    if (isPlaying) {
      // Pausar todos los tracks
      console.log('⏸️ Pausing all tracks');
      tracks.forEach(track => {
        if (track.audio) {
          track.audio.pause();
        }
      });
      setIsPlaying(false);
    } else {
      // Reproducir tracks según mute/solo
      const hasSolo = tracks.some(t => t.solo && !t.muted);
      console.log('▶️ Playing tracks, hasSolo:', hasSolo);
      
      tracks.forEach(track => {
        if (track.audio && !track.muted) {
          // Si hay solo activo, solo reproducir tracks con solo
          if (hasSolo && track.solo) {
            console.log(`🎵 Playing solo track: ${track.name}`);
            track.audio.play().catch(error => {
              console.error(`❌ Error playing ${track.name}:`, error);
            });
          } else if (!hasSolo) {
            // Si no hay solo, reproducir todos los tracks no muteados
            console.log(`🎵 Playing track: ${track.name}`);
            track.audio.play().catch(error => {
              console.error(`❌ Error playing ${track.name}:`, error);
            });
          }
        }
      });
      setIsPlaying(true);
    }
  };

  const stopAll = () => {
    console.log('⏹️ STOP ALL clicked - deteniendo completamente');
    
    // STOP tracks del estado - detener completamente
    tracks.forEach(track => {
      if (track.audio) {
        console.log(`⏹️ STOPPING track: ${track.name}`);
        track.audio.pause();
        track.audio.currentTime = 0;
        track.audio.src = '';
        track.audio.load(); // Forzar recarga para detener completamente
        track.audio.removeAttribute('src'); // Remover fuente completamente
      }
    });
    
    // STOP cualquier otro elemento de audio en el DOM
    const allAudioElements = document.querySelectorAll('audio');
    console.log(`🎵 STOPPING ${allAudioElements.length} elementos de audio del DOM`);
    
    allAudioElements.forEach((audio, index) => {
      console.log(`⏹️ STOPPING audio DOM ${index + 1}`);
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load(); // Forzar recarga
      audio.removeAttribute('src'); // Remover fuente
    });
    
    setIsPlaying(false);
    setCurrentTime(0);
    
    console.log('✅ STOP ALL completado');
  };

  const resetTracks = () => {
    setTracks(prev => prev.map(track => ({
      ...track,
      muted: false,
      solo: false,
      volume: track.id === 'metronome' ? 0.5 : 0.8,
      pan: 0
    })));
  };

  if (!isOpen || !songData) return null;

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col">
      {/* Top Bar - Studio One Style */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="text-sm">Back</span>
            </button>
            <div className="text-white text-lg font-medium">Moises Clone - {songData.title}</div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="text-gray-400 text-sm">
              <span className="text-blue-400">{songData.bpm}</span> BPM | {songData.timeSignature} | Key: {songData.key}
            </div>
          </div>
        </div>
      </div>

      {/* Transport Controls - Studio One Style */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center space-x-4">
          <button className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded">
            <SkipBack className="h-4 w-4" />
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded">
            <SkipBack className="h-4 w-4" />
          </button>
          <button 
            onClick={togglePlay}
            className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded">
            <SkipForward className="h-4 w-4" />
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded">
            <SkipForward className="h-4 w-4" />
          </button>
          <button 
            onClick={stopAll}
            className="bg-red-600 hover:bg-red-700 text-white p-2 rounded"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <div className="w-px h-6 bg-gray-600"></div>
          <button className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm">
            Loop
          </button>
          <button className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm">
            Metronome
          </button>
        </div>
      </div>

      {/* Main Mixer Area - Studio One Style */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {/* Channel Labels Row */}
        <div className="bg-gray-900 border-b border-gray-700 px-4 py-2">
          <div className="flex items-center space-x-6">
            <div className="w-16 text-center text-gray-400 text-xs font-medium">CHANNEL</div>
            <div className="w-12 text-center text-gray-400 text-xs font-medium">M</div>
            <div className="w-12 text-center text-gray-400 text-xs font-medium">S</div>
            <div className="w-16 text-center text-gray-400 text-xs font-medium">PAN</div>
            <div className="flex-1 text-center text-gray-400 text-xs font-medium">LEVEL</div>
          </div>
        </div>

        {/* Mixer Channels - Studio One Style */}
        <div className="flex-1 flex overflow-x-auto">
          {/* Channel Strips */}
          <div className="flex space-x-1 p-4">
            {tracks.map((track, index) => (
              <div key={track.id} className="w-20 bg-gray-800 rounded-lg p-3 flex flex-col items-center">
                {/* Channel Number */}
                <div className="text-gray-400 text-xs mb-2 font-mono">{index + 1}</div>
                
                {/* Track Name */}
                <div className="text-white text-xs font-medium mb-3 text-center truncate w-full">
                  {track.name}
                </div>
                
                {/* Audio Waveform - Above Sliders */}
                <div className="mb-3 h-8 w-full bg-gray-700 rounded flex items-center justify-center overflow-hidden">
                  <div className="flex space-x-1 animate-pulse">
                    {Array.from({ length: 15 }, (_, i) => (
                      <div
                        key={i}
                        className="rounded transition-all duration-100"
                        style={{
                          width: '1px',
                          height: `${Math.random() * 16 + 4}px`,
                          backgroundColor: track.color || '#3b82f6',
                          animationDelay: `${i * 50}ms`
                        }}
                      ></div>
                    ))}
                  </div>
                </div>
                
                {/* Mute/Solo Buttons */}
                <div className="flex space-x-1 mb-3">
                  <button
                    onClick={() => handleTrackUpdate(track.id, { muted: !track.muted })}
                    className={`w-6 h-6 rounded text-xs font-bold ${
                      track.muted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    M
                  </button>
                  <button
                    onClick={() => handleTrackUpdate(track.id, { solo: !track.solo })}
                    className={`w-6 h-6 rounded text-xs font-bold ${
                      track.solo ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                    }`}
                  >
                    S
                  </button>
                </div>
                
                {/* Pan Control */}
                <div className="mb-3">
                  <div className="text-gray-400 text-xs mb-1 text-center">Pan</div>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={track.pan}
                    onChange={(e) => handleTrackUpdate(track.id, { pan: parseFloat(e.target.value) })}
                    className="w-12 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer slider transform rotate-90"
                    style={{ transform: 'rotate(-90deg)' }}
                  />
                  <div className="text-gray-400 text-xs text-center mt-1">
                    {track.pan > 0 ? `R${Math.round(track.pan * 100)}` : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : 'C'}
                  </div>
                </div>
                
                {/* Chord Display - Solo para ciertos tracks */}
                {track.id === 'vocals' && (
                  <div className="flex-1 flex flex-col items-center space-y-2">
                    <div className="text-gray-400 text-xs mb-2">Chords</div>
                    <div className="space-y-2">
                      {chordData.map((chord, chordIndex) => (
                        <div key={chordIndex} className="bg-gray-700 rounded p-2">
                          <GuitarChordDiagram
                            chord={chord.chord}
                            chordType={chord.type}
                            frets={chord.frets}
                            fingers={chord.fingers}
                            muted={chord.muted}
                            open={chord.open}
                            capo={chord.capo}
                            className="scale-75"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Volume Fader - Solo para tracks que no son vocals */}
                {track.id !== 'vocals' && (
                  <div className="flex-1 flex flex-col items-center">
                    <div className="text-gray-400 text-xs mb-2">Level</div>
                    <div className="relative h-32 w-6 bg-gray-700 rounded-lg mb-2">
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={track.volume}
                        onChange={(e) => handleTrackUpdate(track.id, { volume: parseFloat(e.target.value) })}
                        className="absolute w-32 h-6 bg-transparent cursor-pointer slider transform -rotate-90"
                        style={{ 
                          transform: 'rotate(-90deg)',
                          top: '50%',
                          left: '50%',
                          marginTop: '-12px',
                          marginLeft: '-64px'
                        }}
                      />
                      {/* Volume Level Indicator */}
                      <div 
                        className="absolute bottom-0 left-1 right-1 bg-blue-500 rounded-b-lg transition-all duration-100"
                        style={{ height: `${track.volume * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-gray-400 text-xs">
                      {Math.round(track.volume * 100)}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {/* Master Channel */}
            <div className="w-20 bg-gray-700 rounded-lg p-3 flex flex-col items-center border-2 border-blue-500">
              <div className="text-blue-400 text-xs mb-2 font-mono font-bold">M</div>
              <div className="text-white text-xs font-medium mb-3">MASTER</div>
              
              {/* Master Waveform */}
              <div className="mb-3 h-8 w-full bg-gray-600 rounded flex items-center justify-center">
                <div className="flex space-x-1">
                  {Array.from({ length: 15 }, (_, i) => (
                    <div
                      key={i}
                      className="rounded"
                      style={{
                        width: '1px',
                        height: `${Math.random() * 16 + 4}px`,
                        backgroundColor: '#10b981'
                      }}
                    ></div>
                  ))}
                </div>
              </div>
              
              <div className="flex-1 flex flex-col items-center">
                <div className="text-gray-400 text-xs mb-2">Level</div>
                <div className="relative h-32 w-6 bg-gray-600 rounded-lg mb-2">
                  <div 
                    className="absolute bottom-0 left-1 right-1 bg-green-500 rounded-b-lg"
                    style={{ height: '85%' }}
                  ></div>
                </div>
                <div className="text-gray-400 text-xs">85</div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Status Bar - Studio One Style */}
        <div className="bg-gray-900 border-t border-gray-700 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>MIDI</span>
              <span>Performance 1.0 ms</span>
              <span>44.1 kHz</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>Current: {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(1).padStart(4, '0')}</span>
              <span>Duration: {Math.floor(duration / 60)}:{(duration % 60).toFixed(1).padStart(4, '0')}</span>
            </div>
            <div className="flex items-center space-x-4 text-sm text-gray-400">
              <span>L 00001.01.01.00</span>
              <span>R 00001.01.01.00</span>
              <span>{songData.timeSignature}</span>
              <span className="text-blue-400">{songData.bpm}.00</span>
              <button className="text-gray-400 hover:text-white">Metronome</button>
              <button className="text-gray-400 hover:text-white">Timing</button>
              <button className="text-gray-400 hover:text-white">Key</button>
              <button className="text-gray-400 hover:text-white">Tempo</button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
        }
        
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #3b82f6;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default SimpleMixer;
