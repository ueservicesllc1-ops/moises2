/**
 * ChordAnalysis - Componente para análisis de acordes como Moises.ai
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Zap, Target, Loader2, Music } from 'lucide-react';
import ChordDiagram from './ChordDiagram';
import CoverFlow from './CoverFlow';
import { createMusicCovers } from './MusicCovers';
import PitchShifter from './PitchShifter';

interface Chord {
  chord: string;
  confidence: number;
  start_time: number;
  end_time: number;
  root_note: string;
  chord_type: string;
  measure_number?: number;
}

interface KeyInfo {
  key: string;
  mode: string;
  confidence: number;
  tonic: string;
}

interface ChordAnalysisProps {
  audioUrl: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeekTo?: (time: number) => void;
  showEQButton?: boolean;
  onEQClick?: () => void;
  onEQChange?: (bass: number, mid: number, treble: number) => void;
  audioElements?: { [key: string]: HTMLAudioElement };
  songBPM?: number;
  stems?: { [key: string]: string | undefined };
  songId?: string;
  songChords?: Chord[];
  songKeyInfo?: KeyInfo;
}

const ChordAnalysis: React.FC<ChordAnalysisProps> = ({
  audioUrl,
  currentTime,
  duration,
  isPlaying,
  onSeekTo,
  showEQButton = false,
  onEQClick,
  onEQChange,
  audioElements = {},
  songBPM,
  stems = {},
  songId,
  songChords,
  songKeyInfo
}) => {
  const [chords, setChords] = useState<Chord[]>(songChords || []);
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(songKeyInfo || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [selectedChord, setSelectedChord] = useState<Chord | null>(null);
  const [difficultyLevel, setDifficultyLevel] = useState<'easy' | 'medium' | 'advanced'>('easy');
  const [showCoverFlow, setShowCoverFlow] = useState(true);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Estados para EQ básico
  const [showBasicEQ, setShowBasicEQ] = useState(false);
  const [eqBass, setEqBass] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqTreble, setEqTreble] = useState(0);
  const [eqBypass, setEqBypass] = useState(false);
  const [cutBass, setCutBass] = useState(false);
  
  // Estados para EQ Pro (5 bandas)
  const [showEQPro, setShowEQPro] = useState(false);
  const [eqProBass, setEqProBass] = useState(0); // 60-250 Hz
  const [eqProLowMid, setEqProLowMid] = useState(0); // 250-500 Hz
  const [eqProMid, setEqProMid] = useState(0); // 500-2000 Hz
  const [eqProHighMid, setEqProHighMid] = useState(0); // 2000-4000 Hz
  const [eqProTreble, setEqProTreble] = useState(0); // 4000+ Hz
  const [eqProBypass, setEqProBypass] = useState(false);
  
  // Estados de power (encendido/apagado) para cada EQ
  const [eqBasicPower, setEqBasicPower] = useState(false);
  const [eqProPower, setEqProPower] = useState(false);
  
  // Estado para mostrar acordes en pantalla LED
  const [showChordsInLED, setShowChordsInLED] = useState(false);
  
  
  // Estados para BPM
  const [showBPMControl, setShowBPMControl] = useState(false);
  const [originalBPM, setOriginalBPM] = useState<number | null>(null);
  const [currentBPM, setCurrentBPM] = useState<number | null>(null);
  const [tempoMultiplier, setTempoMultiplier] = useState(1.0); // 1.0 = tempo original
  
  // Estados para descarga
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'mp3' | 'wav'>('mp3');
  const [selectedTracksForDownload, setSelectedTracksForDownload] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Estado para pitch shifter
  const [showPitchShifter, setShowPitchShifter] = useState(false);
  
  // Actualizar BPM original cuando cambia la canción
  useEffect(() => {
    if (songBPM && songBPM > 0) {
      setOriginalBPM(songBPM);
      setCurrentBPM(songBPM);
      setTempoMultiplier(1.0); // Resetear tempo al cambiar de canción
    } else {
      setOriginalBPM(null);
      setCurrentBPM(null);
    }
  }, [songBPM]);
  
  // Calcular BPM actual basado en el tempo multiplier
  useEffect(() => {
    if (originalBPM) {
      const newBPM = Math.round(originalBPM * tempoMultiplier);
      setCurrentBPM(newBPM);
    }
  }, [tempoMultiplier, originalBPM]);
  
  // Aplicar cambio de tempo a los audioElements
  useEffect(() => {
    if (audioElements && Object.keys(audioElements).length > 0) {
      Object.values(audioElements).forEach(audio => {
        audio.playbackRate = tempoMultiplier;
      });
    }
  }, [tempoMultiplier, audioElements]);
  
  // Presets de EQ basados en géneros musicales (valores en dB)
  const eqPresets = {
    flat: { bass: 0, lowMid: 0, mid: 0, highMid: 0, treble: 0 },
    rock: { bass: 4, lowMid: 2, mid: -2, highMid: 3, treble: 5 },
    pop: { bass: 3, lowMid: 1, mid: 2, highMid: 3, treble: 4 },
    jazz: { bass: 1, lowMid: 2, mid: 3, highMid: 1, treble: 2 },
    tropical: { bass: 6, lowMid: 3, mid: 1, highMid: 2, treble: 5 },
    electronic: { bass: 7, lowMid: 2, mid: -1, highMid: 3, treble: 6 },
    classical: { bass: 0, lowMid: 1, mid: 2, highMid: 1, treble: 1 },
    vocal: { bass: -3, lowMid: 0, mid: 4, highMid: 5, treble: 3 }
  };

  // Aplicar cambios del EQ al audio (EQ Basic)
  useEffect(() => {
    if (onEQChange) {
      // Si el EQ Basic está encendido y el bypass está activo, resetear
      if (eqBasicPower && eqBypass) {
        onEQChange(0, 0, 0);
      }
      // Solo aplicar si el EQ Basic está encendido (power on) y bypass OFF
      else if (eqBasicPower && !eqBypass) {
        const bassValue = cutBass ? -12 : eqBass;
        onEQChange(bassValue, eqMid, eqTreble);
      } 
      // Si ambos EQ están apagados, resetear a 0
      else if (!eqBasicPower && !eqProPower) {
        onEQChange(0, 0, 0);
      }
    }
  }, [eqBass, eqMid, eqTreble, eqBypass, cutBass, onEQChange, eqBasicPower, eqProPower]);

  // Aplicar cambios del EQ Pro al audio
  useEffect(() => {
    if (onEQChange) {
      // Si el EQ Pro está encendido y el bypass está activo, resetear
      if (eqProPower && eqProBypass) {
        onEQChange(0, 0, 0);
      }
      // Solo aplicar si el EQ Pro está encendido (power on) y bypass OFF
      else if (eqProPower && !eqProBypass) {
        const bassValue = cutBass ? -12 : eqProBass;
        const avgBass = (bassValue + eqProLowMid) / 2;
        const avgTreble = (eqProHighMid + eqProTreble) / 2;
        onEQChange(avgBass, eqProMid, avgTreble);
      } 
      // Si ambos EQ están apagados, resetear a 0
      else if (!eqBasicPower && !eqProPower) {
        onEQChange(0, 0, 0);
      }
    }
  }, [eqProBass, eqProLowMid, eqProMid, eqProHighMid, eqProTreble, eqProBypass, cutBass, onEQChange, eqProPower, eqBasicPower]);

  // Detectar acorde actual basado en el tiempo
  const getCurrentChord = (): Chord | null => {
    // Buscar el acorde que está activo en este momento
    const activeChord = chords.find(chord => 
      currentTime >= chord.start_time && currentTime <= chord.end_time
    );
    
    // Si no hay acorde activo, buscar el más cercano
    if (!activeChord) {
      // Buscar el siguiente acorde que va a empezar
      const nextChord = chords.find(chord => chord.start_time > currentTime);
      if (nextChord) {
        // Si estamos muy cerca del siguiente acorde (menos de 0.3s), mostrarlo como activo
        if (nextChord.start_time - currentTime <= 0.3) {
          return nextChord;
        }
      }
    }
    
    return activeChord || null;
  };

  // Los acordes ya vienen detectados desde el backend al separar la canción
  // No es necesario analizar de nuevo aquí

// Funciones para manejar los diferentes covers
const handleChordAnalysis = () => {
  // Desactivar otros modos
  if (showBasicEQ) {
    setShowBasicEQ(false);
  }
  if (showEQPro) {
    setShowEQPro(false);
  }
  if (showBPMControl) {
    setShowBPMControl(false);
  }
  if (showPitchShifter) {
    setShowPitchShifter(false);
  }
  // Solo alternar visibilidad de acordes - NO volver a analizar
  setShowChordsInLED(!showChordsInLED);
  console.log('Mostrando acordes en LED:', !showChordsInLED, 'Acordes disponibles:', chords.length);
};

const handleMetronome = () => {
  // Desactivar otros modos
  if (showBasicEQ) {
    setShowBasicEQ(false);
  }
  if (showBPMControl) {
    setShowBPMControl(false);
  }
  if (showChordsInLED) {
    setShowChordsInLED(false);
  }
  if (showPitchShifter) {
    setShowPitchShifter(false);
  }
  setShowEQPro(!showEQPro);
  console.log('EQ Pro activated');
};

const handleTimeRuler = () => {
  // Desactivar otros modos
  if (showEQPro) {
    setShowEQPro(false);
  }
  if (showBPMControl) {
    setShowBPMControl(false);
  }
  if (showChordsInLED) {
    setShowChordsInLED(false);
  }
  if (showPitchShifter) {
    setShowPitchShifter(false);
  }
  setShowBasicEQ(!showBasicEQ);
  console.log('EQ Basic activated');
};

const handlePitchShifterToggle = () => {
  // Desactivar otros modos
  if (showBasicEQ) {
    setShowBasicEQ(false);
  }
  if (showEQPro) {
    setShowEQPro(false);
  }
  if (showBPMControl) {
    setShowBPMControl(false);
  }
  if (showChordsInLED) {
    setShowChordsInLED(false);
  }
  setShowPitchShifter(!showPitchShifter);
  console.log('Pitch Shifter toggled');
};

// Función para aplicar presets de EQ
const applyEQPreset = (presetName: keyof typeof eqPresets) => {
  const preset = eqPresets[presetName];
  setEqProBass(preset.bass);
  setEqProLowMid(preset.lowMid);
  setEqProMid(preset.mid);
  setEqProHighMid(preset.highMid);
  setEqProTreble(preset.treble);
  console.log(`Preset ${presetName} aplicado:`, preset);
};

const handleAudioSeparation = () => {
  // Desactivar otros modos
  if (showBasicEQ) {
    setShowBasicEQ(false);
  }
  if (showEQPro) {
    setShowEQPro(false);
  }
  if (showChordsInLED) {
    setShowChordsInLED(false);
  }
  if (showPitchShifter) {
    setShowPitchShifter(false);
  }
  setShowBPMControl(!showBPMControl);
  console.log('BPM control activated');
};

const handleTempoChange = () => {
  setShowCoverFlow(false);
  setActiveFeature('tempo-change');
  // TODO: Implementar tempo change
  console.log('Tempo change feature activated');
};

const handlePitchChange = () => {
  setShowCoverFlow(false);
  setActiveFeature('pitch-change');
  console.log('Pitch change feature activated');
};

const handleVolumeControl = () => {
  setShowCoverFlow(false);
  setActiveFeature('volume-control');
  // TODO: Implementar volume control
  console.log('Volume control feature activated');
};

const handleRecording = () => {
  setShowCoverFlow(false);
  setActiveFeature('recording');
  // TODO: Implementar recording
  console.log('Recording feature activated');
};

const handleBeatEditor = () => {
  setShowCoverFlow(false);
  setActiveFeature('beat-editor');
  // TODO: Implementar beat editor
  console.log('Beat editor feature activated');
};

const handleClickTrack = () => {
  setShowCoverFlow(false);
  setActiveFeature('click-track');
  // TODO: Implementar click track
  console.log('Click track feature activated');
};

const handleIntelligentMetronome = () => {
  setShowCoverFlow(false);
  setActiveFeature('intelligent-metronome');
  // TODO: Implementar intelligent metronome
  console.log('Intelligent metronome feature activated');
};

const handleBpmDisplay = () => {
  setShowCoverFlow(false);
  setActiveFeature('bpm-display');
  // TODO: Implementar BPM display
  console.log('BPM display feature activated');
};

const backToCoverFlow = () => {
  setShowCoverFlow(true);
  setActiveFeature(null);
};

// Crear los covers con las funciones correspondientes
const musicCovers = createMusicCovers(
  handleChordAnalysis,
  handleMetronome,
  handleTimeRuler,
  handleAudioSeparation,
  handleTempoChange,
  handlePitchChange,
  handleVolumeControl,
  handleRecording,
  handleBeatEditor,
  handleClickTrack,
  handleBpmDisplay
);

// Generar diagrama de guitarra usando el componente ChordDiagram
const renderChordDiagram = (chord: Chord) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <ChordDiagram chord={chord.chord} size="medium" />
      
      {/* Información del acorde */}
      <div className="text-center">
        <div className="text-sm text-gray-300">
          {chord.root_note} {chord.chord_type}
        </div>
        <div className="text-xs text-gray-400">
          Confianza: {Math.round(chord.confidence * 100)}%
        </div>
      </div>
    </div>
  );
};

