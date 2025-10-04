/**
 * IntelligentMetronome - Metrónomo inteligente con detección automática de BPM
 * Basado en las funcionalidades de Moises.ai
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, Music, Zap, Target, Clock } from 'lucide-react';

interface IntelligentMetronomeProps {
  audioUrl?: string;
  detectedBPM?: number;
  onClose?: () => void;
}

const IntelligentMetronome: React.FC<IntelligentMetronomeProps> = ({
  audioUrl,
  detectedBPM = 120,
  onClose
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(detectedBPM);
  const [volume, setVolume] = useState(0.7);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [accentBeat, setAccentBeat] = useState(1);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beatCountRef = useRef(0);

  // Presets de BPM
  const bpmPresets = [
    { name: 'Lento', value: 60, color: 'bg-blue-500' },
    { name: 'Moderado', value: 90, color: 'bg-green-500' },
    { name: 'Medio', value: 120, color: 'bg-yellow-500' },
    { name: 'Rápido', value: 140, color: 'bg-orange-500' },
    { name: 'Muy Rápido', value: 180, color: 'bg-red-500' }
  ];

  // Compases
  const timeSignatures = [
    { name: '4/4', value: '4/4', beats: 4 },
    { name: '3/4', value: '3/4', beats: 3 },
    { name: '2/4', value: '2/4', beats: 2 },
    { name: '6/8', value: '6/8', beats: 6 }
  ];

  useEffect(() => {
    if (detectedBPM && detectedBPM !== bpm) {
      setBpm(detectedBPM);
    }
  }, [detectedBPM]);

  useEffect(() => {
    return () => {
      stopMetronome();
    };
  }, []);

  const detectBPM = async () => {
    if (!audioUrl) return;

    setIsDetecting(true);
    setDetectionProgress(0);

    // Simular detección de BPM (en producción sería una llamada al backend)
    for (let i = 0; i <= 100; i += 10) {
      setDetectionProgress(i);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Simular resultado
    const detectedBPM = Math.floor(Math.random() * 60) + 100; // 100-160 BPM
    setBpm(detectedBPM);
    setIsDetecting(false);
  };

  const startMetronome = () => {
    if (isPlaying) return;

    try {
      // Crear AudioContext si no existe
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const audioContext = audioContextRef.current;
      
      // Crear gain node para control de volumen
      if (!gainNodeRef.current) {
        gainNodeRef.current = audioContext.createGain();
        gainNodeRef.current.connect(audioContext.destination);
      }

      const gainNode = gainNodeRef.current;
      gainNode.gain.value = volume;

      // Calcular intervalo en milisegundos
      const intervalMs = (60 / bpm) * 1000;
      
      // Crear oscilador para el click
      const createClick = () => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        oscillator.connect(gain);
        gain.connect(gainNode);
        
        // Frecuencia diferente para el primer beat (acento)
        const isAccent = beatCountRef.current % parseInt(timeSignature.split('/')[0]) === 0;
        oscillator.frequency.value = isAccent ? 800 : 600;
        
        // Envelope para el click
        const now = audioContext.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        
        beatCountRef.current++;
      };

      // Iniciar inmediatamente
      createClick();
      
      // Programar clicks futuros
      intervalRef.current = setInterval(createClick, intervalMs);
      
      setIsPlaying(true);
    } catch (error) {
      console.error('Error starting metronome:', error);
    }
  };

  const stopMetronome = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
    
    beatCountRef.current = 0;
    setIsPlaying(false);
  };

  const resetMetronome = () => {
    stopMetronome();
    setBpm(detectedBPM || 120);
    setVolume(0.7);
    setTimeSignature('4/4');
    setAccentBeat(1);
  };

  const formatBPM = (bpm: number) => `${bpm} BPM`;

  const getBPMColor = (currentBPM: number) => {
    if (currentBPM < 80) return 'text-blue-400';
    if (currentBPM < 120) return 'text-green-400';
    if (currentBPM < 160) return 'text-orange-400';
    return 'text-red-400';
  };

  const BeatIndicator = () => {
    const beats = parseInt(timeSignature.split('/')[0]);
    const currentBeat = (beatCountRef.current % beats) + 1;
    
    return (
      <div className="flex justify-center space-x-2">
        {Array.from({ length: beats }, (_, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-200 ${
              i + 1 === currentBeat
                ? 'bg-primary-500 text-white scale-110'
                : i + 1 === accentBeat
                ? 'bg-gray-600 text-gray-300'
                : 'bg-gray-700 text-gray-400'
            }`}
          >
            {i + 1}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-dark-800 rounded-lg p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white flex items-center">
          <Target className="h-6 w-6 mr-2" />
          Metrónomo Inteligente
        </h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        )}
      </div>

      {/* BPM Detection */}
      {audioUrl && (
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white flex items-center mb-3">
            <Music className="h-5 w-5 mr-2" />
            Detección Automática de BPM
          </h3>
          
          {isDetecting ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-purple-200">
                <span>Analizando ritmo...</span>
                <span>{detectionProgress}%</span>
              </div>
              <div className="w-full bg-purple-800 rounded-full h-2">
                <div 
                  className="bg-white h-2 rounded-full transition-all duration-300"
                  style={{ width: `${detectionProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <span className="text-purple-200">BPM detectado:</span>
              <span className="text-white font-bold text-xl">{formatBPM(bpm)}</span>
              <button
                onClick={detectBPM}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Redetectar
              </button>
            </div>
          )}
        </div>
      )}

      {/* BPM Control */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <Clock className="h-5 w-5 mr-2" />
          Control de BPM
        </h3>
        
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-300">BPM actual:</span>
            <span className={`font-bold text-2xl ${getBPMColor(bpm)}`}>
              {formatBPM(bpm)}
            </span>
          </div>
          
          <input
            type="range"
            min="60"
            max="200"
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((bpm - 60) / 140) * 100}%, #374151 ${((bpm - 60) / 140) * 100}%, #374151 100%)`
            }}
          />
          
          <div className="flex justify-between text-xs text-gray-400">
            <span>60 BPM</span>
            <span>200 BPM</span>
          </div>
        </div>

        {/* BPM Presets */}
        <div className="space-y-2">
          <span className="text-sm text-gray-400">Presets de BPM:</span>
          <div className="grid grid-cols-3 gap-2">
            {bpmPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setBpm(preset.value)}
                className={`p-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                  Math.abs(bpm - preset.value) < 5
                    ? `${preset.color} text-white shadow-lg`
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Time Signature */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Compás</h3>
        <div className="grid grid-cols-4 gap-2">
          {timeSignatures.map((sig) => (
            <button
              key={sig.value}
              onClick={() => setTimeSignature(sig.value)}
              className={`p-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                timeSignature === sig.value
                  ? 'bg-primary-500 text-white shadow-lg'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {sig.name}
            </button>
          ))}
        </div>
      </div>

      {/* Volume Control */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <Volume2 className="h-5 w-5 mr-2" />
          Volumen
        </h3>
        <div className="flex items-center space-x-4">
          <span className="text-gray-300 text-sm">Silencioso</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
          <span className="text-gray-300 text-sm">Alto</span>
        </div>
      </div>

      {/* Beat Indicator */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Indicador de Compás</h3>
        <BeatIndicator />
      </div>

      {/* Controls */}
      <div className="flex justify-center space-x-4">
        <button
          onClick={isPlaying ? stopMetronome : startMetronome}
          className={`${
            isPlaying 
              ? 'bg-red-600 hover:bg-red-700' 
              : 'bg-green-600 hover:bg-green-700'
          } text-white px-8 py-3 rounded-lg flex items-center font-medium text-lg`}
        >
          {isPlaying ? <Pause className="h-5 w-5 mr-2" /> : <Play className="h-5 w-5 mr-2" />}
          {isPlaying ? 'Detener' : 'Iniciar'}
        </button>
        
        <button
          onClick={resetMetronome}
          className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg flex items-center font-medium"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reiniciar
        </button>
      </div>

      {/* Info */}
      <div className="text-xs text-gray-400 space-y-1">
        <div>🎵 <strong>Tip:</strong> El metrónomo se sincroniza automáticamente con el BPM detectado</div>
        <div>🎯 Usa el indicador de compás para mantener el ritmo</div>
      </div>
    </div>
  );
};

export default IntelligentMetronome;

