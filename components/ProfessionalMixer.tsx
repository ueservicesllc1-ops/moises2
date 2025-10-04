'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, RotateCcw, Download, Mic, Guitar, Drum, Music, Piano } from 'lucide-react';

interface StemData {
  vocals: string;
  instrumental: string;
  drums?: string;
  bass?: string;
  other?: string;
  piano?: string;
}

interface ProfessionalMixerProps {
  stems: StemData;
  songTitle: string;
  onClose: () => void;
}

interface AudioTrack {
  audio: HTMLAudioElement;
  volume: number;
  muted: boolean;
  solo: boolean;
  pan: number;
  gain: number;
  name: string;
  icon: React.ReactNode;
  color: string;
}

const ProfessionalMixer: React.FC<ProfessionalMixerProps> = ({ stems, songTitle, onClose }) => {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [isMasterMuted, setIsMasterMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveforms, setWaveforms] = useState<{ [key: string]: number[] }>({});
  const [isLoading, setIsLoading] = useState(true);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<{ [key: string]: AnalyserNode }>({});
  const animationFrameRef = useRef<number>();

  // Configuración de pistas
  const trackConfigs = [
    { key: 'vocals', name: 'Vocals', icon: <Mic className="w-5 h-5" />, color: 'from-pink-500 to-rose-600' },
    { key: 'instrumental', name: 'Instrumental', icon: <Guitar className="w-5 h-5" />, color: 'from-blue-500 to-cyan-600' },
    { key: 'drums', name: 'Drums', icon: <Drum className="w-5 h-5" />, color: 'from-orange-500 to-red-600' },
    { key: 'bass', name: 'Bass', icon: <Music className="w-5 h-5" />, color: 'from-green-500 to-emerald-600' },
    { key: 'other', name: 'Other', icon: <Music className="w-5 h-5" />, color: 'from-purple-500 to-violet-600' },
    { key: 'piano', name: 'Piano', icon: <Piano className="w-5 h-5" />, color: 'from-yellow-500 to-amber-600' }
  ];

  // Inicializar pistas de audio
  useEffect(() => {
    const initializeTracks = async () => {
      setIsLoading(true);
      const newTracks: AudioTrack[] = [];

      for (const config of trackConfigs) {
        const stemUrl = stems[config.key as keyof StemData];
        if (stemUrl) {
          const audio = new Audio(stemUrl);
          audio.crossOrigin = 'anonymous';
          audio.preload = 'auto';
          
          newTracks.push({
            audio,
            volume: 0.8,
            muted: false,
            solo: false,
            pan: 0,
            gain: 1,
            name: config.name,
            icon: config.icon,
            color: config.color
          });
        }
      }

      setTracks(newTracks);
      setIsLoading(false);
    };

    initializeTracks();
  }, [stems]);

  // Configurar AudioContext y analizadores
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
          
          analysersRef.current[track.name] = analyser;
          
          // Configurar nodos
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
      
      Object.entries(analysersRef.current).forEach(([name, analyser]) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        newWaveforms[name] = Array.from(dataArray);
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

  // Sincronizar tiempo de reproducción
  useEffect(() => {
    if (tracks.length === 0) return;

    const updateTime = () => {
      const currentTrack = tracks[0];
      if (currentTrack.audio) {
        setCurrentTime(currentTrack.audio.currentTime);
        setDuration(currentTrack.audio.duration || 0);
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

  const updateTrackVolume = useCallback((trackName: string, volume: number) => {
    setTracks(prev => prev.map(track => {
      if (track.name === trackName) {
        track.audio.volume = volume * track.gain * masterVolume * (isMasterMuted ? 0 : 1);
        return { ...track, volume };
      }
      return track;
    }));
  }, [masterVolume, isMasterMuted]);

  const toggleMute = useCallback((trackName: string) => {
    setTracks(prev => prev.map(track => {
      if (track.name === trackName) {
        const muted = !track.muted;
        track.audio.volume = muted ? 0 : track.volume * track.gain * masterVolume * (isMasterMuted ? 0 : 1);
        return { ...track, muted };
      }
      return track;
    }));
  }, [masterVolume, isMasterMuted]);

  const toggleSolo = useCallback((trackName: string) => {
    setTracks(prev => prev.map(track => {
      const solo = track.name === trackName ? !track.solo : false;
      const isSoloed = prev.some(t => t.solo);
      
      if (isSoloed) {
        track.audio.volume = solo ? track.volume * track.gain * masterVolume * (isMasterMuted ? 0 : 1) : 0;
      } else {
        track.audio.volume = track.muted ? 0 : track.volume * track.gain * masterVolume * (isMasterMuted ? 0 : 1);
      }
      
      return { ...track, solo };
    }));
  }, [masterVolume, isMasterMuted]);

  const resetMix = useCallback(() => {
    setTracks(prev => prev.map(track => ({
      ...track,
      volume: 0.8,
      muted: false,
      solo: false,
      pan: 0,
      gain: 1
    })));
    setMasterVolume(0.8);
    setIsMasterMuted(false);
  }, []);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const WaveformVisualizer: React.FC<{ data: number[]; color: string }> = ({ data, color }) => (
    <div className="flex items-center space-x-1 h-8">
      {data.slice(0, 32).map((value, index) => (
        <div
          key={index}
          className={`w-1 bg-gradient-to-t ${color} opacity-80`}
          style={{ height: `${(value / 255) * 100}%` }}
        />
      ))}
    </div>
  );

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-lg p-8 text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Cargando mixer profesional...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Professional Mixer</h2>
              <p className="text-blue-100">{songTitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 text-2xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        {/* Transport Controls */}
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-center space-x-6">
            <button
              onClick={togglePlayPause}
              className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full transition-colors"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">{formatTime(currentTime)}</span>
              <div className="w-64 bg-gray-600 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-gray-300">{formatTime(duration)}</span>
            </div>

            <button
              onClick={resetMix}
              className="bg-gray-600 hover:bg-gray-700 text-white p-2 rounded transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Master Controls */}
        <div className="bg-gray-800 p-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <span className="text-white font-semibold">Master</span>
              <button
                onClick={() => setIsMasterMuted(!isMasterMuted)}
                className={`p-2 rounded transition-colors ${
                  isMasterMuted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {isMasterMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-gray-300">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="w-32"
              />
              <span className="text-gray-300 w-12">{Math.round(masterVolume * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Mixer Grid */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {tracks.map((track) => (
              <div key={track.name} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                {/* Track Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg bg-gradient-to-r ${track.color} text-white`}>
                      {track.icon}
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{track.name}</h3>
                      <div className="text-xs text-gray-400">
                        {track.muted ? 'MUTED' : track.solo ? 'SOLO' : `${Math.round(track.volume * 100)}%`}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => toggleMute(track.name)}
                      className={`p-2 rounded transition-colors ${
                        track.muted ? 'bg-red-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {track.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => toggleSolo(track.name)}
                      className={`p-2 rounded transition-colors ${
                        track.solo ? 'bg-yellow-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      S
                    </button>
                  </div>
                </div>

                {/* Waveform Visualizer */}
                <div className="mb-4">
                  <WaveformVisualizer 
                    data={waveforms[track.name] || []} 
                    color={track.color} 
                  />
                </div>

                {/* Volume Control */}
                <div className="space-y-3">
                  <div>
                    <label className="text-gray-300 text-sm">Volume</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={track.volume}
                      onChange={(e) => updateTrackVolume(track.name, parseFloat(e.target.value))}
                      className="w-full mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 text-sm">Pan</label>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.1"
                      value={track.pan}
                      onChange={(e) => setTracks(prev => prev.map(t => 
                        t.name === track.name ? { ...t, pan: parseFloat(e.target.value) } : t
                      ))}
                      className="w-full mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-gray-300 text-sm">Gain</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={track.gain}
                      onChange={(e) => setTracks(prev => prev.map(t => 
                        t.name === track.name ? { ...t, gain: parseFloat(e.target.value) } : t
                      ))}
                      className="w-full mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-800 p-4 border-t border-gray-700">
          <div className="flex justify-between items-center">
            <div className="text-gray-400 text-sm">
              {tracks.length} tracks loaded • Professional Mixer v1.0
            </div>
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded transition-colors flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Mix</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalMixer;