// Filtrar acordes por nivel de dificultad
const getFilteredChords = (): Chord[] => {
  if (difficultyLevel === 'easy') {
    // Solo acordes básicos (mayor, menor, 7ª)
    return chords.filter(chord => 
      !chord.chord_type.includes('dim') && 
      !chord.chord_type.includes('aug') &&
      !chord.chord_type.includes('sus')
    );
  } else if (difficultyLevel === 'medium') {
    // Acordes básicos + 7ª, sus, etc.
    return chords.filter(chord => 
      !chord.chord_type.includes('dim') && 
      !chord.chord_type.includes('aug')
    );
  }
  // Avanzado: todos los acordes
  return chords;
};

const currentChord = getCurrentChord();
const filteredChords = getFilteredChords();

// Scroll automático al acorde activo
useEffect(() => {
  if (currentChord && carouselRef.current) {
    const activeIndex = filteredChords.findIndex(chord => 
      chord.chord === currentChord.chord && 
      Math.abs(chord.start_time - currentChord.start_time) < 0.1
    );
    
    if (activeIndex !== -1) {
      const container = carouselRef.current;
      const activeElement = container.children[activeIndex] as HTMLElement;
      
      if (activeElement) {
        const containerRect = container.getBoundingClientRect();
        const elementRect = activeElement.getBoundingClientRect();
        const elementCenter = elementRect.left + elementRect.width / 2;
        const containerCenter = containerRect.left + containerRect.width / 2;
        
        const scrollLeft = container.scrollLeft + (elementCenter - containerCenter);
        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        });
      }
    }
  }
}, [currentChord, filteredChords]);

