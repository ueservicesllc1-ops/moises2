'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  SkipBack, 
  SkipForward,
  Volume2, 
  VolumeX, 
  Mic, 
  Guitar, 
  Drum, 
  Music, 
  Piano,
  Maximize2,
  Settings,
  Download,
  Loop,
  Record,
  Scissors,
  Copy,
  Paste
} from 'lucide-react';

interface SongData {
  id: string;
  title: string;
  artist: string;
  stems: { [key: string]: string };
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

interface Track {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
  audio: HTMLAudioElement;
  volume: number;
  muted: boolean;
  solo: boolean;
  pan: number;
  gain: number;
  selected: boolean;
  regions: AudioRegion[];
}

interface AudioRegion {
  id: string;
  name: string;
  startTime: number;
  endTime: number;
  color: string;
  audioUrl: string;
}

const ProfessionalDAW: React.FC<ProfessionalDAWProps> = ({ isOpen, onClose, songData }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(60); // 60 segundos por defecto
  const [zoom, setZoom] = useState(1);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [waveforms, setWaveforms] = useState<{ [key: string]: number[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<{ [key: string]: AnalyserNode }>({});
  const animationFrameRef = useRef<number>();
  const timelineRef = useRef<HTMLDivElement>(null);
  const trackHeight = 80;

  // Configuración de pistas
  const trackConfigs = [
    { key: 'vocals', name: 'Vocals', icon: <Mic className="w-4 h-4" />, color: '#EC4899' },
    { key: 'instrumental', name: 'Instrumental', icon: <Guitar className="w-4 h-4" />, color: '#3B82F6' },
    { key: 'drums', name: 'Drums', icon: <Drum className="w-4 h-4" />, color: '#F97316' },
    { key: 'bass', name: 'Bass', icon: <Music className="w-4 h-4" />, color: '#10B981' },
    { key: 'other', name: 'Other', icon: <Music className="w-4 h-4" />, color: '#8B5CF6' },
    { key: 'piano', name: 'Piano', icon: <Piano className="w-4 h-4" />, color: '#F59E0B' }
  ];

  // Inicializar pistas
  useEffect(() => {
    const initializeTracks = async () => {
      setIsLoading(true);
      const newTracks: Track[] = [];

      for (const config of trackConfigs) {
        const stemUrl = songData.stems[config.key];
        if (stemUrl) {
          const audio = new Audio(stemUrl);
          audio.crossOrigin = 'anonymous';
          audio.preload = 'auto';
          
          // Crear región de audio para toda la duración
          const audioRegion: AudioRegion = {
            id: `${config.key}-region-1`,
            name: config.name,
            startTime: 0,
            endTime: 60, // Duración por defecto
            color: config.color,
            audioUrl: stemUrl
          };

          newTracks.push({
            id: config.key,
            name: config.name,
            icon: config.icon,
            color: config.color,
            audio,
            volume: 0.8,
            muted: false,
            solo: false,
            pan: 0,
            gain: 1,
            selected: false,
            regions: [audioRegion]
          });
        }
      }

      setTracks(newTracks);
      setIsLoading(false);
    };

    if (isOpen && songData) {
      initializeTracks();
    }
  }, [isOpen, songData]);

  // Configurar AudioContext
  useEffect(() => {
    if (tracks.length === 0) return;

    const setupAudioContext = async () => {
      try {
        audioContextRef.current = new AudioContext();
        
        for (const track of tracks) {
          const source = audioContextRef.current.createMediaElementSource(track.audio);
          const gainNode = audioContextRef.current.createGain();
          const pannerNode = audioContextRef.current.createStereoPanner();
          const analyser = audioContextRef.current.createAnalyser();
          
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.8;
          
          source.connect(gainNode);
          gainNode.connect(pannerNode);
          pannerNode.connect(analyser);
          analyser.connect(audioContextRef.current.destination);
          
          analysersRef.current[track.id] = analyser;
          
          gainNode.gain.value = track.volume * track.gain * masterVolume;
          pannerNode.pan.value = track.pan;
        }
      } catch (error) {
        console.error('Error setting up audio context:', error);
      }
    };

    setupAudioContext();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [tracks, masterVolume]);

  // Animar waveforms
  useEffect(() => {
    const animate = () => {
      const newWaveforms: { [key: string]: number[] } = {};
      
      Object.entries(analysersRef.current).forEach(([id, analyser]) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        newWaveforms[id] = Array.from(dataArray);
      });
      
      setWaveforms(newWaveforms);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying) {
      animate();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  // Sincronizar tiempo
  useEffect(() => {
    if (tracks.length === 0) return;

    const updateTime = () => {
      const currentTrack = tracks[0];
      if (currentTrack.audio) {
        setCurrentTime(currentTrack.audio.currentTime);
      }
    };

    const interval = setInterval(updateTime, 100);
    return () => clearInterval(interval);
  }, [tracks]);

  const togglePlayPause = useCallback(async () => {
    if (tracks.length === 0) return;

    try {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (isPlaying) {
        tracks.forEach(track => track.audio.pause());
        setIsPlaying(false);
      } else {
        const playPromises = tracks.map(track => track.audio.play());
        await Promise.all(playPromises);
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error toggling playback:', error);
    }
  }, [tracks, isPlaying]);

  const stopPlayback = useCallback(() => {
    tracks.forEach(track => {
      track.audio.pause();
      track.audio.currentTime = 0;
    });
    setIsPlaying(false);
    setCurrentTime(0);
  }, [tracks]);

  const updateTrackVolume = useCallback((trackId: string, volume: number) => {
    setTracks(prev => prev.map(track => {
      if (track.id === trackId) {
        track.audio.volume = volume * track.gain * masterVolume * (track.muted ? 0 : 1);
        return { ...track, volume };
      }
      return track;
    }));
  }, [masterVolume]);

  const toggleMute = useCallback((trackId: string) => {
    setTracks(prev => prev.map(track => {
      if (track.id === trackId) {
        const muted = !track.muted;
        track.audio.volume = muted ? 0 : track.volume * track.gain * masterVolume;
        return { ...track, muted };
      }
      return track;
    }));
  }, [masterVolume]);

  const toggleSolo = useCallback((trackId: string) => {
    setTracks(prev => prev.map(track => {
      const solo = track.id === trackId ? !track.solo : false;
      const isSoloed = prev.some(t => t.solo);
      
      if (isSoloed) {
        track.audio.volume = solo ? track.volume * track.gain * masterVolume * (track.muted ? 0 : 1) : 0;
      } else {
        track.audio.volume = track.muted ? 0 : track.volume * track.gain * masterVolume;
      }
      
      return { ...track, solo };
    }));
  }, [masterVolume]);

  const selectTrack = (trackId: string) => {
    setSelectedTrack(trackId);
    setTracks(prev => prev.map(track => ({
      ...track,
      selected: track.id === trackId
    })));
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.floor((time % 1) * 100);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  const generateTimeMarkers = () => {
    const markers = [];
    for (let i = 0; i <= duration; i += 1) {
      markers.push(i);
    }
    return markers;
  };

  const WaveformRegion: React.FC<{ region: AudioRegion; trackId: string }> = ({ region, trackId }) => {
    const waveformData = waveforms[trackId] || [];
    
    return (
      <div
        className="relative h-full cursor-pointer hover:opacity-80 transition-opacity"
        style={{ 
          left: `${(region.startTime / duration) * 100}%`,
          width: `${((region.endTime - region.startTime) / duration) * 100}%`,
          backgroundColor: region.color,
          opacity: 0.8
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center space-x-1 h-6">
            {waveformData.slice(0, 20).map((value, index) => (
              <div
                key={index}
                className="w-1 bg-white opacity-60"
                style={{ height: `${(value / 255) * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div className="absolute bottom-0 left-1 text-white text-xs font-medium">
          {region.name}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-lg p-8 text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Cargando DAW profesional...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-4 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Professional DAW</h2>
            <p className="text-blue-100">{songData.title} - {songData.artist}</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm">{songData.bpm} BPM</span>
            <span className="text-sm">{songData.timeSignature}</span>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Timeline Header */}
        <div className="bg-gray-800 border-b border-gray-700 flex">
          <div className="w-48 bg-gray-700 border-r border-gray-600 flex items-center justify-center">
            <span className="text-gray-300 font-medium">Track</span>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <div className="flex h-12">
              {generateTimeMarkers().map((marker) => (
                <div
                  key={marker}
                  className="border-r border-gray-600 flex-shrink-0 text-xs text-gray-400 flex items-end pb-1"
                  style={{ width: `${(1 / duration) * 100}%` }}
                >
                  {marker}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tracks and Timeline */}
        <div className="flex-1 flex overflow-hidden">
          {/* Track List */}
          <div className="w-48 bg-gray-800 border-r border-gray-700 overflow-y-auto">
            {tracks.map((track, index) => (
              <div
                key={track.id}
                className={`h-20 border-b border-gray-700 p-2 cursor-pointer transition-colors ${
                  track.selected ? 'bg-blue-900' : 'hover:bg-gray-700'
                }`}
                onClick={() => selectTrack(track.id)}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <div 
                    className="p-1 rounded text-white"
                    style={{ backgroundColor: track.color }}
                  >
                    {track.icon}
                  </div>
                  <span className="text-white text-sm font-medium">{track.name}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {track.muted ? 'MUTED' : track.solo ? 'SOLO' : `${Math.round(track.volume * 100)}%`}
                </div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-auto">
            {tracks.map((track) => (
              <div
                key={track.id}
                className={`h-20 border-b border-gray-700 relative ${
                  track.selected ? 'bg-blue-900/20' : ''
                }`}
                onClick={() => selectTrack(track.id)}
              >
                {track.regions.map((region) => (
                  <WaveformRegion
                    key={region.id}
                    region={region}
                    trackId={track.id}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Mixer Console */}
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Mixer Console</h3>
            <div className="flex items-center space-x-4">
              <span className="text-gray-300 text-sm">Master</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="w-24"
              />
              <span className="text-gray-300 text-sm w-12">{Math.round(masterVolume * 100)}%</span>
            </div>
          </div>
          
          <div className="flex space-x-4 overflow-x-auto">
            {tracks.map((track) => (
              <div key={track.id} className="flex-shrink-0 w-16 text-center">
                <div className="text-white text-xs mb-2">{track.name}</div>
                
                {/* Mute Button */}
                <button
                  onClick={() => toggleMute(track.id)}
                  className={`w-8 h-8 rounded mb-2 flex items-center justify-center text-xs ${
                    track.muted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  M
                </button>
                
                {/* Solo Button */}
                <button
                  onClick={() => toggleSolo(track.id)}
                  className={`w-8 h-8 rounded mb-2 flex items-center justify-center text-xs ${
                    track.solo ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  S
                </button>
                
                {/* Pan Control */}
                <div className="mb-2">
                  <input
                    type="range"
                    min="-1"
                    max="1"
                    step="0.1"
                    value={track.pan}
                    onChange={(e) => setTracks(prev => prev.map(t => 
                      t.id === track.id ? { ...t, pan: parseFloat(e.target.value) } : t
                    ))}
                    className="w-12 transform -rotate-90"
                  />
                </div>
                
                {/* Volume Fader */}
                <div className="mb-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={track.volume}
                    onChange={(e) => updateTrackVolume(track.id, parseFloat(e.target.value))}
                    className="w-12 transform -rotate-90"
                  />
                </div>
                
                {/* Level Meter */}
                <div className="h-20 bg-gray-700 rounded relative overflow-hidden">
                  {waveforms[track.id] && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center space-x-1 p-1">
                      {waveforms[track.id].slice(0, 8).map((value, index) => (
                        <div
                          key={index}
                          className="w-1 rounded-t"
                          style={{
                            height: `${(value / 255) * 100}%`,
                            backgroundColor: value > 200 ? '#EF4444' : value > 150 ? '#F59E0B' : '#10B981'
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transport Controls */}
        <div className="bg-gray-800 border-t border-gray-700 p-4">
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={() => setCurrentTime(0)}
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            
            <button
              onClick={stopPlayback}
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded transition-colors"
            >
              <Square className="w-5 h-5" />
            </button>
            
            <button
              onClick={togglePlayPause}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full transition-colors"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            
            <button
              onClick={() => setIsRecording(!isRecording)}
              className={`p-2 rounded transition-colors ${
                isRecording ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Record className="w-5 h-5" />
            </button>
            
            <button
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded transition-colors"
            >
              <Loop className="w-5 h-5" />
            </button>
            
            <div className="ml-8 text-white font-mono">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDAW;