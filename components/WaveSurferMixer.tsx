/**
 * WaveSurferMixer - Mixer de audio con visualización de ondas usando WaveSurfer.js
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
import WaveSurfer from 'wavesurfer.js';
import EnhancedWaveSurfer from './EnhancedWaveSurfer';
import './WaveSurferStyles.css';

interface WaveSurferMixerProps {
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
  waveSurfer?: WaveSurfer;
}

const WaveSurferMixer: React.FC<WaveSurferMixerProps> = ({ isOpen, onClose, songData }) => {
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
    }
  }, [isOpen, songData]);

  const initializeTracks = () => {
    const newTracks: TrackState[] = [];
    
    console.log('🎵 Initializing WaveSurfer tracks for song:', songData?.title);
    console.log('📊 Song stems:', songData?.stems);
    
    // Solo agregar stems si existen
    if (songData?.stems && Object.keys(songData.stems).length > 0) {
      console.log('✅ Found stems, creating WaveSurfer tracks...');
      Object.entries(songData.stems).forEach(([key, src]) => {
        if (src) {
          console.log(`🎼 Adding WaveSurfer track: ${key} -> ${src}`);
          newTracks.push({
            id: key,
            name: key.charAt(0).toUpperCase() + key.slice(1),
            src: src,
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

  // Crear instancias de WaveSurfer para cada track
  useEffect(() => {
    if (tracks.length > 0 && containerRef.current) {
      createWaveSurferInstances();
    }
  }, [tracks]);

  const createWaveSurferInstances = () => {
    tracks.forEach((track, index) => {
      if (track.src && track.id !== 'metronome') {
        const container = document.getElementById(`waveform-${track.id}`);
        if (container) {
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
            // Configuraciones para ondas más realistas
            fillParent: true,
            minPxPerSec: 1,
            hideScrollbar: true,
            audioRate: 1,
            dragToSeek: true
          });

          console.log(`🎵 Loading audio from B2 URL: ${track.src}`);
          waveSurfer.load(track.src);
          
          // Actualizar el track con la instancia de WaveSurfer
          setTracks(prev => prev.map(t => 
            t.id === track.id ? { ...t, waveSurfer } : t
          ));

          // Event listeners
          waveSurfer.on('ready', () => {
            console.log(`🎵 WaveSurfer ready for ${track.name}`);
            if (index === 0) {
              setDuration(waveSurfer.getDuration());
            }
          });

          waveSurfer.on('audioprocess', (time) => {
            if (index === 0) { // Solo actualizar tiempo desde el primer track
              setCurrentTime(time);
            }
          });

          waveSurfer.on('finish', () => {
            if (index === 0) {
              setIsPlaying(false);
            }
          });

          waveSurfer.on('error', (error) => {
            console.error(`❌ Error loading ${track.name}:`, error);
            console.error(`❌ Failed URL: ${track.src}`);
          });
        }
      }
    });
  };

  const handleTrackUpdate = (trackId: string, updates: Partial<TrackState>) => {
    setTracks(prev => prev.map(track => 
      track.id === trackId ? { ...track, ...updates } : track
    ));
  };

  const togglePlay = () => {
    if (isPlaying) {
      // Pausar todos los tracks
      tracks.forEach(track => {
        if (track.waveSurfer && !track.muted) {
          track.waveSurfer.pause();
        }
      });
      setIsPlaying(false);
    } else {
      // Reproducir todos los tracks
      tracks.forEach(track => {
        if (track.waveSurfer && !track.muted && (track.solo || !tracks.some(t => t.solo && !t.muted))) {
          track.waveSurfer.play();
        }
      });
      setIsPlaying(true);
    }
  };

  const stopAll = () => {
    tracks.forEach(track => {
      if (track.waveSurfer) {
        track.waveSurfer.stop();
      }
    });
    setIsPlaying(false);
    setCurrentTime(0);
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
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      {/* Top Header */}
      <div className="bg-gray-800 h-16 flex items-center justify-between px-6 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Music className="h-5 w-5 text-blue-400" />
          <span className="text-white font-medium">{songData.title}</span>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Controles de reproducción principales */}
          <div className="flex items-center space-x-2 bg-gray-700 rounded-lg px-3 py-2">
            <button 
              onClick={togglePlay}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            <button 
              onClick={stopAll}
              className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full"
              title="Stop"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-full">
              <SkipBack className="h-4 w-4" />
            </button>
            <button className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-full">
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
          
          <div className="bg-gray-700 px-2 py-1 rounded text-white text-sm">
            {songData.bpm}
          </div>
          
          <div className="bg-gray-700 px-2 py-1 rounded text-white text-sm">
            {songData.key}
          </div>
          
          <div className="bg-gray-700 px-2 py-1 rounded text-white text-sm">
            {songData.timeSignature}
          </div>
          
          <button className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded flex items-center space-x-2">
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>
          
          <button className="text-gray-400 hover:text-white">
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Sidebar - Track Controls */}
        <div className="w-64 bg-gray-800 border-r border-gray-700 p-4">
          <div className="space-y-4">
            {tracks.map((track) => (
              <div key={track.id} className="bg-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white text-sm font-medium">{track.name}</span>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleTrackUpdate(track.id, { muted: !track.muted })}
                      className={`w-6 h-6 rounded text-xs font-bold ${
                        track.muted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      M
                    </button>
                    <button
                      onClick={() => handleTrackUpdate(track.id, { solo: !track.solo })}
                      className={`w-6 h-6 rounded text-xs font-bold ${
                        track.solo ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300'
                      }`}
                    >
                      S
                    </button>
                  </div>
                </div>
                
                {/* Volume Slider */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Volume</span>
                    <span>{Math.round(track.volume * 100)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={track.volume}
                    onChange={(e) => handleTrackUpdate(track.id, { volume: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
                
                {/* Pan Control */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>L</span>
                    <span>R</span>
                  </div>
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.01"
                    value={track.pan}
                    onChange={(e) => handleTrackUpdate(track.id, { pan: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  />
                </div>
              </div>
            ))}
            
            <button
              onClick={resetTracks}
              className="w-full bg-gray-600 hover:bg-gray-500 text-white py-2 px-4 rounded-lg text-sm"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Main Waveform Area */}
        <div className="flex-1 bg-gray-900 p-4">
          {tracks.length <= 1 ? (
            <div className="flex-1 bg-gray-900 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Music className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-xl font-medium text-white mb-2">No hay pistas separadas</h3>
                <p className="text-gray-400 mb-6">Esta canción no tiene pistas separadas disponibles.</p>
                <p className="text-gray-500 text-sm">Necesitas procesar la canción con IA para separar las pistas.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {tracks.map((track) => (
                <div key={track.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: track.color }}
                      ></div>
                      <span className="text-white font-medium">{track.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {track.muted && <span className="text-red-400 text-xs">MUTED</span>}
                      {track.solo && <span className="text-yellow-400 text-xs">SOLO</span>}
                    </div>
                  </div>
                  
                  {/* Enhanced Waveform */}
                  {track.src && track.id !== 'metronome' ? (
                    <EnhancedWaveSurfer
                      src={track.src}
                      title={track.name}
                      color={track.color}
                      height={80}
                      isPlaying={isPlaying && !track.muted}
                      onPlay={() => {
                        if (track.waveSurfer) {
                          track.waveSurfer.play();
                        }
                      }}
                      onPause={() => {
                        if (track.waveSurfer) {
                          track.waveSurfer.pause();
                        }
                      }}
                      onVolumeChange={(volume) => {
                        handleTrackUpdate(track.id, { volume });
                      }}
                      volume={track.volume}
                      className={`${track.id} ${track.muted ? 'muted' : ''}`}
                    />
                  ) : (
                    <div 
                      className={`w-full wavesurfer-container ${track.id} flex items-center justify-center`}
                      style={{ minHeight: '80px' }}
                    >
                      <span className="text-gray-400 text-sm">
                        {track.id === 'metronome' ? 'Metronome' : 'No audio available'}
                      </span>
                    </div>
                  )}
                  
                  {/* Track Info */}
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                    <span>Vol: {Math.round(track.volume * 100)}%</span>
                    <span>Pan: {track.pan > 0 ? `R${Math.round(track.pan * 100)}` : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : 'C'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-gray-800 h-24 border-t border-gray-700 px-6">
        <div className="flex items-center justify-between h-full">
          {/* Playback Controls */}
          <div className="flex items-center space-x-6">
            <button className="text-gray-400 hover:text-white">
              <Volume2 className="h-5 w-5" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="flex-1 mx-8">
            <div className="flex items-center space-x-4">
              <span className="text-gray-400 text-sm">
                {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, '0')}
              </span>
              <div className="flex-1 h-2 bg-gray-600 rounded-full">
                <div 
                  className="h-full bg-blue-400 rounded-full" 
                  style={{ 
                    width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' 
                  }}
                ></div>
              </div>
              <span className="text-gray-400 text-sm">
                {Math.floor(duration / 60)}:{(duration % 60).toFixed(0).padStart(2, '0')}
              </span>
            </div>
          </div>

          {/* Additional Options */}
          <div className="flex items-center space-x-4">
            <button className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </button>
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

export default WaveSurferMixer;