return (
  <div className="h-full flex flex-col">
    {/* Header */}
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-white text-lg font-semibold">
      </h3>
      <div className="flex items-center space-x-2">
        {!showCoverFlow && (
          <button
            onClick={backToCoverFlow}
            className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2"
          >
            <span>← Volver</span>
          </button>
        )}
        {activeFeature === 'chord-analysis' && (
          <>
            <select
              value={difficultyLevel}
              onChange={(e) => setDifficultyLevel(e.target.value as 'easy' | 'medium' | 'advanced')}
              className="bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600"
            >
              <option value="easy">Fácil</option>
              <option value="medium">Medio</option>
              <option value="advanced">Avanzado</option>
            </select>
            {keyInfo && (
              <div className="text-xs text-gray-300 bg-gray-700 px-2 py-1 rounded">
                <span className="text-gray-400">Tonalidad:</span>
                <span className="text-white font-medium ml-1">
                  {keyInfo.key} {keyInfo.mode === 'major' ? 'Mayor' : 'Menor'}
                </span>
              </div>
            )}
            <button
              onClick={() => console.log('Los acordes se detectan automáticamente al separar la canción')}
              disabled={true}
              className="bg-gray-600 text-gray-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analizando...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Analizar</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>

    {/* Professional Digital Mixer Interface */}
    {showCoverFlow ? (
        <div className="h-96 bg-black rounded-lg border border-gray-800 -m-4 relative overflow-hidden">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="w-full h-full" style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
          }} />
        </div>
        
        <div className="relative z-10 flex items-center justify-between h-full">
          {/* Left Side - LED Buttons */}
          <div className="flex flex-col space-y-2 w-36" style={{marginLeft: '10px'}}>
            {/* Row 1 */}
            <div className="flex flex-col space-y-2">
              <button 
                onClick={handleChordAnalysis}
                className={`w-32 h-8 border rounded hover:bg-opacity-80 transition-all duration-300 flex items-center justify-center ${
                  showChordsInLED
                    ? 'bg-cyan-700 border-cyan-500'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
                style={{
                  boxShadow: showChordsInLED
                    ? '0 0 12px rgba(34, 211, 238, 0.6), inset 0 0 10px rgba(34, 211, 238, 0.2)'
                    : '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className={`text-xs font-bold ${showChordsInLED ? 'text-white' : 'text-gray-400'}`}>Acordes</div>
              </button>
              <button 
                onClick={handleTimeRuler}
                className={`w-32 h-8 border rounded hover:bg-opacity-80 transition-all duration-300 flex items-center justify-center ${
                  showBasicEQ
                    ? 'bg-green-700 border-green-500'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
                style={{
                  boxShadow: showBasicEQ
                    ? '0 0 12px rgba(34, 197, 94, 0.6), inset 0 0 10px rgba(34, 197, 94, 0.2)'
                    : '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className={`text-xs font-bold ${showBasicEQ ? 'text-white' : 'text-gray-400'}`}>EQ Basic</div>
              </button>
              <button 
                onClick={handleMetronome}
                className={`w-32 h-8 border rounded hover:bg-opacity-80 transition-all duration-300 flex items-center justify-center ${
                  showEQPro
                    ? 'bg-purple-700 border-purple-500'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
                style={{
                  boxShadow: showEQPro
                    ? '0 0 12px rgba(147, 51, 234, 0.6), inset 0 0 10px rgba(147, 51, 234, 0.2)'
                    : '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className={`text-xs font-bold ${showEQPro ? 'text-white' : 'text-gray-400'}`}>EQ Pro</div>
              </button>
            </div>
            
            {/* Row 2 */}
            <div className="flex flex-col space-y-2">
              <button 
                onClick={handleAudioSeparation}
                className={`w-32 h-8 border rounded hover:bg-opacity-80 transition-all duration-300 flex items-center justify-center ${
                  showBPMControl
                    ? 'bg-yellow-700 border-yellow-500'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
                style={{
                  boxShadow: showBPMControl
                    ? '0 0 12px rgba(234, 179, 8, 0.6), inset 0 0 10px rgba(234, 179, 8, 0.2)'
                    : '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className={`text-xs font-bold ${showBPMControl ? 'text-white' : 'text-gray-400'}`}>BPM</div>
              </button>
            </div>
          </div>

          {/* LED Screen - Center */}
          <div className="flex justify-center flex-1">
            <div className="w-[85%] h-56 bg-black border-2 border-gray-600 rounded-lg relative overflow-hidden" 
                 style={{
                   background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                   boxShadow: 'inset 0 0 30px rgba(0, 255, 0, 0.1), 0 0 20px rgba(0, 255, 0, 0.2)'
                 }}>
              {/* LED Grid Pattern */}
              <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full" style={{
                  backgroundImage: `
                    linear-gradient(rgba(0, 255, 0, 0.1) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(0, 255, 0, 0.1) 1px, transparent 1px)
                  `,
                  backgroundSize: '8px 8px'
                }} />
              </div>
              
              {/* Screen Content */}
              <div className="relative z-10 h-full flex flex-col items-center justify-center p-4">
                {showBasicEQ ? (
                  /* EQ Básico con perillas estilo DJ */
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                      <div className="flex gap-6 items-center">
                      {/* Bass Knob */}
                      <div className="flex flex-col items-center">
                        {/* LED Label */}
                        <div 
                          className="relative px-3 py-1 mb-5"
                          style={{
                            background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                          }}
                        >
                          <div 
                            className="px-3 py-1"
                            style={{
                              background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                              border: '1px solid #002200'
                            }}
                          >
                            <div 
                              className="text-[10px] font-bold tracking-widest text-center"
                              style={{
                                color: '#00ff00',
                                textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                fontFamily: 'monospace',
                                letterSpacing: '0.2em'
                              }}
                            >
                              BASS 200Hz
                            </div>
                          </div>
                        </div>
                        
                        {/* Mini Knob */}
                        <div className="relative" style={{ width: 70, height: 70 }}>
                          {/* Outer Ring */}
                          <div 
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                            }}
                          />
                          
                          {/* Knob Body */}
                          <div
                            className="absolute inset-0 m-3 rounded-full cursor-pointer"
                            style={{
                              background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                              boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                              transform: `rotate(${((eqBass + 12) / 24) * 270 - 135}deg)`
                            }}
                            onMouseDown={(e) => {
                              const startY = e.clientY;
                              const startValue = eqBass;
                              
                              const handleMove = (moveEvent: MouseEvent) => {
                                const deltaY = startY - moveEvent.clientY;
                                const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                setEqBass(parseFloat(newValue.toFixed(1)));
                              };
                              
                              const handleUp = () => {
                                window.removeEventListener('mousemove', handleMove);
                                window.removeEventListener('mouseup', handleUp);
                              };
                              
                              window.addEventListener('mousemove', handleMove);
                              window.addEventListener('mouseup', handleUp);
                            }}
                          >
                            {/* Indicator */}
                            <div
                              className="absolute top-1 left-1/2 w-0.5 h-4 -ml-0.5 rounded-full"
                              style={{
                                background: 'linear-gradient(to bottom, #22c55e, #16a34a)',
                                boxShadow: '0 0 6px rgba(34, 197, 94, 0.8)'
                              }}
                            />
                          </div>
                          
                          {/* LED Ring */}
                          <div className="absolute -inset-2 pointer-events-none">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                              {Array.from({ length: 20 }).map((_, i) => {
                                const angle = (i / 20) * 270 - 135;
                                const rad = (angle * Math.PI) / 180;
                                const x = 50 + Math.cos(rad) * 48;
                                const y = 50 + Math.sin(rad) * 48;
                                const progress = (eqBass + 12) / 24;
                                const isActive = i < progress * 20;
                                let color = isActive ? '#22c55e' : '#374151';
                                
                                return (
                                  <circle
                                    key={i}
                                    cx={x}
                                    cy={y}
                                    r="1.5"
                                    fill={color}
                                    opacity={isActive ? 1 : 0.3}
                                  />
                                );
                              })}
                            </svg>
                          </div>
                        </div>
                        
                        {/* Value Display */}
                        <div className="text-[10px] font-bold text-green-400 mt-2 font-mono">
                          {eqBass > 0 ? '+' : ''}{eqBass} dB
                        </div>
                      </div>
                      
                      {/* Mid Knob */}
                      <div className="flex flex-col items-center">
                        <div 
                          className="relative px-3 py-1 mb-5"
                          style={{
                            background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                          }}
                        >
                          <div 
                            className="px-3 py-1"
                            style={{
                              background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                              border: '1px solid #002200'
                            }}
                          >
                            <div 
                              className="text-[10px] font-bold tracking-widest text-center"
                              style={{
                                color: '#00ff00',
                                textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                fontFamily: 'monospace',
                                letterSpacing: '0.2em'
                              }}
                            >
                              MID 1kHz
                            </div>
                          </div>
                        </div>
                        
                        <div className="relative" style={{ width: 70, height: 70 }}>
                          <div 
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                            }}
                          />
                          
                          <div
                            className="absolute inset-0 m-3 rounded-full cursor-pointer"
                            style={{
                              background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                              boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                              transform: `rotate(${((eqMid + 12) / 24) * 270 - 135}deg)`
                            }}
                            onMouseDown={(e) => {
                              const startY = e.clientY;
                              const startValue = eqMid;
                              
                              const handleMove = (moveEvent: MouseEvent) => {
                                const deltaY = startY - moveEvent.clientY;
                                const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                setEqMid(parseFloat(newValue.toFixed(1)));
                              };
                              
                              const handleUp = () => {
                                window.removeEventListener('mousemove', handleMove);
                                window.removeEventListener('mouseup', handleUp);
                              };
                              
                              window.addEventListener('mousemove', handleMove);
                              window.addEventListener('mouseup', handleUp);
                            }}
                          >
                            <div
                              className="absolute top-1 left-1/2 w-0.5 h-4 -ml-0.5 rounded-full"
                              style={{
                                background: 'linear-gradient(to bottom, #eab308, #ca8a04)',
                                boxShadow: '0 0 6px rgba(234, 179, 8, 0.8)'
                              }}
                            />
                          </div>
                          
                          <div className="absolute -inset-2 pointer-events-none">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                              {Array.from({ length: 20 }).map((_, i) => {
                                const angle = (i / 20) * 270 - 135;
                                const rad = (angle * Math.PI) / 180;
                                const x = 50 + Math.cos(rad) * 48;
                                const y = 50 + Math.sin(rad) * 48;
                                const progress = (eqMid + 12) / 24;
                                const isActive = i < progress * 20;
                                let color = isActive ? '#eab308' : '#374151';
                                
                                return (
                                  <circle
                                    key={i}
                                    cx={x}
                                    cy={y}
                                    r="1.5"
                                    fill={color}
                                    opacity={isActive ? 1 : 0.3}
                                  />
                                );
                              })}
                            </svg>
                          </div>
                        </div>
                        
                        <div className="text-[10px] font-bold text-green-400 mt-2 font-mono">
                          {eqMid > 0 ? '+' : ''}{eqMid} dB
                        </div>
                      </div>
                      
                      {/* Treble Knob */}
                      <div className="flex flex-col items-center">
                        <div 
                          className="relative px-3 py-1 mb-5"
                          style={{
                            background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                          }}
                        >
                          <div 
                            className="px-3 py-1"
                            style={{
                              background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                              border: '1px solid #002200'
                            }}
                          >
                            <div 
                              className="text-[10px] font-bold tracking-widest text-center"
                              style={{
                                color: '#00ff00',
                                textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                fontFamily: 'monospace',
                                letterSpacing: '0.2em'
                              }}
                            >
                              TREBLE 3kHz
                            </div>
                          </div>
                        </div>
                        
                        <div className="relative" style={{ width: 70, height: 70 }}>
                          <div 
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                            }}
                          />
                          
                          <div
                            className="absolute inset-0 m-3 rounded-full cursor-pointer"
                            style={{
                              background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                              boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                              transform: `rotate(${((eqTreble + 12) / 24) * 270 - 135}deg)`
                            }}
                            onMouseDown={(e) => {
                              const startY = e.clientY;
                              const startValue = eqTreble;
                              
                              const handleMove = (moveEvent: MouseEvent) => {
                                const deltaY = startY - moveEvent.clientY;
                                const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                setEqTreble(parseFloat(newValue.toFixed(1)));
                              };
                              
                              const handleUp = () => {
                                window.removeEventListener('mousemove', handleMove);
                                window.removeEventListener('mouseup', handleUp);
                              };
                              
                              window.addEventListener('mousemove', handleMove);
                              window.addEventListener('mouseup', handleUp);
                            }}
                          >
                            <div
                              className="absolute top-1 left-1/2 w-0.5 h-4 -ml-0.5 rounded-full"
                              style={{
                                background: 'linear-gradient(to bottom, #3b82f6, #1d4ed8)',
                                boxShadow: '0 0 6px rgba(59, 130, 246, 0.8)'
                              }}
                            />
                          </div>
                          
                          <div className="absolute -inset-2 pointer-events-none">
                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                              {Array.from({ length: 20 }).map((_, i) => {
                                const angle = (i / 20) * 270 - 135;
                                const rad = (angle * Math.PI) / 180;
                                const x = 50 + Math.cos(rad) * 48;
                                const y = 50 + Math.sin(rad) * 48;
                                const progress = (eqTreble + 12) / 24;
                                const isActive = i < progress * 20;
                                let color = isActive ? '#3b82f6' : '#374151';
                                
                                return (
                                  <circle
                                    key={i}
                                    cx={x}
                                    cy={y}
                                    r="1.5"
                                    fill={color}
                                    opacity={isActive ? 1 : 0.3}
                                  />
                                );
                              })}
                            </svg>
                          </div>
                        </div>
                        
                        <div className="text-[10px] font-bold text-green-400 mt-2 font-mono">
                          {eqTreble > 0 ? '+' : ''}{eqTreble} dB
                        </div>
                      </div>
                    </div>
                    
                    {/* Botones de control */}
                    <div className="flex gap-3">
                      {/* Botón Power */}
                      <button
                        onClick={() => {
                          if (!eqBasicPower) {
                            // Apagar EQ Pro si está encendido
                            setEqProPower(false);
                          }
                          setEqBasicPower(!eqBasicPower);
                        }}
                        className={`px-6 py-2 rounded font-bold text-xs transition-all duration-300 ${
                          eqBasicPower
                            ? 'bg-green-700 border-green-500 text-white'
                            : 'bg-gray-700 border-gray-500 text-gray-300'
                        }`}
                        style={{
                          border: '2px solid',
                          boxShadow: eqBasicPower
                            ? '0 0 12px rgba(34, 197, 94, 0.6), inset 0 0 10px rgba(34, 197, 94, 0.2)'
                            : '0 0 8px rgba(107, 114, 128, 0.4)',
                          textShadow: eqBasicPower ? '0 0 8px rgba(255, 255, 255, 0.8)' : 'none'
                        }}
                      >
                        {eqBasicPower ? 'POWER ON' : 'POWER OFF'}
                      </button>
                      
                      {/* Botón Bypass */}
                      <button
                        onClick={() => setEqBypass(!eqBypass)}
                        className={`px-6 py-2 rounded font-bold text-xs transition-all duration-300 ${
                          eqBypass
                            ? 'bg-red-700 border-red-500 text-white'
                            : 'bg-gray-700 border-gray-500 text-gray-300'
                        }`}
                        style={{
                          border: '2px solid',
                          boxShadow: eqBypass
                            ? '0 0 12px rgba(239, 68, 68, 0.6), inset 0 0 10px rgba(239, 68, 68, 0.2)'
                            : '0 0 8px rgba(107, 114, 128, 0.4)',
                          textShadow: eqBypass ? '0 0 8px rgba(255, 255, 255, 0.8)' : 'none'
                        }}
                      >
                        {eqBypass ? 'BYPASS ON' : 'BYPASS OFF'}
                      </button>
                    </div>
                  </div>
                  </div>
                ) : showEQPro ? (
                  /* EQ Pro con 5 bandas */
                  <div className="w-full h-full flex items-center justify-center overflow-x-auto">
                    <div className="flex items-center gap-6">
                      {/* Botones a la izquierda verticalmente */}
                      <div className="flex flex-col gap-3">
                        {/* Botón Power */}
                        <button
                          onClick={() => {
                            if (!eqProPower) {
                              // Apagar EQ Basic si está encendido
                              setEqBasicPower(false);
                            }
                            setEqProPower(!eqProPower);
                          }}
                          className={`px-6 py-2 rounded font-bold text-xs transition-all duration-300 ${
                            eqProPower
                              ? 'bg-green-700 border-green-500 text-white'
                              : 'bg-gray-700 border-gray-500 text-gray-300'
                          }`}
                          style={{
                            border: '2px solid',
                            boxShadow: eqProPower
                              ? '0 0 12px rgba(34, 197, 94, 0.6), inset 0 0 10px rgba(34, 197, 94, 0.2)'
                              : '0 0 8px rgba(107, 114, 128, 0.4)',
                            textShadow: eqProPower ? '0 0 8px rgba(255, 255, 255, 0.8)' : 'none'
                          }}
                        >
                          {eqProPower ? 'POWER ON' : 'POWER OFF'}
                        </button>
                        
                        {/* Botón Reset */}
                        <button
                          onClick={() => {
                            setEqProBass(0);
                            setEqProLowMid(0);
                            setEqProMid(0);
                            setEqProHighMid(0);
                            setEqProTreble(0);
                            setCutBass(false);
                          }}
                          className="px-6 py-2 rounded font-bold text-xs transition-all duration-300 bg-gray-700 border-gray-500 text-gray-300 hover:bg-gray-600"
                          style={{
                            border: '2px solid',
                            boxShadow: '0 0 8px rgba(107, 114, 128, 0.4)'
                          }}
                        >
                          RESET
                        </button>
                        
                        {/* Botón Cut Bass */}
                        <button
                          onClick={() => setCutBass(!cutBass)}
                          className={`px-6 py-2 rounded font-bold text-xs transition-all duration-300 ${
                            cutBass
                              ? 'bg-orange-700 border-orange-500 text-white'
                              : 'bg-gray-700 border-gray-500 text-gray-300'
                          }`}
                          style={{
                            border: '2px solid',
                            boxShadow: cutBass
                              ? '0 0 12px rgba(249, 115, 22, 0.6), inset 0 0 10px rgba(249, 115, 22, 0.2)'
                              : '0 0 8px rgba(107, 114, 128, 0.4)',
                            textShadow: cutBass ? '0 0 8px rgba(255, 255, 255, 0.8)' : 'none'
                          }}
                        >
                          CUT BASS
                        </button>
                        
                      </div>
                      
                      {/* Perillas centradas */}
                      <div className="flex gap-6 items-center">
                        {/* Bass Knob - 60Hz */}
                        <div className="flex flex-col items-center">
                          <div 
                            className="relative px-3 py-1 mb-5"
                            style={{
                              background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                            }}
                          >
                            <div 
                              className="px-3 py-1"
                              style={{
                                background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                                border: '1px solid #002200'
                              }}
                            >
                              <div 
                                className="text-[10px] font-bold tracking-widest text-center"
                                style={{
                                  color: '#00ff00',
                                  textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2em'
                                }}
                              >
                                BASS 60Hz
                              </div>
                            </div>
                          </div>
                          
                          {/* Mini Knob */}
                          <div className="relative" style={{ width: 70, height: 70 }}>
                            <div 
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                              }}
                            />
                            
                            <div
                              className="absolute inset-0 m-3 rounded-full cursor-pointer"
                              style={{
                                background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                                transform: `rotate(${((eqProBass + 12) / 24) * 270 - 135}deg)`
                              }}
                              onMouseDown={(e) => {
                                const startY = e.clientY;
                                const startValue = eqProBass;
                                
                                const handleMove = (moveEvent: MouseEvent) => {
                                  const deltaY = startY - moveEvent.clientY;
                                  const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                  setEqProBass(parseFloat(newValue.toFixed(1)));
                                };
                                
                                const handleUp = () => {
                                  window.removeEventListener('mousemove', handleMove);
                                  window.removeEventListener('mouseup', handleUp);
                                };
                                
                                window.addEventListener('mousemove', handleMove);
                                window.addEventListener('mouseup', handleUp);
                              }}
                            >
                              <div
                                className="absolute top-1 left-1/2 w-0.5 h-3 -ml-0.5 rounded-full"
                                style={{
                                  background: 'linear-gradient(to bottom, #22c55e, #16a34a)',
                                  boxShadow: '0 0 6px rgba(34, 197, 94, 0.8)'
                                }}
                              />
                            </div>
                            
                            <div className="absolute -inset-1.5 pointer-events-none">
                              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                {Array.from({ length: 15 }).map((_, i) => {
                                  const angle = (i / 15) * 270 - 135;
                                  const rad = (angle * Math.PI) / 180;
                                  const x = 50 + Math.cos(rad) * 48;
                                  const y = 50 + Math.sin(rad) * 48;
                                  const progress = (eqProBass + 12) / 24;
                                  const isActive = i < progress * 15;
                                  let color = isActive ? '#22c55e' : '#374151';
                                  
                                  return (
                                    <circle
                                      key={i}
                                      cx={x}
                                      cy={y}
                                      r="1.2"
                                      fill={color}
                                      opacity={isActive ? 1 : 0.3}
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                          </div>
                          
                          <div className="text-[8px] font-bold text-green-400 mt-1 font-mono">
                            {eqProBass > 0 ? '+' : ''}{eqProBass} dB
                          </div>
                        </div>
                        
                        {/* Low Mid Knob - 250Hz */}
                        <div className="flex flex-col items-center">
                          <div 
                            className="relative px-3 py-1 mb-5"
                            style={{
                              background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                            }}
                          >
                            <div 
                              className="px-3 py-1"
                              style={{
                                background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                                border: '1px solid #002200'
                              }}
                            >
                              <div 
                                className="text-[10px] font-bold tracking-widest text-center"
                                style={{
                                  color: '#00ff00',
                                  textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2em'
                                }}
                              >
                                LOW-M 250Hz
                              </div>
                            </div>
                          </div>
                          
                          <div className="relative" style={{ width: 70, height: 70 }}>
                            <div 
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                              }}
                            />
                            
                            <div
                              className="absolute inset-0 m-3 rounded-full cursor-pointer"
                              style={{
                                background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                                transform: `rotate(${((eqProLowMid + 12) / 24) * 270 - 135}deg)`
                              }}
                              onMouseDown={(e) => {
                                const startY = e.clientY;
                                const startValue = eqProLowMid;
                                
                                const handleMove = (moveEvent: MouseEvent) => {
                                  const deltaY = startY - moveEvent.clientY;
                                  const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                  setEqProLowMid(parseFloat(newValue.toFixed(1)));
                                };
                                
                                const handleUp = () => {
                                  window.removeEventListener('mousemove', handleMove);
                                  window.removeEventListener('mouseup', handleUp);
                                };
                                
                                window.addEventListener('mousemove', handleMove);
                                window.addEventListener('mouseup', handleUp);
                              }}
                            >
                              <div
                                className="absolute top-1 left-1/2 w-0.5 h-3 -ml-0.5 rounded-full"
                                style={{
                                  background: 'linear-gradient(to bottom, #84cc16, #65a30d)',
                                  boxShadow: '0 0 6px rgba(132, 204, 22, 0.8)'
                                }}
                              />
                            </div>
                            
                            <div className="absolute -inset-1.5 pointer-events-none">
                              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                {Array.from({ length: 15 }).map((_, i) => {
                                  const angle = (i / 15) * 270 - 135;
                                  const rad = (angle * Math.PI) / 180;
                                  const x = 50 + Math.cos(rad) * 48;
                                  const y = 50 + Math.sin(rad) * 48;
                                  const progress = (eqProLowMid + 12) / 24;
                                  const isActive = i < progress * 15;
                                  let color = isActive ? '#84cc16' : '#374151';
                                  
                                  return (
                                    <circle
                                      key={i}
                                      cx={x}
                                      cy={y}
                                      r="1.2"
                                      fill={color}
                                      opacity={isActive ? 1 : 0.3}
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                          </div>
                          
                          <div className="text-[8px] font-bold text-green-400 mt-1 font-mono">
                            {eqProLowMid > 0 ? '+' : ''}{eqProLowMid} dB
                          </div>
                        </div>
                        
                        {/* Mid Knob - 1kHz */}
                        <div className="flex flex-col items-center">
                          <div 
                            className="relative px-3 py-1 mb-5"
                            style={{
                              background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                            }}
                          >
                            <div 
                              className="px-3 py-1"
                              style={{
                                background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                                border: '1px solid #002200'
                              }}
                            >
                              <div 
                                className="text-[10px] font-bold tracking-widest text-center"
                                style={{
                                  color: '#00ff00',
                                  textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2em'
                                }}
                              >
                                MID 1kHz
                              </div>
                            </div>
                          </div>
                          
                          <div className="relative" style={{ width: 70, height: 70 }}>
                            <div 
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                              }}
                            />
                            
                            <div
                              className="absolute inset-0 m-3 rounded-full cursor-pointer"
                              style={{
                                background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                                transform: `rotate(${((eqProMid + 12) / 24) * 270 - 135}deg)`
                              }}
                              onMouseDown={(e) => {
                                const startY = e.clientY;
                                const startValue = eqProMid;
                                
                                const handleMove = (moveEvent: MouseEvent) => {
                                  const deltaY = startY - moveEvent.clientY;
                                  const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                  setEqProMid(parseFloat(newValue.toFixed(1)));
                                };
                                
                                const handleUp = () => {
                                  window.removeEventListener('mousemove', handleMove);
                                  window.removeEventListener('mouseup', handleUp);
                                };
                                
                                window.addEventListener('mousemove', handleMove);
                                window.addEventListener('mouseup', handleUp);
                              }}
                            >
                              <div
                                className="absolute top-1 left-1/2 w-0.5 h-3 -ml-0.5 rounded-full"
                                style={{
                                  background: 'linear-gradient(to bottom, #eab308, #ca8a04)',
                                  boxShadow: '0 0 6px rgba(234, 179, 8, 0.8)'
                                }}
                              />
                            </div>
                            
                            <div className="absolute -inset-1.5 pointer-events-none">
                              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                {Array.from({ length: 15 }).map((_, i) => {
                                  const angle = (i / 15) * 270 - 135;
                                  const rad = (angle * Math.PI) / 180;
                                  const x = 50 + Math.cos(rad) * 48;
                                  const y = 50 + Math.sin(rad) * 48;
                                  const progress = (eqProMid + 12) / 24;
                                  const isActive = i < progress * 15;
                                  let color = isActive ? '#eab308' : '#374151';
                                  
                                  return (
                                    <circle
                                      key={i}
                                      cx={x}
                                      cy={y}
                                      r="1.2"
                                      fill={color}
                                      opacity={isActive ? 1 : 0.3}
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                          </div>
                          
                          <div className="text-[8px] font-bold text-green-400 mt-1 font-mono">
                            {eqProMid > 0 ? '+' : ''}{eqProMid} dB
                          </div>
                        </div>
                        
                        {/* High Mid Knob - 2kHz */}
                        <div className="flex flex-col items-center">
                          <div 
                            className="relative px-3 py-1 mb-5"
                            style={{
                              background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                            }}
                          >
                            <div 
                              className="px-3 py-1"
                              style={{
                                background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                                border: '1px solid #002200'
                              }}
                            >
                              <div 
                                className="text-[10px] font-bold tracking-widest text-center"
                                style={{
                                  color: '#00ff00',
                                  textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2em'
                                }}
                              >
                                HI-M 2kHz
                              </div>
                            </div>
                          </div>
                          
                          <div className="relative" style={{ width: 70, height: 70 }}>
                            <div 
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                              }}
                            />
                            
                            <div
                              className="absolute inset-0 m-3 rounded-full cursor-pointer"
                              style={{
                                background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                                transform: `rotate(${((eqProHighMid + 12) / 24) * 270 - 135}deg)`
                              }}
                              onMouseDown={(e) => {
                                const startY = e.clientY;
                                const startValue = eqProHighMid;
                                
                                const handleMove = (moveEvent: MouseEvent) => {
                                  const deltaY = startY - moveEvent.clientY;
                                  const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                  setEqProHighMid(parseFloat(newValue.toFixed(1)));
                                };
                                
                                const handleUp = () => {
                                  window.removeEventListener('mousemove', handleMove);
                                  window.removeEventListener('mouseup', handleUp);
                                };
                                
                                window.addEventListener('mousemove', handleMove);
                                window.addEventListener('mouseup', handleUp);
                              }}
                            >
                              <div
                                className="absolute top-1 left-1/2 w-0.5 h-3 -ml-0.5 rounded-full"
                                style={{
                                  background: 'linear-gradient(to bottom, #f97316, #ea580c)',
                                  boxShadow: '0 0 6px rgba(249, 115, 22, 0.8)'
                                }}
                              />
                            </div>
                            
                            <div className="absolute -inset-1.5 pointer-events-none">
                              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                {Array.from({ length: 15 }).map((_, i) => {
                                  const angle = (i / 15) * 270 - 135;
                                  const rad = (angle * Math.PI) / 180;
                                  const x = 50 + Math.cos(rad) * 48;
                                  const y = 50 + Math.sin(rad) * 48;
                                  const progress = (eqProHighMid + 12) / 24;
                                  const isActive = i < progress * 15;
                                  let color = isActive ? '#f97316' : '#374151';
                                  
                                  return (
                                    <circle
                                      key={i}
                                      cx={x}
                                      cy={y}
                                      r="1.2"
                                      fill={color}
                                      opacity={isActive ? 1 : 0.3}
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                          </div>
                          
                          <div className="text-[8px] font-bold text-green-400 mt-1 font-mono">
                            {eqProHighMid > 0 ? '+' : ''}{eqProHighMid} dB
                          </div>
                        </div>
                        
                        {/* Treble Knob - 8kHz */}
                        <div className="flex flex-col items-center">
                          <div 
                            className="relative px-3 py-1 mb-5"
                            style={{
                              background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
                              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.6)'
                            }}
                          >
                            <div 
                              className="px-3 py-1"
                              style={{
                                background: 'linear-gradient(180deg, #001a00 0%, #003300 50%, #001a00 100%)',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.9)',
                                border: '1px solid #002200'
                              }}
                            >
                              <div 
                                className="text-[10px] font-bold tracking-widest text-center"
                                style={{
                                  color: '#00ff00',
                                  textShadow: '0 0 8px rgba(0,255,0,0.8)',
                                  fontFamily: 'monospace',
                                  letterSpacing: '0.2em'
                                }}
                              >
                                TREBLE 8kHz
                              </div>
                            </div>
                          </div>
                          
                          <div className="relative" style={{ width: 70, height: 70 }}>
                            <div 
                              className="absolute inset-0 rounded-full"
                              style={{
                                background: 'linear-gradient(135deg, #374151 0%, #1f2937 50%, #111827 100%)',
                                boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.1), 0 4px 8px rgba(0,0,0,0.6)'
                              }}
                            />
                            
                            <div
                              className="absolute inset-0 m-3 rounded-full cursor-pointer"
                              style={{
                                background: 'radial-gradient(circle at 30% 30%, #374151, #1f2937 60%, #111827)',
                                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.4)',
                                transform: `rotate(${((eqProTreble + 12) / 24) * 270 - 135}deg)`
                              }}
                              onMouseDown={(e) => {
                                const startY = e.clientY;
                                const startValue = eqProTreble;
                                
                                const handleMove = (moveEvent: MouseEvent) => {
                                  const deltaY = startY - moveEvent.clientY;
                                  const newValue = Math.max(-12, Math.min(12, startValue + deltaY * 0.15));
                                  setEqProTreble(parseFloat(newValue.toFixed(1)));
                                };
                                
                                const handleUp = () => {
                                  window.removeEventListener('mousemove', handleMove);
                                  window.removeEventListener('mouseup', handleUp);
                                };
                                
                                window.addEventListener('mousemove', handleMove);
                                window.addEventListener('mouseup', handleUp);
                              }}
                            >
                              <div
                                className="absolute top-1 left-1/2 w-0.5 h-3 -ml-0.5 rounded-full"
                                style={{
                                  background: 'linear-gradient(to bottom, #3b82f6, #1d4ed8)',
                                  boxShadow: '0 0 6px rgba(59, 130, 246, 0.8)'
                                }}
                              />
                            </div>
                            
                            <div className="absolute -inset-1.5 pointer-events-none">
                              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                {Array.from({ length: 15 }).map((_, i) => {
                                  const angle = (i / 15) * 270 - 135;
                                  const rad = (angle * Math.PI) / 180;
                                  const x = 50 + Math.cos(rad) * 48;
                                  const y = 50 + Math.sin(rad) * 48;
                                  const progress = (eqProTreble + 12) / 24;
                                  const isActive = i < progress * 15;
                                  let color = isActive ? '#3b82f6' : '#374151';
                                  
                                  return (
                                    <circle
                                      key={i}
                                      cx={x}
                                      cy={y}
                                      r="1.2"
                                      fill={color}
                                      opacity={isActive ? 1 : 0.3}
                                    />
                                  );
                                })}
                              </svg>
                            </div>
                          </div>
                          
                          <div className="text-[8px] font-bold text-green-400 mt-1 font-mono">
                            {eqProTreble > 0 ? '+' : ''}{eqProTreble} dB
                          </div>
                        </div>
                      </div>
                      
                      {/* Botones de Presets a la derecha - 2 columnas verticales */}
                      <div className="flex flex-col gap-2 ml-4">
                        <div className="text-green-400 text-[10px] font-mono font-bold text-center mb-1">PRESETS</div>
                        
                        <div className="flex gap-2">
                          {/* Primera columna */}
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => applyEQPreset('flat')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-gray-500 text-gray-300 hover:bg-gray-600"
                              style={{
                                boxShadow: '0 0 8px rgba(107, 114, 128, 0.4)'
                              }}
                            >
                              FLAT
                            </button>
                            
                            <button
                              onClick={() => applyEQPreset('rock')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-red-500 text-red-300 hover:bg-red-900"
                              style={{
                                boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)'
                              }}
                            >
                              ROCK
                            </button>
                            
                            <button
                              onClick={() => applyEQPreset('pop')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-pink-500 text-pink-300 hover:bg-pink-900"
                              style={{
                                boxShadow: '0 0 8px rgba(236, 72, 153, 0.3)'
                              }}
                            >
                              POP
                            </button>
                            
                            <button
                              onClick={() => applyEQPreset('jazz')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-blue-500 text-blue-300 hover:bg-blue-900"
                              style={{
                                boxShadow: '0 0 8px rgba(59, 130, 246, 0.3)'
                              }}
                            >
                              JAZZ
                            </button>
                          </div>
                          
                          {/* Segunda columna */}
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => applyEQPreset('tropical')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-yellow-500 text-yellow-300 hover:bg-yellow-900"
                              style={{
                                boxShadow: '0 0 8px rgba(234, 179, 8, 0.3)'
                              }}
                            >
                              TROPICAL
                            </button>
                            
                            <button
                              onClick={() => applyEQPreset('electronic')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-purple-500 text-purple-300 hover:bg-purple-900"
                              style={{
                                boxShadow: '0 0 8px rgba(168, 85, 247, 0.3)'
                              }}
                            >
                              EDM
                            </button>
                            
                            <button
                              onClick={() => applyEQPreset('classical')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-cyan-500 text-cyan-300 hover:bg-cyan-900"
                              style={{
                                boxShadow: '0 0 8px rgba(34, 211, 238, 0.3)'
                              }}
                            >
                              CLASSICAL
                            </button>
                            
                            <button
                              onClick={() => applyEQPreset('vocal')}
                              className="px-3 py-1.5 rounded font-bold text-[10px] transition-all duration-300 bg-gray-700 border border-green-500 text-green-300 hover:bg-green-900"
                              style={{
                                boxShadow: '0 0 8px rgba(34, 197, 94, 0.3)'
                              }}
                            >
                              VOCAL
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : showChordsInLED ? (
                  /* Acordes en pantalla LED */
                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    {isAnalyzing && (
                      <div className="text-green-400 text-lg font-mono font-bold mb-4">
                        ANALIZANDO...
                      </div>
                    )}
                    
                    {isAnalyzing ? (
                      <div className="w-full px-8">
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-green-400 h-2 rounded-full transition-all duration-300"
                            style={{ 
                              width: `${analysisProgress}%`,
                              boxShadow: '0 0 8px rgba(34, 197, 94, 0.8)'
                            }}
                          ></div>
                        </div>
                        <div className="text-green-400 text-xs font-mono text-center mt-2">
                          {analysisProgress}%
                        </div>
                      </div>
                    ) : chords.length > 0 ? (
                      (() => {
                        // Encontrar índice del acorde actual
                        const currentIndex = chords.findIndex(chord => 
                          currentTime >= chord.start_time && currentTime <= chord.end_time
                        );
                        
                        // Si no hay acorde en currentTime, buscar el más cercano
                        const fallbackIndex = currentIndex >= 0 ? currentIndex : 
                          chords.findIndex(chord => chord.start_time > currentTime) - 1;
                        
                        const activeIndex = currentIndex >= 0 ? currentIndex : Math.max(0, fallbackIndex);
                        
                        const previous2Chord = activeIndex > 1 ? chords[activeIndex - 2] : null;
                        const previousChord = activeIndex > 0 ? chords[activeIndex - 1] : null;
                        const currentChordToShow = chords[activeIndex] || null;
                        const nextChord = activeIndex < chords.length - 1 ? chords[activeIndex + 1] : null;
                        const next2Chord = activeIndex < chords.length - 2 ? chords[activeIndex + 2] : null;
                        
                        return (
                          <div className="w-full h-full flex items-center justify-center gap-2 px-2 md:gap-4 md:px-4 overflow-hidden">
                            {/* Acorde -2 (más lejano izquierda) */}
                            <div className="flex w-[14%] min-w-0 flex-col items-center opacity-25">
                              <div 
                                className="w-full truncate text-center font-mono font-bold leading-none text-green-400 text-[clamp(0.9rem,2.3vw,2rem)]"
                                style={{
                                  textShadow: '0 0 6px rgba(34, 197, 94, 0.2)'
                                }}
                              >
                                {previous2Chord ? previous2Chord.chord : '--'}
                              </div>
                            </div>
                            
                            {/* Acorde -1 (izquierda) */}
                            <div className="flex w-[18%] min-w-0 flex-col items-center opacity-50">
                              <div 
                                className="w-full truncate text-center font-mono font-bold leading-none text-green-400 text-[clamp(1rem,2.9vw,2.6rem)]"
                                style={{
                                  textShadow: '0 0 10px rgba(34, 197, 94, 0.4)'
                                }}
                              >
                                {previousChord ? previousChord.chord : '--'}
                              </div>
                            </div>
                            
                            {/* Acorde actual (centro) */}
                            <div className="flex w-[36%] min-w-0 flex-col items-center">
                              <div 
                                className="w-full truncate text-center font-mono font-bold leading-none text-green-400 text-[clamp(1.5rem,5.6vw,4.9rem)]"
                                style={{
                                  textShadow: '0 0 20px rgba(34, 197, 94, 0.8), 0 0 10px rgba(34, 197, 94, 0.5)'
                                }}
                              >
                                {currentChordToShow ? currentChordToShow.chord : '--'}
                              </div>
                              
                              {/* Tonalidad compacta */}
                              {keyInfo && (
                                <div className="bg-gray-900 border border-green-500 rounded px-3 py-0.5 mt-3">
                                  <div className="text-green-400 text-xs font-mono">
                                    {keyInfo.key} {keyInfo.mode === 'major' ? 'MAY' : 'MEN'}
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            {/* Acorde +1 (derecha) */}
                            <div className="flex w-[18%] min-w-0 flex-col items-center opacity-50">
                              <div 
                                className="w-full truncate text-center font-mono font-bold leading-none text-green-400 text-[clamp(1rem,2.9vw,2.6rem)]"
                                style={{
                                  textShadow: '0 0 10px rgba(34, 197, 94, 0.4)'
                                }}
                              >
                                {nextChord ? nextChord.chord : '--'}
                              </div>
                            </div>
                            
                            {/* Acorde +2 (más lejano derecha) */}
                            <div className="flex w-[14%] min-w-0 flex-col items-center opacity-25">
                              <div 
                                className="w-full truncate text-center font-mono font-bold leading-none text-green-400 text-[clamp(0.9rem,2.3vw,2rem)]"
                                style={{
                                  textShadow: '0 0 6px rgba(34, 197, 94, 0.2)'
                                }}
                              >
                                {next2Chord ? next2Chord.chord : '--'}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <div className="text-green-300 text-sm font-mono text-center">
                          NO HAY ACORDES DETECTADOS
                        </div>
                        <button
                          onClick={() => console.log('Los acordes se detectan automáticamente al separar la canción')}
                          disabled={true}
                          className="bg-gray-800 text-gray-600 px-6 py-2 rounded text-xs font-mono cursor-not-allowed"
                          style={{
                            border: '1px solid rgba(34, 197, 94, 0.5)',
                            boxShadow: '0 0 8px rgba(34, 197, 94, 0.3)'
                          }}
                        >
                          ANALIZAR ACORDES
                        </button>
                      </div>
                    )}
                  </div>
                ) : showBPMControl ? (
                  /* Control de BPM */
                  <div className="w-full h-full flex items-center justify-center gap-12">
                    {/* Botón - (Disminuir) */}
                    <button
                      onClick={() => {
                        if (currentBPM && originalBPM) {
                          // Decrementar 1 BPM
                          const newBPM = Math.max(Math.round(originalBPM * 0.5), currentBPM - 1);
                          const newMultiplier = newBPM / originalBPM;
                          setTempoMultiplier(parseFloat(newMultiplier.toFixed(4)));
                        }
                      }}
                      disabled={!currentBPM}
                      className="w-20 h-20 rounded-full font-bold text-4xl transition-all duration-300 bg-gray-700 border-2 border-red-500 text-red-400 hover:bg-red-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        boxShadow: '0 0 15px rgba(239, 68, 68, 0.5), inset 0 0 10px rgba(239, 68, 68, 0.2)'
                      }}
                    >
                      −
                    </button>
                    
                    {/* BPM Central */}
                    <div className="flex flex-col items-center">
                      <div 
                        className="text-9xl font-bold text-green-400 font-mono"
                        style={{
                          textShadow: '0 0 30px rgba(34, 197, 94, 0.8), 0 0 15px rgba(34, 197, 94, 0.5)'
                        }}
                      >
                        {currentBPM || '--'}
                      </div>
                      <div className="text-green-300 text-sm font-mono mt-2">
                        BPM
                      </div>
                      {currentBPM && (
                        <div className="text-green-400 text-xs font-mono mt-1">
                          Velocidad: {(tempoMultiplier * 100).toFixed(0)}%
                        </div>
                      )}
                      
                      {/* Botón Reset Tempo */}
                      {currentBPM && (
                        <button
                          onClick={() => {
                            setTempoMultiplier(1.0);
                          }}
                          className="bg-gray-700 hover:bg-gray-600 text-green-400 px-4 py-1.5 rounded text-xs font-mono mt-3"
                          style={{
                            border: '1px solid rgba(34, 197, 94, 0.5)',
                            boxShadow: '0 0 8px rgba(34, 197, 94, 0.3)'
                          }}
                        >
                          RESET TEMPO
                        </button>
                      )}
                    </div>
                    
                    {/* Botón + (Aumentar) */}
                    <button
                      onClick={() => {
                        if (currentBPM && originalBPM) {
                          // Incrementar 1 BPM
                          const newBPM = Math.min(Math.round(originalBPM * 2.0), currentBPM + 1);
                          const newMultiplier = newBPM / originalBPM;
                          setTempoMultiplier(parseFloat(newMultiplier.toFixed(4)));
                        }
                      }}
                      disabled={!currentBPM}
                      className="w-20 h-20 rounded-full font-bold text-4xl transition-all duration-300 bg-gray-700 border-2 border-green-500 text-green-400 hover:bg-green-900 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        boxShadow: '0 0 15px rgba(34, 197, 94, 0.5), inset 0 0 10px rgba(34, 197, 94, 0.2)'
                      }}
                    >
                      +
                    </button>
                  </div>
                ) : showPitchShifter ? (
                  /* Pitch Shifter */
                  <PitchShifter
                    audioElements={audioElements}
                    stems={stems}
                    onPitchChange={(semitones) => {
                      console.log('Pitch cambiado a:', semitones, 'semitonos');
                    }}
                    onProcessedAudio={(trackKey, audioUrl) => {
                      console.log(`Audio procesado: ${trackKey} -> ${audioUrl}`);
                      // TODO: Reemplazar el audio element con el procesado
                    }}
                  />
                ) : (
                  /* Pantalla LED Normal */
                <>
                  <div className="flex justify-center mb-2">
                    <img 
                      src="/images/logo.png" 
                      alt="Judith Logo" 
                      className="h-12 w-auto object-contain brightness-[0.8] contrast-[1.2]"
                      style={{ filter: 'hue-rotate(90deg) saturate(1.5)' }}
                    />
                  </div>
                  <div className="text-green-300 text-sm font-mono mb-4">
                    DIGITAL MIXER
                  </div>
                  
                  {/* Status Indicators */}
                  <div className="flex space-x-4 mb-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                      <div className="text-green-400 text-xs font-mono mt-1">READY</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                      <div className="text-blue-400 text-xs font-mono mt-1">AUDIO</div>
                    </div>
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-amber-400 rounded-full"></div>
                      <div className="text-amber-400 text-xs font-mono mt-1">FX</div>
                    </div>
                  </div>
                  
                  {/* Current Mode Display */}
                  <div className="bg-gray-900 border border-green-500 rounded px-3 py-1">
                    <div className="text-green-400 text-xs font-mono">
                      MODE: STANDBY
                    </div>
                  </div>
                </>
                )}
              </div>
              
              {/* Corner LED Indicators */}
              <div className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="absolute bottom-2 left-2 w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="absolute bottom-2 right-2 w-2 h-2 bg-amber-500 rounded-full"></div>
            </div>
          </div>

          {/* Right Side - LED Buttons */}
          <div className="flex flex-col space-y-2 w-36" style={{marginRight: '10px'}}>
            {/* Row 1 */}
            <div className="flex flex-col space-y-2">
              <button 
                onClick={() => {
                  setDownloadFormat('mp3');
                  setShowDownloadModal(true);
                }}
                className="w-32 h-8 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 transition-all duration-300 flex items-center justify-center"
                style={{
                  boxShadow: '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className="text-xs font-bold text-gray-400">MP3</div>
              </button>
              <button 
                onClick={() => {
                  setDownloadFormat('wav');
                  setShowDownloadModal(true);
                }}
                className="w-32 h-8 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 transition-all duration-300 flex items-center justify-center"
                style={{
                  boxShadow: '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className="text-xs font-bold text-gray-400">WAV</div>
              </button>
              <button 
                onClick={handlePitchShifterToggle}
                className={`w-32 h-8 border rounded hover:bg-opacity-80 transition-all duration-300 flex items-center justify-center ${
                  showPitchShifter
                    ? 'bg-orange-700 border-orange-500'
                    : 'bg-gray-800 border-gray-600 hover:bg-gray-700'
                }`}
                style={{
                  boxShadow: showPitchShifter
                    ? '0 0 12px rgba(249, 115, 22, 0.6), inset 0 0 10px rgba(249, 115, 22, 0.2)'
                    : '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className={`text-xs font-bold ${showPitchShifter ? 'text-white' : 'text-gray-400'}`}>Pitch</div>
              </button>
            </div>
            
            {/* Row 2 */}
            <div className="flex flex-col space-y-2">
              <button 
                onClick={handleAudioSeparation}
                className="w-32 h-8 bg-gray-800 border border-gray-600 rounded hover:bg-gray-700 transition-all duration-300 flex items-center justify-center"
                style={{
                  boxShadow: '0 0 10px rgba(156, 163, 175, 0.3), inset 0 0 10px rgba(156, 163, 175, 0.1)'
                }}
              >
                <div className="text-xs font-bold text-gray-400">4</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : (
      <div className="flex-1">
        {/* Barra de progreso para análisis de acordes */}
        {isAnalyzing && activeFeature === 'chord-analysis' && (
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm text-gray-300 mb-2">
              <span>Analizando acordes...</span>
              <span>{analysisProgress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${analysisProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Contenido específico para análisis de acordes */}
        {activeFeature === 'chord-analysis' && (
          <>
            {/* Carrusel de acordes tipo karaoke */}
            {filteredChords.length > 0 && (
              <div className="mb-4">
                <div ref={carouselRef} className="flex items-center justify-start space-x-1 overflow-x-auto pb-4 px-4">
                  {filteredChords.map((chord, index) => {
                    const measureNumber = Math.floor(chord.start_time / 4) + 1;
                    // Buscar el acorde más cercano al tiempo actual
                    const timeDiff = Math.abs(currentTime - chord.start_time);
                    const isClosestChord = chords.every(otherChord => 
                      Math.abs(currentTime - otherChord.start_time) >= timeDiff
                    );
                    
                    const isActive = currentTime >= chord.start_time && currentTime <= chord.end_time;
                    // También considerar activo si es el más cercano y estamos cerca (0.5s)
                    const isNearStart = isClosestChord && currentTime >= (chord.start_time - 0.5) && currentTime < chord.start_time;
                    const isActuallyActive = isActive || isNearStart;
                    
                    const isNext = index > 0 && filteredChords[index - 1].start_time <= currentTime && chord.start_time > currentTime;
                    const isPrevious = chord.start_time < currentTime && !isActuallyActive;
                    
                    return (
                      <div
                        key={index}
                        onClick={() => onSeekTo?.(chord.start_time)}
                        className={`cursor-pointer transition-all duration-300 ${
                          isActuallyActive 
                            ? 'z-10' 
                            : isNext || isPrevious 
                              ? 'opacity-60' 
                              : 'opacity-40'
                        }`}
                        style={{
                          width: '200px',
                          minWidth: '200px'
                        }}
                      >
                        <div className={`p-4 rounded-lg border-2 transition-all duration-300 h-full ${
                          isActuallyActive
                            ? 'bg-gradient-to-br from-blue-600 to-purple-600 border-blue-400 shadow-lg shadow-blue-500/25'
                            : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                        }`}>
                          <div className="text-center">
                            <div className={`font-bold mb-2 ${
                              isActuallyActive ? 'text-white text-2xl' : 'text-gray-300 text-lg'
                            }`}>
                              {chord.chord}
                            </div>
                            <div className={`text-xs ${
                              isActuallyActive ? 'text-blue-100' : 'text-gray-400'
                            }`}>
                              {Math.round(chord.start_time)}s
                            </div>
                            <div className={`text-xs ${
                              isActuallyActive ? 'text-purple-100' : 'text-gray-500'
                            }`}>
                              Compás {measureNumber}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mensaje cuando no hay acordes */}
            {filteredChords.length === 0 && chords.length > 0 && (
              <div className="text-center text-gray-400 py-8">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No hay acordes disponibles para el nivel seleccionado</p>
              </div>
            )}

            {/* Mensaje cuando no hay análisis */}
            {filteredChords.length === 0 && chords.length === 0 && !isAnalyzing && (
              <div className="text-center text-gray-400 py-8">
                <Music className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Haz clic en &quot;Analizar&quot; para detectar los acordes</p>
                <p className="text-sm mt-2">Esta función identifica automáticamente los acordes de la canción</p>
              </div>
            )}
          </>
        )}

        {/* Contenido para otras funcionalidades */}
        {activeFeature && activeFeature !== 'chord-analysis' && (
          <div className="text-center text-gray-400 py-16">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-700 rounded-full flex items-center justify-center">
              <Music className="w-8 h-8 opacity-50" />
            </div>
            <h4 className="text-xl font-semibold mb-2 text-white">
              {musicCovers.find(c => c.id === activeFeature)?.title}
            </h4>
            <p className="text-gray-400 mb-4">
              {musicCovers.find(c => c.id === activeFeature)?.description}
            </p>
            <p className="text-sm text-gray-500">
              Esta funcionalidad será implementada próximamente
            </p>
          </div>
        )}
      </div>
    )}
    
    {/* Modal de Descarga */}
    {showDownloadModal && (
      <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
        <div className="bg-gray-800 border-2 border-gray-600 rounded-lg p-6 w-96">
          <h3 className="text-xl font-bold text-white mb-4">
            Descargar {downloadFormat.toUpperCase()}
          </h3>
          
          <p className="text-gray-300 text-sm mb-4">
            Selecciona las pistas que deseas descargar:
          </p>
          
          {/* Lista de tracks disponibles */}
          <div className="space-y-2 mb-6">
            {Object.entries(stems).map(([trackKey, trackUrl]) => (
              <label 
                key={trackKey}
                className="flex items-center gap-3 p-2 bg-gray-700 rounded hover:bg-gray-650 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedTracksForDownload.has(trackKey)}
                  onChange={(e) => {
                    const newSelected = new Set(selectedTracksForDownload);
                    if (e.target.checked) {
                      newSelected.add(trackKey);
                    } else {
                      newSelected.delete(trackKey);
                    }
                    setSelectedTracksForDownload(newSelected);
                  }}
                  className="w-4 h-4 accent-green-500"
                />
                <span className="text-white capitalize">{trackKey}</span>
              </label>
            ))}
          </div>
          
          {/* Botones */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowDownloadModal(false);
                setSelectedTracksForDownload(new Set());
              }}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={async () => {
                setIsDownloading(true);
                console.log('Descargando pistas:', Array.from(selectedTracksForDownload), 'en formato:', downloadFormat);
                
                // Descargar cada pista seleccionada
                for (const trackKey of Array.from(selectedTracksForDownload)) {
                  const trackUrl = stems[trackKey];
                  if (trackUrl) {
                    try {
                      console.log(`🔄 Procesando: ${trackKey}...`);
                      
                      // Llamar al endpoint de conversión
                      const response = await fetch('/api/download-track', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          trackUrl: trackUrl,
                          format: downloadFormat,
                          trackName: `${songId || 'track'}_${trackKey}`
                        }),
                      });
                      
                      if (!response.ok) {
                        const errorData = await response.json();
                        console.error('Error del servidor:', errorData);
                        throw new Error(errorData.details || 'Error en la conversión');
                      }
                      
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${songId || 'track'}_${trackKey}.${downloadFormat}`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      window.URL.revokeObjectURL(url);
                      console.log(`✅ Descargado y convertido a ${downloadFormat.toUpperCase()}: ${trackKey}`);
                    } catch (error: any) {
                      console.error(`❌ Error descargando ${trackKey}:`, error);
                      alert(`Error descargando ${trackKey}: ${error.message}`);
                    }
                  }
                }
                
                setIsDownloading(false);
                setShowDownloadModal(false);
                setSelectedTracksForDownload(new Set());
              }}
              disabled={selectedTracksForDownload.size === 0 || isDownloading}
              className="flex-1 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloading ? 'Descargando...' : `Descargar (${selectedTracksForDownload.size})`}
            </button>
          </div>
        </div>
      </div>
    )}
  </div>
);
};

export default ChordAnalysis;