'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { 
  Music, 
  Search,
  Plus,
  ChevronDown,
  User,
  Volume2,
  LogOut,
  Cloud,
  Trash2,
  Zap,
  Target,
  Repeat,
  VolumeX,
  X,
  MoreVertical,
  Play,
  Pause,
  SkipBack,
  SkipForward
} from 'lucide-react'
import MoisesStyleUpload from '@/components/MoisesStyleUpload'
import ConnectionStatus from '@/components/ConnectionStatus'
import PitchTempoChanger from '@/components/PitchTempoChanger'
import ChordAnalysis from '@/components/ChordAnalysis'
import BeatEditor from '@/components/BeatEditor'
import BpmDisplay from '@/components/BpmDisplay'
import CoverFlow from '@/components/CoverFlow'
import createMusicCovers from '@/components/MusicCovers'
import PitchTempoModal from '@/components/PitchTempoModal'
import MetronomeModal from '@/components/MetronomeModal'
import VolumeEQModal from '@/components/VolumeEQModal'
import BpmDetectorModal from '@/components/BpmDetectorModal'
import ChordAnalysisModal from '@/components/ChordAnalysisModal'
import YoutubeExtractModal from '@/components/YoutubeExtractModal'
import HeroPopup from '@/components/HeroPopup'

// import ChordAnalyzer from '@/components/ChordAnalyzer'
import { getUserSongs, subscribeToUserSongs, deleteSong, Song } from '@/lib/firestore'
// import useAudioCleanup from '@/hooks/useAudioCleanup'

export default function Home() {
  const { user, loading, logout } = useAuth()
  const isPremium = user?.email === 'ueservicesllc1@gmail.com';
  const router = useRouter()
  
  // Component render
  
  // Hook para limpiar audio
  // useAudioCleanup()
  const [activeTab, setActiveTab] = useState('my-songs')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('added')
  const [showMoisesStyleModal, setShowMoisesStyleModal] = useState(false)
  const [showPitchTempoModal, setShowPitchTempoModal] = useState(false)
  const [showMetronomeModal, setShowMetronomeModal] = useState(false)
  const [showVolumeEQModal, setShowVolumeEQModal] = useState(false)
  const [showBpmDetectorModal, setShowBpmDetectorModal] = useState(false)
  const [showChordAnalysisModal, setShowChordAnalysisModal] = useState(false)
  const [showYoutubeExtractModal, setShowYoutubeExtractModal] = useState(false)
  const [showEQInMixer, setShowEQInMixer] = useState(false)
  const [showHeroPopup, setShowHeroPopup] = useState(false)
  const [songs, setSongs] = useState<Song[]>([])
  const [songsLoading, setSongsLoading] = useState(true)
  const [showSongModal, setShowSongModal] = useState(false)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [preloadedAudioFile, setPreloadedAudioFile] = useState<File | null>(null)

  const [songDelay, setSongDelay] = useState<number>(0)
  const [audioElements, setAudioElements] = useState<{ [key: string]: HTMLAudioElement }>({})
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [waveforms, setWaveforms] = useState<{ [key: string]: number[] }>({})
  const [trackOnsets, setTrackOnsets] = useState<{ [key: string]: number }>({}) // Onset en ms de cada track
  
  // Estados para EQ de frecuencias altas (treble)
  const [trebleGain, setTrebleGain] = useState(0) // 0dB por defecto (-12 a +12)
  const audioContextRef = useRef<AudioContext | null>(null)
  const trebleFilterRef = useRef<BiquadFilterNode | null>(null)
  const audioSourcesRef = useRef<Map<HTMLAudioElement, MediaElementAudioSourceNode>>(new Map())
  
  // Referencias para EQ básico (bass, mid, treble)
  const bassFilterRef = useRef<BiquadFilterNode | null>(null)
  const midFilterRef = useRef<BiquadFilterNode | null>(null)
  const eqGainNodeRef = useRef<GainNode | null>(null)
  
  // Referencias para Pitch Shift
  const pitchShiftNodeRef = useRef<GainNode | null>(null)
  
  // Timestamp del último seek manual
  const lastSeekTimeRef = useRef<number>(0)
  const [pitchSemitones, setPitchSemitones] = useState(0)

  
  // Cache global para audio buffers y waveforms
  const [audioCache, setAudioCache] = useState<{ [url: string]: { audioBuffer: AudioBuffer, waveform: number[] } }>({})
  const [trackLoadingStates, setTrackLoadingStates] = useState<{ [key: string]: 'idle' | 'loading' | 'cached' | 'ready' }>({})
  const [waveformCache, setWaveformCache] = useState<{ [url: string]: number[] }>({})
  const [cacheLoaded, setCacheLoaded] = useState(false)
  
  // Estados para el selector de colores de tracks
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null)
  const [trackColors, setTrackColors] = useState<{ [key: string]: string }>({})
  
  // Estado para el menú dropdown de acciones
  const [showDropdown, setShowDropdown] = useState<string | null>(null)
  
  // Estado para el modal de confirmación de eliminación
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ show: boolean; song: Song | null }>({ show: false, song: null })
  
  // Estados para controles de audio
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [trackMutedStates, setTrackMutedStates] = useState<{ [key: string]: boolean }>({})
  const [trackVolumeStates, setTrackVolumeStates] = useState<{ [key: string]: number }>({})
  const [showMixerEQ, setShowMixerEQ] = useState(false) // Mostrar EQ en el mixer
  const [trackSoloStates, setTrackSoloStates] = useState<{ [key: string]: boolean }>({})
  
  // Estado para estilo de waveform
  const [waveformStyle, setWaveformStyle] = useState<'bars' | 'smooth' | 'dots'>('bars')
  
  // Estados para CoverFlow
  const [showCoverFlow, setShowCoverFlow] = useState(true)
  const [activeFeature, setActiveFeature] = useState<string | null>(null)
  
  // Handlers para CoverFlow
  const handleChordAnalysis = () => {
    setShowCoverFlow(false)
    setActiveFeature('chord-analysis')
    setShowChordAnalysisModal(true)
  }
  
  const handleMetronome = () => {
    setShowCoverFlow(false)
    setActiveFeature('metronome')
    setShowMetronomeModal(true)
  }
  
  const handleTimeRuler = () => {
    setShowCoverFlow(false)
    setActiveFeature('time-ruler')
  }
  
  const handleAudioSeparation = () => {
    setShowCoverFlow(false)
    setActiveFeature('audio-separation')
    setShowMoisesStyleModal(true)
  }
  
  const handleTempoChange = () => {
    setShowCoverFlow(false)
    setActiveFeature('tempo-change')
    setShowPitchTempoModal(true)
  }
  
  const handlePitchChange = () => {
    setShowCoverFlow(false)
    setActiveFeature('pitch-change')
    setShowPitchTempoModal(true)
  }
  
  const handleVolumeControl = () => {
    setShowCoverFlow(false)
    setActiveFeature('volume-control')
    setShowVolumeEQModal(true)
  }
  
  const handleRecording = () => {
    setShowCoverFlow(false)
    setActiveFeature('recording')
  }
  
  const handleBeatEditor = () => {
    setShowCoverFlow(false)
    setActiveFeature('beat-editor')
  }
  
  const handleClickTrack = () => {
    setShowCoverFlow(false)
    setActiveFeature('click-track')
  }
  
  const handleIntelligentMetronome = () => {
    setShowCoverFlow(false)
    setActiveFeature('intelligent-metronome')
  }
  
  const handleBpmDisplay = () => {
    setShowCoverFlow(false)
    setActiveFeature('bpm-display')
    setShowBpmDetectorModal(true)
  }
  
  const backToCoverFlow = () => {
    setShowCoverFlow(true)
    setActiveFeature(null)
  }
  
  // Funciones para cerrar modales y restaurar CoverFlow
  const closeMoisesModal = () => {
    setShowMoisesStyleModal(false)
    setPreloadedAudioFile(null)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }
  
  const closePitchTempoModal = () => {
    setShowPitchTempoModal(false)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }
  
  const closeMetronomeModal = () => {
    setShowMetronomeModal(false)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }
  
  const closeVolumeEQModal = () => {
    setShowVolumeEQModal(false)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }

  const closeBpmDetectorModal = () => {
    setShowBpmDetectorModal(false)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }

  const closeChordAnalysisModal = () => {
    setShowChordAnalysisModal(false)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }

  const handleYoutubeExtract = () => {
    setShowCoverFlow(false)
    setActiveFeature('youtube-extract')
    setShowYoutubeExtractModal(true)
  }

  const closeYoutubeExtractModal = () => {
    setShowYoutubeExtractModal(false)
    setShowCoverFlow(true)
    setActiveFeature(null)
  }

  // Handler removed - audio separation feature no longer available
  
  const closeSongModal = () => {
    setShowSongModal(false)
    setSelectedSong(null)
    setPreloadedAudioFile(null)
    setIsPlaying(false)
    setCurrentTime(0)
    // No restaurar CoverFlow aquí porque el song modal no viene del CoverFlow
  }
  
  // Crear covers para el CoverFlow
  const musicCovers = createMusicCovers(
    handleChordAnalysis,
    handleMetronome,
    handleAudioSeparation,
    handleTempoChange,
    handlePitchChange,
    handleVolumeControl,
    handleRecording,
    handleBeatEditor,
    handleClickTrack,
    handleBpmDisplay,
    handleYoutubeExtract
  )
  
  // Estados para metronome sincronizado - REMOVED

  
  // Set para rastrear canciones siendo procesadas para duración
  const [processingDurations, setProcessingDurations] = useState<Set<string>>(new Set())
  const processingDurationsRef = useRef<Set<string>>(new Set())
  
  
  
  
  
  
  

  // Cargar cache persistente al inicializar
  useEffect(() => {
    const savedCache = localStorage.getItem('waveform-cache')
    if (savedCache) {
      try {
        const parsedCache = JSON.parse(savedCache)
        setWaveformCache(parsedCache)
        setCacheLoaded(true)
        console.log('Cache cargado desde localStorage:', Object.keys(parsedCache).length, 'entradas')
      } catch (error) {
        console.error('Error cargando cache:', error)
        setCacheLoaded(true)
      }
    } else {
      setCacheLoaded(true)
    }
  }, [])

  // Mostrar popup hero cada vez que el usuario entra al dashboard
  useEffect(() => {
    if (user && !loading) {
      // Mostrar popup después de un pequeño delay para que la página cargue completamente
      const timer = setTimeout(() => {
        setShowHeroPopup(true)
      }, 1500)
      
      return () => clearTimeout(timer)
    }
  }, [user, loading])
  


  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showDropdown) {
        setShowDropdown(null)
      }
    }

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  // Limpiar audio cuando el componente se desmonte
  useEffect(() => {
    return () => {
      // Limpiar todos los elementos de audio al desmontar
      Object.values(audioElements).forEach(audio => {
        audio.pause()
        audio.currentTime = 0
        audio.src = ''
      })
      Object.values(originalAudioElements).forEach(audio => {
        audio.pause()
        audio.currentTime = 0
        audio.src = ''
      })
    }
  }, [])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // Inicializar Web Audio API con filtros EQ
  useEffect(() => {
    if (Object.keys(audioElements).length > 0 && !audioContextRef.current) {
      // Crear AudioContext
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // Crear filtros de EQ
      bassFilterRef.current = audioContextRef.current.createBiquadFilter()
      bassFilterRef.current.type = 'lowshelf'
      bassFilterRef.current.frequency.value = 200 // Hz
      
      midFilterRef.current = audioContextRef.current.createBiquadFilter()
      midFilterRef.current.type = 'peaking'
      midFilterRef.current.frequency.value = 1000 // Hz
      midFilterRef.current.Q.value = 1
      
      trebleFilterRef.current = audioContextRef.current.createBiquadFilter()
      trebleFilterRef.current.type = 'highshelf'
      trebleFilterRef.current.frequency.value = 3000 // Hz
      
      eqGainNodeRef.current = audioContextRef.current.createGain()
      
      // Conectar filtros EQ en cadena al destino
      bassFilterRef.current.connect(midFilterRef.current)
      midFilterRef.current.connect(trebleFilterRef.current)
      trebleFilterRef.current.connect(eqGainNodeRef.current)
      eqGainNodeRef.current.connect(audioContextRef.current.destination)
      
      // Conectar todos los audioElements al primer filtro
      Object.values(audioElements).forEach(audio => {
        if (!audioSourcesRef.current.has(audio)) {
          const source = audioContextRef.current!.createMediaElementSource(audio)
          audioSourcesRef.current.set(audio, source)
          source.connect(bassFilterRef.current!)
        }
      })
      
      console.log('Web Audio API inicializado con filtros EQ')
    }
  }, [audioElements])


  // Cargar canciones reales desde Firestore
  useEffect(() => {
    if (!user) {
      console.log('No user, skipping songs load')
      return
    }

    console.log('Loading songs for user:', user.uid)
    setSongsLoading(true)
    
    // Suscribirse a cambios en tiempo real
    const unsubscribe = subscribeToUserSongs(user.uid, (userSongs) => {
      console.log('Received songs in UI:', userSongs.length)
      setSongs(userSongs)
      setSongsLoading(false)
    })

    return () => {
      console.log('🧹 Unsubscribing from songs')
      unsubscribe()
    }
  }, [user])

  // Calcular automáticamente las duraciones, BPM y Key faltantes
  useEffect(() => {
    const calculateMissingData = async () => {
      // Filtrar canciones que necesitan algún dato
      const songsNeedingData = songs.filter(song => 
        song.fileUrl && 
        song.id &&
        (
          (!song.duration || song.duration === '0:00') ||
          !song.bpm ||
          !song.key || song.key === '-' ||
          !song.timeSignature
        ) &&
        !processingDurationsRef.current.has(song.id)
      );

      if (songsNeedingData.length === 0) return;

      console.log(`Calculando datos faltantes para ${songsNeedingData.length} canciones...`);

      // Marcar canciones como procesándose
      songsNeedingData.forEach(song => {
        if (song.id) {
          processingDurationsRef.current.add(song.id);
        }
      });

      for (const song of songsNeedingData) {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const songRef = doc(db, 'songs', song.id!);
          const updates: any = {};
          
          // Calcular duración si falta
          if (!song.duration || song.duration === '0:00') {
            try {
              const audio = new Audio();
              audio.preload = 'metadata';
              
              await new Promise((resolve, reject) => {
                audio.onloadedmetadata = () => {
                  const durationSeconds = Math.floor(audio.duration);
                  const minutes = Math.floor(durationSeconds / 60);
                  const seconds = durationSeconds % 60;
                  const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                  
                  updates.duration = duration;
                  updates.durationSeconds = durationSeconds;
                  console.log(` ${song.title} - Duración: ${duration}`);
                  resolve(true);
                };
                
                audio.onerror = () => reject(new Error('Error al cargar audio'));
                audio.src = song.fileUrl!;
              });
            } catch (error) {
              console.warn(` No se pudo calcular duración para ${song.title}`);
            }
          }
          
          // Calcular BPM si falta
          if (!song.bpm) {
            try {
              const response = await fetch(`http://130.211.85.150:8000/api/analyze-bpm-from-url?audio_url=${encodeURIComponent(song.fileUrl!)}`);
              const data = await response.json();
              
              if (data.success && data.bpm) {
                updates.bpm = data.bpm;
                console.log(` ${song.title} - BPM: ${data.bpm}`);
              }
            } catch (error) {
              console.warn(` No se pudo calcular BPM para ${song.title}`);
            }
          }
          
          // Calcular Key si falta
          if (!song.key || song.key === '-') {
            try {
              const response = await fetch(`http://130.211.85.150:8000/api/analyze-key-from-url?audio_url=${encodeURIComponent(song.fileUrl!)}`);
              const data = await response.json();
              
              if (data.success && data.key_string) {
                updates.key = data.key_string;
                console.log(` ${song.title} - Key: ${data.key_string}`);
              }
            } catch (error) {
              console.warn(` No se pudo calcular Key para ${song.title}`);
            }
          }
          
          // Calcular Time Signature si falta
          if (!song.timeSignature) {
            try {
              const response = await fetch(`http://130.211.85.150:8000/api/analyze-time-signature-from-url?audio_url=${encodeURIComponent(song.fileUrl!)}`);
              const data = await response.json();
              
              if (data.success && data.time_signature) {
                updates.timeSignature = data.time_signature;
                console.log(` ${song.title} - Time Signature: ${data.time_signature}`);
              }
            } catch (error) {
              console.warn(` No se pudo calcular Time Signature para ${song.title}`);
            }
          }
          
          // Actualizar en Firestore si hay cambios
          if (Object.keys(updates).length > 0) {
            await updateDoc(songRef, updates);
          }
          
        } catch (error) {
          console.warn(` Error procesando ${song.title}:`, error);
        }
      }
    };

    if (songs.length > 0 && !songsLoading) {
      calculateMissingData();
    }
  }, [songs, songsLoading])

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
    }
  }


  // Estados para reproducción de audio original en dashboard
  const [currentPlayingSong, setCurrentPlayingSong] = useState<string | null>(null);
  const [originalAudioElements, setOriginalAudioElements] = useState<{ [songId: string]: HTMLAudioElement }>({});
  

  // Función para reproducir audio original
  const handlePlayOriginalAudio = useCallback((song: Song) => {
    try {
      console.log(' Reproduciendo audio original de:', song.title);
      console.log(' URL del audio:', song.fileUrl);
      console.log(' Stems disponibles:', song.stems);
      
      if (!song.fileUrl) {
        console.error(' No hay URL de audio disponible');
        alert(' No hay audio disponible para esta canción');
        return;
      }
      
      // Determinar la URL correcta del audio
      let audioUrl = song.fileUrl;
      
      // Si la URL ya es de B2, usarla directamente (canciones nuevas)
      if (audioUrl.includes('s3.us-east-005.backblazeb2.com')) {
        console.log(' ✅ Usando URL directa de B2 del original:', audioUrl);
      } 
      // Si la URL es de localhost, el backend intentará servirla localmente o redirigir a B2
      else if (audioUrl.includes('localhost:8000')) {
        console.log(' ⏩ Intentando reproducir desde backend:', audioUrl);
        console.log(' ℹ️ Si falla, es porque el archivo original no está disponible en B2');
      }
      // Fallback
      else {
        console.log(' ⚠️ Usando URL como está:', audioUrl);
      }
      
      // Pausar cualquier audio que esté reproduciéndose
      if (currentPlayingSong && currentPlayingSong !== song.id) {
        const currentAudio = originalAudioElements[currentPlayingSong];
        if (currentAudio) {
          currentAudio.pause();
        }
      }
      
      // Si ya existe un audio para esta canción, usar ese
      let audio = originalAudioElements[song.id!];
      
      if (!audio) {
        // Crear un nuevo elemento de audio
        audio = new Audio(audioUrl);
        audio.crossOrigin = 'anonymous';
        
        // Event listener para cuando termine la canción original
        audio.addEventListener('ended', () => {
          console.log(`🏁 Original song ended - stopping playback`)
          audio.pause();
          audio.currentTime = 0;
          setCurrentPlayingSong(null);
        });
        
        setOriginalAudioElements(prev => ({ ...prev, [song.id!]: audio }));
      }
      
      // Si el audio ya está reproduciéndose, pausarlo
      if (currentPlayingSong === song.id && !audio.paused) {
        audio.pause();
        setCurrentPlayingSong(null);
        return;
      }
      
      // Reproducir el audio
      audio.play().then(() => {
        setCurrentPlayingSong(song.id!);
        console.log(' Audio original reproduciéndose:', song.title);
      }).catch(error => {
        console.error(' Error al iniciar reproducción:', error);
        alert(' Error: No se puede iniciar la reproducción del audio');
      });
      
    } catch (error) {
      console.error(' Error en handlePlayOriginalAudio:', error);
      alert(' Error al intentar reproducir el audio original');
    }
  }, [currentPlayingSong, originalAudioElements]);

  // Función para parar audio original
  const handleStopOriginalAudio = useCallback((song: Song) => {
    try {
      const audio = originalAudioElements[song.id!];
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        setCurrentPlayingSong(null);
        console.log(' Audio original detenido:', song.title);
      }
    } catch (error) {
      console.error(' Error deteniendo audio original:', error);
    }
  }, [originalAudioElements]);

  const handleDeleteSong = useCallback(async (songId: string, songTitle: string) => {
    console.log('🗑️ Intentando eliminar canción:', { songId, songTitle });
    
    // Primero cerrar el dropdown
    setShowDropdown(null);
    
    // Usar setTimeout para asegurar que el confirm se muestra después de cerrar el dropdown
    setTimeout(async () => {
      if (!confirm(`¿Estás seguro de que quieres eliminar "${songTitle}"?\n\nEsta acción no se puede deshacer.`)) {
        console.log('❌ Usuario canceló la eliminación');
        return;
      }

      try {
        console.log('🔄 Eliminando canción de Firestore...', songId);
        
        // Detener el audio si está reproduciéndose ANTES de eliminar
        if (currentPlayingSong === songId) {
          const audio = originalAudioElements[songId];
          if (audio) {
            audio.pause();
            audio.currentTime = 0;
          }
          setCurrentPlayingSong(null);
        }
        
        // Limpiar el elemento de audio
        if (originalAudioElements[songId]) {
          originalAudioElements[songId].pause();
          delete originalAudioElements[songId];
          setOriginalAudioElements({ ...originalAudioElements });
        }
        
        // Eliminar de Firestore
        await deleteSong(songId);
        console.log('✅ Canción eliminada exitosamente de Firestore');
        
        // La lista se actualizará automáticamente por la suscripción a Firestore
        console.log('✅ Proceso de eliminación completado');
        
      } catch (error) {
        console.error('❌ Error eliminando canción:', error);
        alert('❌ Error al eliminar la canción. Por favor, inténtalo de nuevo.\n\nError: ' + (error instanceof Error ? error.message : 'Desconocido'));
      }
    }, 100);
  }, [currentPlayingSong, originalAudioElements])

  // Función para crear waveform SVG suave rellena
  const createSmoothWaveformSVG = (waveformData: number[], width: number, height: number, color: string): string => {
    if (waveformData.length === 0) return '';
    
    const centerY = height / 2;
    const points = waveformData.map((value, index) => {
      const x = (index / (waveformData.length - 1)) * width;
      const yTop = centerY - (value * height * 0.4);
      const yBottom = centerY + (value * height * 0.4);
      return { x, yTop, yBottom };
    });
    
    // Crear curva suave superior
    let topPath = `M ${points[0].x},${centerY}`;
    for (let i = 1; i < points.length; i++) {
      const [x, y] = [points[i].x, points[i].yTop];
      const [prevX, prevY] = [points[i - 1].x, points[i - 1].yTop];
      const cpX = (prevX + x) / 2;
      topPath += ` Q ${cpX},${prevY} ${x},${y}`;
    }
    
    // Crear curva suave inferior (en reversa)
    let bottomPath = ` L ${points[points.length - 1].x},${points[points.length - 1].yBottom}`;
    for (let i = points.length - 2; i >= 0; i--) {
      const [x, y] = [points[i].x, points[i].yBottom];
      const [nextX, nextY] = [points[i + 1].x, points[i + 1].yBottom];
      const cpX = (nextX + x) / 2;
      bottomPath += ` Q ${cpX},${nextY} ${x},${y}`;
    }
    bottomPath += ` Z`;
    
    const filledPath = topPath + bottomPath;
    
    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <linearGradient id="smoothWaveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:${color};stop-opacity:0.9" />
            <stop offset="50%" style="stop-color:${color};stop-opacity:0.7" />
            <stop offset="100%" style="stop-color:${color};stop-opacity:0.4" />
          </linearGradient>
        </defs>
        <path d="${filledPath}" fill="url(#smoothWaveGradient)" stroke="${color}" stroke-width="1" stroke-linecap="round"/>
      </svg>
    `;
  };

  // Función para generar path SVG relleno
  const generateFilledWaveformPath = (waveformData: number[]): string => {
    if (!waveformData || waveformData.length === 0) return '';
    
    const points = waveformData.map((value, index) => {
      const x = 2 + (index / (waveformData.length - 1)) * 798;
      const yTop = 30 - (value * 25);
      const yBottom = 30 + (value * 25);
      return { x, yTop, yBottom };
    });
    
    // Crear path cerrado para relleno
    let path = `M 2,30`;
    // Línea superior
    points.forEach(point => {
      path += ` L ${point.x},${point.yTop}`;
    });
    // Línea inferior (en reversa)
    for (let i = points.length - 1; i >= 0; i--) {
      path += ` L ${points[i].x},${points[i].yBottom}`;
    }
    path += ` Z`; // Cerrar el path
    return path;
  };

  // Función profesional para generar waveform de alta precisión
  const generateProfessionalWaveform = (channelData: Float32Array, targetLength: number): number[] => {
    const sourceLength = channelData.length;
    const samplesPerPixel = sourceLength / targetLength;
    const waveform: number[] = [];
    
    for (let i = 0; i < targetLength; i++) {
      const start = Math.floor(i * samplesPerPixel);
      const end = Math.floor((i + 1) * samplesPerPixel);
      
      let max = -Infinity;
      let min = Infinity;
      let sumSquares = 0;
      let sampleCount = 0;
      
      // Procesar cada muestra en el bloque
      for (let j = start; j < end && j < sourceLength; j++) {
        const sample = channelData[j];
        max = Math.max(max, sample);
        min = Math.min(min, sample);
        sumSquares += sample * sample;
        sampleCount++;
      }
      
      if (sampleCount > 0) {
        // Calcular RMS para amplitud promedio
        const rms = Math.sqrt(sumSquares / sampleCount);
        
        // Calcular peak-to-peak para amplitud máxima
        const peakToPeak = Math.abs(max - min);
        
        // Combinar ambos métodos para representación profesional
        const amplitude = Math.max(rms * 1.8, peakToPeak * 0.6);
        waveform.push(amplitude);
      } else {
        waveform.push(0);
      }
    }
    
    // Normalización profesional - mantener la dinámica natural
    const maxAmplitude = Math.max(...waveform);
    if (maxAmplitude > 0) {
      // Aplicar compresión suave para mejor visualización
      return waveform.map(value => {
        const normalized = value / maxAmplitude;
        // Usar compresión logarítmica suave para mantener detalle
        return Math.pow(normalized, 0.7);
      });
    }
    
    return waveform;
  };




  // Sistema de sincronización simplificado
  const audioElementsRef = useRef(audioElements);
  audioElementsRef.current = audioElements;

  // Funciones para controles de audio
  const togglePlayPause = () => {
    if (isPlaying) {
      // Pausar todos los audios
      console.log('Pausing all tracks')
      Object.entries(audioElements).forEach(([trackKey, audio]) => {
        console.log(`Pausing ${trackKey}`)
        audio.pause();
      });
      setIsPlaying(false);
      
      // Metrónomo deshabilitado temporalmente
      // stopMetronome();
    } else {
      // Reproducir todos los audios sincronizados
      console.log('Playing all tracks')
      
      Object.entries(audioElements).forEach(([trackKey, audio]) => {
        // Todos los tracks empiezan en el mismo tiempo
        audio.currentTime = Math.max(0, currentTime);
        console.log(`PLAY ${trackKey}: empezando en ${audio.currentTime.toFixed(3)}s`);
        
        audio.play().catch(error => {
          console.error(`Error playing ${trackKey}:`, error)
        });
      });
      
      setIsPlaying(true);
      
      // Metrónomo deshabilitado temporalmente
      // startMetronome();
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    Object.values(audioElements).forEach(audio => {
      audio.volume = newVolume;
    });
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    Object.values(audioElements).forEach(audio => {
      audio.muted = newMuted;
    });
  };

  // Función para convertir clases de Tailwind a colores CSS
  const getColorFromClass = (tailwindClass: string): string => {
    const colorMap: { [key: string]: string } = {
      'bg-gray-700': '#374151',
      'bg-gray-600': '#4B5563',
      'bg-gray-800': '#1F2937',
      'bg-gray-500': '#6B7280',
      'bg-gray-900': '#111827',
      'bg-red-600': '#DC2626',
      'bg-red-500': '#EF4444',
      'bg-red-400': '#F87171',
      'bg-red-300': '#FCA5A5',
      'bg-red-200': '#FECACA',
      'bg-blue-600': '#2563EB',
      'bg-blue-500': '#3B82F6',
      'bg-blue-400': '#60A5FA',
      'bg-blue-300': '#93C5FD',
      'bg-blue-200': '#BFDBFE',
      'bg-yellow-600': '#D97706',
      'bg-yellow-500': '#EAB308',
      'bg-yellow-400': '#FACC15',
      'bg-yellow-300': '#FDE047',
      'bg-yellow-200': '#FEF08A',
      'bg-green-600': '#16A34A',
      'bg-green-500': '#22C55E',
      'bg-green-400': '#4ADE80',
      'bg-green-300': '#86EFAC',
      'bg-green-200': '#BBF7D0',
      'bg-purple-600': '#9333EA',
      'bg-purple-500': '#A855F7',
      'bg-purple-400': '#C084FC',
      'bg-purple-300': '#D8B4FE',
      'bg-purple-200': '#E9D5FF',
      'bg-orange-600': '#EA580C',
      'bg-orange-500': '#F97316',
      'bg-orange-400': '#FB923C',
      'bg-orange-300': '#FDBA74',
      'bg-orange-200': '#FED7AA',
      'bg-pink-600': '#DB2777',
      'bg-pink-500': '#EC4899',
      'bg-pink-400': '#F472B6',
      'bg-pink-300': '#F9A8D4',
      'bg-pink-200': '#FBCFE8',
      'bg-cyan-600': '#0891B2',
      'bg-cyan-500': '#06B6D4',
      'bg-cyan-400': '#22D3EE',
      'bg-cyan-300': '#67E8F9',
      'bg-cyan-200': '#A7F3D0',
    };
    return colorMap[tailwindClass] || '#6B7280'; // Default gray si no encuentra el color
  };

  // Función para cambiar el color de un track
  const changeTrackColor = async (trackKey: string, color: string) => {
    const newColors = {
      ...trackColors,
      [trackKey]: color
    };
    
    setTrackColors(newColors);
    setShowColorPicker(null);
    
    // Guardar en Firestore si hay una canción seleccionada
    if (selectedSong && user) {
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        
        const songRef = doc(db, 'songs', selectedSong.id!);
        await updateDoc(songRef, {
          trackColors: newColors
        });
        
        console.log(' Colores de tracks guardados en Firestore');
      } catch (error) {
        console.error(' Error guardando colores en Firestore:', error);
      }
    }
  };

  // Función para toggle mute de track individual
  const toggleTrackMute = (trackKey: string) => {
    // Si está en solo, desactivar solo y activar mute
    if (trackSoloStates[trackKey]) {
      setTrackSoloStates(prev => ({
        ...prev,
        [trackKey]: false
      }));
      setTrackMutedStates(prev => ({
        ...prev,
        [trackKey]: true
      }));
      
      // Aplicar mute
      if (audioElements[trackKey]) {
        audioElements[trackKey].muted = true;
        audioElements[trackKey].volume = 0;
      }
      
      // Restaurar otros tracks si no hay más en solo
      const hasOtherSolo = Object.entries(trackSoloStates).some(([key, solo]) => key !== trackKey && solo);
      if (!hasOtherSolo) {
        Object.entries(audioElements).forEach(([key, audio]) => {
          if (key !== trackKey) {
            audio.muted = trackMutedStates[key] || false;
            audio.volume = volume;
          }
        });
      }
      return;
    }
    
    const newMutedState = !trackMutedStates[trackKey];
    setTrackMutedStates(prev => ({
      ...prev,
      [trackKey]: newMutedState
    }));
    
    // Aplicar mute al elemento de audio específico SIN pausar
    if (audioElements[trackKey]) {
      audioElements[trackKey].muted = newMutedState;
      // Mantener el volumen original para evitar desincronización
      audioElements[trackKey].volume = newMutedState ? 0 : volume;
    }
  };

  // Función para toggle solo de track individual
  const toggleTrackSolo = (trackKey: string) => {
    // Si está en mute, desactivar mute y activar solo
    if (trackMutedStates[trackKey]) {
      setTrackMutedStates(prev => ({
        ...prev,
        [trackKey]: false
      }));
      setTrackSoloStates(prev => ({
        ...prev,
        [trackKey]: true
      }));
      
      // Aplicar solo
      const updatedSoloStates = { ...trackSoloStates, [trackKey]: true };
      Object.entries(audioElements).forEach(([key, audio]) => {
        if (updatedSoloStates[key]) {
          // Track en solo: reproducir
          audio.muted = false;
          audio.volume = volume;
        } else {
          // Track no en solo: silenciar
          audio.muted = true;
        }
      });
      return;
    }
    
    const newSoloState = !trackSoloStates[trackKey];
    setTrackSoloStates(prev => ({
      ...prev,
      [trackKey]: newSoloState
    }));
    
    // Obtener el nuevo estado de solo después del toggle
    const updatedSoloStates = { ...trackSoloStates, [trackKey]: newSoloState };
    
    // Verificar si hay algún track en modo solo
    const hasAnySolo = Object.values(updatedSoloStates).some(solo => solo);
    
    if (hasAnySolo) {
      // Si hay tracks en solo: solo reproducir los que están en solo
      Object.entries(audioElements).forEach(([key, audio]) => {
        if (updatedSoloStates[key]) {
          // Track en solo: reproducir
          audio.muted = false;
          audio.volume = volume;
        } else {
          // Track no en solo: silenciar
          audio.muted = true;
        }
      });
    } else {
      // Si no hay tracks en solo: restaurar estados de mute originales con volumen individual
      Object.entries(audioElements).forEach(([key, audio]) => {
        audio.muted = trackMutedStates[key] || false;
        audio.volume = trackVolumeStates[key] ?? 1;
      });
    }
  };

  // Cambiar volumen de un track individual
  const setTrackVolume = (trackKey: string, newVolume: number) => {
    // Actualizar estado
    setTrackVolumeStates(prev => ({
      ...prev,
      [trackKey]: newVolume
    }));

    // Aplicar al audio element si existe y no está muteado
    if (audioElements[trackKey] && !trackMutedStates[trackKey]) {
      audioElements[trackKey].volume = newVolume;
      console.log(`🔊 Volumen ${trackKey}: ${Math.round(newVolume * 100)}%`);
    }
  };

  // Cambiar posición de la barra
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTime = Number(e.target.value);
    
    // Marcar timestamp del seek manual
    lastSeekTimeRef.current = Date.now();
    
    Object.entries(audioElements).forEach(([trackKey, audio]) => {
      // Todos los tracks se mueven al mismo tiempo
      audio.currentTime = Math.max(0, seekTime);
    });
    
    setCurrentTime(seekTime);
  };

  // Funciones para controlar el metronome - REMOVED

  // Detectar el primer ataque de audio (onset) en un AudioBuffer
  const detectOnset = (audioBuffer: AudioBuffer): number => {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    
    // Calcular RMS (energía) en ventanas de 100ms
    const windowSizeMs = 100;
    const windowSize = Math.floor((windowSizeMs / 1000) * sampleRate);
    const threshold = 0.01; // Umbral de energía para detectar inicio
    
    for (let i = 0; i < channelData.length; i += windowSize) {
      const end = Math.min(i + windowSize, channelData.length);
      let sum = 0;
      
      // Calcular RMS de esta ventana
      for (let j = i; j < end; j++) {
        sum += channelData[j] * channelData[j];
      }
      
      const rms = Math.sqrt(sum / (end - i));
      
      // Si la energía supera el umbral, este es el onset
      if (rms > threshold) {
        const timeSeconds = i / sampleRate;
        return Math.round(timeSeconds * 1000); // Retornar en ms
      }
    }
    
    return 0; // Si no se detecta, retornar 0
  };

  // Helper para proxyar URLs de audio a través del backend local (evitar CORS y corregir IPs viejas)
  const getProxyUrl = (url: string | undefined) => {
    if (!url) return '';
    
    // Si ya es una ruta relativa local, dejarla
    if (url.startsWith('/')) return url;
    
    // Si contiene el IP viejo, redirigir al proxy inverso
    const oldIp = '104.197.145.173';
    if (url.includes(oldIp)) {
      return url.replace(`http://${oldIp}:8000/audio`, '/backend-audio');
    }
    
    // Convertir URLs de B2 al proxy de Next.js → backend
    // El backend ahora sirve primero desde disco local (uploads/{task_id}/demucs_output/)
    // y solo hace proxy a B2 si no existe en disco. Esto funciona tanto en dev como en prod.
    const b2Regex = /^https?:\/\/(?:s3\.us-east-005|f005)\.backblazeb2\.com\/(?:file\/)?(?:moises2|Multitrack)\/audio\/(.+)$/i;
    const match = url.match(b2Regex);
    if (match && match[1]) {
      const proxyUrl = `/backend-audio/${match[1]}`;
      console.log(`[PROXY] B2 URL → backend proxy: ${proxyUrl}`);
      return proxyUrl;
    }
    
    return url;
  };

  // ==========================================
  // SUPER CACHE: Almacena Audio Files en Disco (IndexedDB / Cache API)
  // ==========================================
  const getCachedAudioBlobUrl = async (url: string): Promise<string> => {
    try {
      const cache = await caches.open('moises-audio-cache');
      let response = await cache.match(url);
      if (!response) {
        console.log(`[AUDIO CACHE MISS] Network Load para ${url}...`);
        response = await fetch(url);
        if (response.ok) {
           await cache.put(url, response.clone());
        }
      } else {
        console.log(`[AUDIO CACHE HIT] Sirviendo ${url} al 100% desde DISCO duro local 🚀!`);
      }
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (e) {
      console.warn('Error usando Cache de Disco Local, cayendo a red', e);
      return url;
    }
  };

  const loadAudioFiles = async (song: Song) => {
    if (!song.stems) return
    
    // Esperar a que el cache esté cargado
    if (!cacheLoaded) {
      console.log('Esperando a que el cache se cargue...')
      return
    }
    
    console.log(' Cache cargado, iniciando carga de audio...')
    console.log(' Cache actual:', Object.keys(waveformCache).length, 'entradas')

    // Cargar colores guardados de Firestore
    if (song.trackColors) {
      setTrackColors(song.trackColors);
      console.log(' Colores de tracks cargados desde Firestore:', song.trackColors);
    }

    // Resetear SOLO si no hay audios cargados (primera vez)
    if (Object.keys(audioElements).length === 0) {
      setIsPlaying(false);
      setCurrentTime(0);
      console.log(' Primera carga de canción - reseteando estado')
    }
    setTrackOnsets({});
    
    // Limpiar audio anterior
    Object.values(audioElements).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    });
    
    console.log('Estado de reproduccion reseteado para nueva cancion');

    setIsLoadingAudio(true)
    const newAudioElements: { [key: string]: HTMLAudioElement } = {}
    const newWaveforms: { [key: string]: number[] } = {}
    const newLoadingStates: { [key: string]: 'idle' | 'loading' | 'cached' | 'ready' } = {}

    try {
      console.log(' Loading song tracks:', song.stems)
      for (let [trackKey, originalTrackUrl] of Object.entries(song.stems)) {
        const cacheKeyUrl = getProxyUrl(originalTrackUrl);
        if (cacheKeyUrl) {
          console.log(` Loading audio for ${trackKey}: ${cacheKeyUrl}`)
          
          // Magia de Disco: Descargar o recuperar del disco local y convertir en Blob Instantáneo
          const trackUrl = await getCachedAudioBlobUrl(cacheKeyUrl);
          
          // 1. PRIMERO: Buscar en cache localStorage
          if (waveformCache[cacheKeyUrl]) {
            console.log(` CACHE HIT para ${trackKey}`)
            newLoadingStates[trackKey] = 'cached'
            newWaveforms[trackKey] = waveformCache[cacheKeyUrl]
            
            // Crear elemento audio desde cache
            const audio = new Audio(trackUrl)
            audio.crossOrigin = 'anonymous'
            audio.preload = 'auto'
            
            
            // Event listener para cuando termine la canción
            audio.addEventListener('ended', () => {
              console.log(`🏁 ${trackKey} ended - stopping all tracks`)
              // Pausar todos los audios y volver al inicio
              Object.values(newAudioElements).forEach(audio => {
                audio.pause();
                audio.currentTime = 0;
              });
              setIsPlaying(false);
              setCurrentTime(0);
            })
            
            newAudioElements[trackKey] = audio
            
            // Detectar onset también para archivos en cache
            try {
              console.log(`[ONSET] Detectando onset para ${trackKey} (desde cache)...`)
              const response = await fetch(trackUrl)
              const arrayBuffer = await response.arrayBuffer()
              const tempContext = new AudioContext()
              const audioBuffer = await tempContext.decodeAudioData(arrayBuffer)
              tempContext.close()
              
              const onsetTimeMs = detectOnset(audioBuffer)
              console.log(`[ONSET] ${trackKey}: Primer ataque en ${onsetTimeMs}ms`)
              setTrackOnsets(prev => {
                const updated = { ...prev, [trackKey]: onsetTimeMs }
                console.log(`[ONSET] trackOnsets actualizado:`, updated)
                return updated
              })
            } catch (error) {
              console.error(`[ONSET] Error detectando onset para ${trackKey}:`, error)
            }
            
            continue
          }
          
          // 2. SEGUNDO: Si no está en cache, descargar de B2
          console.log(` CACHE MISS para ${trackKey} - descargando de B2`)
          
          // Marcar como cargando desde B2
          newLoadingStates[trackKey] = 'loading'
          setTrackLoadingStates(prev => ({ ...prev, [trackKey]: 'loading' }))
          
          const audio = new Audio(trackUrl)
          audio.crossOrigin = 'anonymous'
          audio.preload = 'auto'
          
          
          // Agregar logging para diagnóstico
          audio.addEventListener('loadedmetadata', () => {
            console.log(` ${trackKey} metadata loaded:`, {
              duration: audio.duration,
              readyState: audio.readyState,
              src: audio.src
            })
            
          })
          
          audio.addEventListener('canplaythrough', () => {
            console.log(` ${trackKey} can play through:`, {
              duration: audio.duration,
              readyState: audio.readyState
            })
            
          })
          
          // Event listener para cuando termine la canción
          audio.addEventListener('ended', () => {
            console.log(`🏁 ${trackKey} ended - stopping all tracks`)
            // Pausar todos los audios y volver al inicio
            Object.values(newAudioElements).forEach(audio => {
              audio.pause();
              audio.currentTime = 0;
            });
            setIsPlaying(false);
            setCurrentTime(0);
          })
          
          audio.addEventListener('error', (e) => {
            console.error(` ${trackKey} audio error:`, e)
          })
          
          // Esperar a que el audio esté listo
          await new Promise((resolve, reject) => {
            const onCanPlay = () => {
              audio.removeEventListener('canplaythrough', onCanPlay)
              audio.removeEventListener('error', onError)
              console.log(` ${trackKey} audio ready to play`)
              resolve(true)
            }
            const onError = (e: any) => {
              audio.removeEventListener('canplaythrough', onCanPlay)
              audio.removeEventListener('error', onError)
              console.error(` ${trackKey} audio failed to load:`, e)
              reject(e)
            }
            audio.addEventListener('canplaythrough', onCanPlay)
            audio.addEventListener('error', onError)
            audio.load()
          })
          
          newAudioElements[trackKey] = audio
          
          // Generar waveform real del audio
          try {
            console.log(` Generating waveform for ${trackKey}`)
            
            
            const response = await fetch(trackUrl)
            const arrayBuffer = await response.arrayBuffer()
            
            // Verificar si el archivo tiene contenido
            console.log(`${trackKey} file size: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`)
            
            
            const tempContext = new AudioContext()
            const audioBuffer = await tempContext.decodeAudioData(arrayBuffer)
            tempContext.close()
            
            
            // Detectar onset (primer ataque de audio) de este track
            console.log(`[ONSET] Detectando onset para ${trackKey}...`)
            const onsetTimeMs = detectOnset(audioBuffer)
            console.log(`[ONSET] ${trackKey}: Primer ataque en ${onsetTimeMs}ms`)
            setTrackOnsets(prev => {
              const updated = { ...prev, [trackKey]: onsetTimeMs }
              console.log(`[ONSET] trackOnsets actualizado:`, updated)
              return updated
            })
            
            // Verificar el contenido del audio de forma eficiente
            const channelData = audioBuffer.getChannelData(0)
            
            // Calcular maxAmplitude de forma eficiente sin desbordamiento de pila
            let maxAmplitude = 0
            for (let i = 0; i < channelData.length; i++) {
              const abs = Math.abs(channelData[i])
              if (abs > maxAmplitude) {
                maxAmplitude = abs
              }
            }
            
            // Calcular rmsAmplitude de forma eficiente
            let sumSquares = 0
            for (let i = 0; i < channelData.length; i++) {
              sumSquares += channelData[i] * channelData[i]
            }
            const rmsAmplitude = Math.sqrt(sumSquares / channelData.length)
            
            console.log(` ${trackKey} audio analysis:`, {
              samples: channelData.length,
              maxAmplitude: maxAmplitude,
              rmsAmplitude: rmsAmplitude,
              duration: audioBuffer.duration,
              sampleRate: audioBuffer.sampleRate,
              hasAudio: maxAmplitude > 0.001
            })
            
            // Generar waveform profesional de alta precisión
            const waveformData = generateProfessionalWaveform(channelData, 800) // Más puntos para mayor precisión
            newWaveforms[trackKey] = waveformData
            
            
            // 3. GUARDAR en cache persistente para próximas veces
            const newPersistentCache = { ...waveformCache, [cacheKeyUrl]: waveformData }
            setWaveformCache(newPersistentCache)
            try {
              localStorage.setItem('waveform-cache', JSON.stringify(newPersistentCache))
              console.log(` GUARDADO en cache para ${trackKey}`)
            } catch (e) {
              // Si localStorage está lleno, limpiar cache viejo y reintentar
              console.warn('Cache lleno, limpiando cache viejo...')
              localStorage.removeItem('waveform-cache')
              try {
                localStorage.setItem('waveform-cache', JSON.stringify({ [cacheKeyUrl]: waveformData }))
                console.log(` GUARDADO en cache (después de limpiar) para ${trackKey}`)
              } catch (e2) {
                console.error('No se pudo guardar en cache:', e2)
              }
            }
            
            newLoadingStates[trackKey] = 'ready'
            console.log(` Waveform generado para ${trackKey}: ${waveformData.length} puntos`)
            
          } catch (error) {
            console.error(`Error generating waveform for ${trackKey}:`, error)
            newLoadingStates[trackKey] = 'idle'
          }
          
          console.log(`Audio loaded successfully for ${trackKey}`)
        }
      }
      
      // Cache ya se actualizó durante el loop
      
      setAudioElements(newAudioElements)
      setWaveforms(newWaveforms)
      setTrackLoadingStates(newLoadingStates)
      
      // NO resetear el tiempo si ya había audios cargados
      // Esto previene que se reinicie cuando se recarga por cambios de color u otras actualizaciones
      console.log(' Carga completada - manteniendo estado de reproducción actual')
      
      console.log('All audio files loaded:', Object.keys(newAudioElements))
      console.log('All waveforms generated:', Object.keys(newWaveforms))
    } catch (error) {
      console.error('Error loading audio files:', error)
    } finally {
      setIsLoadingAudio(false)
    }
  }

  // useEffect para actualizar currentTime durante la reproducción
  useEffect(() => {
    if (!isPlaying || Object.keys(audioElements).length === 0) {
      return;
    }

    const updateTime = () => {
      // NO actualizar si acabamos de hacer un seek manual (últimos 1500ms)
      const timeSinceLastSeek = Date.now() - lastSeekTimeRef.current;
      if (timeSinceLastSeek < 1500) {
        return;
      }
      
      // Usar el primer elemento de audio como referencia para el tiempo
      const firstAudio = Object.values(audioElements)[0];
      if (firstAudio) {
        setCurrentTime(firstAudio.currentTime);
        setDuration(firstAudio.duration || 0);
      }
    };

    // Actualizar tiempo cada 100ms
    const interval = setInterval(updateTime, 100);

    // También escuchar eventos timeupdate de todos los audios
    const audioElementsArray = Object.values(audioElements);
    audioElementsArray.forEach(audio => {
      audio.addEventListener('timeupdate', updateTime);
    });

    return () => {
      clearInterval(interval);
      audioElementsArray.forEach(audio => {
        audio.removeEventListener('timeupdate', updateTime);
      });
    };
  }, [isPlaying, audioElements]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-teal-500 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-white font-bold text-2xl">J</span>
          </div>
          <p className="text-white text-lg">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">Por favor, inicia sesión</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Main Content */}
      <div className="flex flex-col">
        {/* Header Compacto */}
        <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <img 
                src="/images/logo.png" 
                alt="Judith Logo" 
                className="h-10 w-auto object-contain"
              />
              <span className="text-xs text-gray-400">v1.0</span>
            </div>
            <ConnectionStatus />
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowMoisesStyleModal(true)}
              className="px-4 py-2 hover:bg-gray-700 transition-colors duration-200 rounded-lg"
              title="Subir Canción"
            >
              <img 
                src="/images/subir.png" 
                alt="Subir Canción"
                className="h-10 w-auto object-contain"
              />
            </button>
            
            {/* Botón Admin - Solo visible para admin */}
            {user.email === 'ueservicesllc1@gmail.com' && (
              <button
                onClick={() => router.push('/admin')}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold transition-all duration-200"
                style={{
                  boxShadow: '0 0 10px rgba(147, 51, 234, 0.4)'
                }}
                title="Administración"
              >
                ADMIN
              </button>
            )}
            
            {/* User Profile */}
            <div className="flex items-center space-x-3 border-l border-gray-600 pl-4">
              {user.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt="Profile" 
                  className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-6 h-6 bg-gray-700 flex items-center justify-center rounded-full">
                    <User className="w-3 h-3 text-white" />
                  </div>
                )}
                <div className="text-right">
                  <div className="text-white text-xs font-medium">
                    {user.displayName || user.email?.split('@')[0] || 'Usuario'}
                  </div>
                  <div className="text-gray-400 text-xs">Free</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1 text-white hover:text-white hover:bg-gray-700 transition-colors"
                  title="Cerrar sesión"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* CoverFlow Menu Principal */}
        {showCoverFlow && (
          <CoverFlow 
            covers={musicCovers}
            onCoverSelect={(cover) => {
              console.log('Cover selected:', cover.title);
            }}
          />
        )}

        {/* Songs Table */}
        <div className="flex-1 p-2 bg-black pb-24">
          {songsLoading ? (
            <div className="bg-gray-900 p-12 text-center">
              <div className="w-16 h-16 bg-gray-800 flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Music className="w-8 h-8 text-white" />
              </div>
              <p className="text-white text-lg">Cargando canciones...</p>
            </div>
          ) : songs.length === 0 ? (
            <div className="bg-gray-900 p-12 text-center">
              <div className="w-16 h-16 bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <Music className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-medium text-white mb-2">No songs yet</h3>
              <p className="text-white mb-6">Upload your first audio file to get started with track separation</p>
              <button 
                onClick={() => setShowMoisesStyleModal(true)}
                className="bg-teal-500 hover:bg-teal-600 text-white px-6 py-3 flex items-center space-x-2 mx-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Upload Audio</span>
              </button>
            </div>
          ) : (
            <div className="bg-gray-900 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="text-left py-3 px-4 text-white font-medium">Song</th>
                    <th className="text-left py-3 px-4 text-white font-medium">BPM</th>
                    <th className="text-left py-3 px-4 text-white font-medium">Key</th>
                    <th className="text-left py-3 px-4 text-white font-medium">Time Sig</th>
                    <th className="text-left py-3 px-4 text-white font-medium">Duration</th>
                    <th className="text-left py-3 px-4 text-white font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {songs.map((song, index) => (
                    <tr key={song.id} data-song-id={song.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                      <td className="py-2 px-4">
                        <div className="flex items-center space-x-3">
                          <span className="text-gray-400 text-xs font-mono w-4">{index + 1}</span>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              console.log('Opening modal for song:', song.title);
                              setSelectedSong(song);
                              setShowSongModal(true);
                              // Cargar audio después de un pequeño delay para asegurar que el modal esté abierto
                              setTimeout(() => loadAudioFiles(song), 100);
                              // Analizar BPM y offset si la canción tiene un archivo original - REMOVED
                            }}
                            className="flex-1 text-left hover:bg-gray-800 p-2 transition-colors"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-gray-700 flex items-center justify-center">
                                <Music className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <div className="text-white text-sm">{song.title}</div>
                                <div className="text-white text-xs">{song.artist}</div>
                              </div>
                            </div>
                          </button>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-white text-sm">{song.bpm ? (song.bpm % 1 === 0 ? song.bpm.toFixed(0) : song.bpm.toFixed(1)) : 'Calculando...'}</td>
                      <td className="py-2 px-4 text-white text-sm">{song.key || '-'}</td>
                      <td className="py-2 px-4 text-white text-sm">{song.timeSignature || '4/4'}</td>
                      <td className="py-2 px-4 text-white text-sm">{song.duration || 'Calculando...'}</td>
                      <td className="py-2 px-4">
                        <div className="flex items-center space-x-2">
                          
                          
                          {song.stems && Object.keys(song.stems).length > 0 && (
                            <>
                            </>
                          )}
                          
                          {/* Botones de control de audio original */}
                          <div className="flex items-center space-x-1">
                            {/* Botón Play/Pause */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlayOriginalAudio(song);
                              }}
                              className="p-1 hover:bg-gray-800 transition-colors duration-200"
                              title={currentPlayingSong === song.id ? "Pausar audio original" : "Reproducir audio original"}
                            >
                              <img 
                                src={currentPlayingSong === song.id ? "/images/pausa.png" : "/images/play.png"} 
                                alt={currentPlayingSong === song.id ? "Pause" : "Play"}
                                className="w-10 h-10"
                              />
                            </button>
                            
                            {/* Botón Stop */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStopOriginalAudio(song);
                              }}
                              className="p-1 hover:bg-gray-800 transition-colors duration-200"
                              title="Detener audio original"
                            >
                              <img 
                                src="/images/stop.png" 
                                alt="Stop"
                                className="w-10 h-10"
                              />
                            </button>
                          </div>
                          
                        {/* Botón de eliminar con icono de basura */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('🗑️ Click en eliminar:', song.title);
                            setDeleteConfirmModal({ show: true, song: song });
                          }}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-all duration-200"
                          title="Eliminar canción"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-4 py-4">
        <div className="flex items-center space-x-2">
          <Volume2 className="w-4 h-4 text-gray-400" />
        </div>
        <div className="text-gray-400 text-sm font-light tracking-wide">
          Powered & Designed by <span className="text-gray-300 font-medium">Freedom Labs</span>
        </div>
        <div className="flex items-center space-x-3">
          <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors" title="Facebook">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </a>
          <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors" title="Instagram">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987 6.62 0 11.987-5.367 11.987-11.987C24.014 5.367 18.637.001 12.017.001zM8.449 16.988c-1.297 0-2.448-.49-3.323-1.297C4.198 14.895 3.708 13.744 3.708 12.447s.49-2.448 1.297-3.323c.875-.807 2.026-1.297 3.323-1.297s2.448.49 3.323 1.297c.807.875 1.297 2.026 1.297 3.323s-.49 2.448-1.297 3.323c-.875.807-2.026 1.297-3.323 1.297zm7.83-9.281H7.721v8.562h8.558V7.707z"/>
            </svg>
          </a>
          <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors" title="X (Twitter)">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a href="#" className="text-gray-400 hover:text-gray-300 transition-colors" title="TikTok">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
          </a>
        </div>
      </div>


      {/* Moises Style Upload Modal */}
      {showMoisesStyleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-black mx-auto flex flex-col border border-white border-opacity-20 relative max-w-5xl" style={{transform: 'scale(1.2)'}}>
            {/* Botón de cerrar */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={closeMoisesModal}
                className="text-white hover:text-gray-400 transition-colors bg-gray-800 hover:bg-gray-700 p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="overflow-y-auto p-5">
              <div className="mx-auto space-y-5">
                <MoisesStyleUpload 
                  preloadedFile={preloadedAudioFile}
                  onUploadComplete={(songData) => {
                    console.log('✅ Canción subida:', songData);
                    setPreloadedAudioFile(null);
                    closeMoisesModal();
                    
                    // Buscar y abrir la canción
                    const song = songs.find(s => s.id === songData.id);
                    if (song) {
                      setSelectedSong(song);
                      setShowSongModal(true);
                    }
                  }} 
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Song Modal */}
      {showSongModal && selectedSong && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

          <div className="bg-gray-800 w-[90vw] h-[90vh] mx-4 flex flex-col border border-white border-opacity-20">
            {/* Header - 10% de la pantalla */}
            <div className="bg-black h-[10vh] flex items-center justify-between px-6">
              {/* Controles de audio en el lado izquierdo */}
              <div className="flex items-center">
                {/* Botón Play/Pause */}
                <button
                  onClick={togglePlayPause}
                  className="bg-black/40 backdrop-blur-md hover:bg-black/60 w-16 h-16 flex items-center justify-center transition-all duration-300 shadow-lg"
                >
                  <img 
                    src={isPlaying ? "/images/pausa.png" : "/images/play.png"} 
                    alt={isPlaying ? "Pause" : "Play"}
                    className="w-10 h-10"
                  />
                </button>
                
                {/* Botón Stop */}
                <button
                  onClick={() => {
                    Object.entries(audioElements).forEach(([trackKey, audio]) => {
                      audio.pause();
                      // Todos los tracks se resetean al tiempo 0
                      audio.currentTime = 0;
                    });
                    setIsPlaying(false);
                    setCurrentTime(0); // Resetear el tiempo actual
                    
                    // Metrónomo deshabilitado temporalmente
                    // stopMetronome();
                  }}
                  className="bg-black/40 backdrop-blur-md hover:bg-black/60 w-16 h-16 flex items-center justify-center transition-all duration-300 shadow-lg -ml-2"
                >
                  <img 
                    src="/images/stop.png" 
                    alt="Stop"
                    className="w-10 h-10"
                  />
                </button>
                
                
                {/* Pantalla LED - Tiempo actual */}
                <div className="bg-black p-1 shadow-lg">
                  <div className="bg-gray-800 text-gray-200 font-mono text-sm font-bold tracking-wider px-1 py-0.5">
                    {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                
                {/* Espacio separador */}
                <div className="w-2"></div>
                
                {/* Barra de progreso */}
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-52 h-1 bg-gray-700 appearance-none cursor-pointer accent-teal-500"
                />
                
                {/* Espacio separador */}
                <div className="w-2"></div>
                
                {/* Pantalla LED - Duración total */}
                <div className="bg-black p-1 shadow-lg">
                  <div className="bg-gray-700 text-gray-100 font-mono text-sm font-bold tracking-wider px-1 py-0.5">
                    {duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '0:00'}
                  </div>
                </div>
                
                {/* Espacio separador */}
                <div className="w-2"></div>
                
                {/* Control de volumen */}
                <div className="flex items-center space-x-3">
                  <button
                    onClick={toggleMute}
                    className="bg-black/40 backdrop-blur-md hover:bg-black/60 w-16 h-16 flex items-center justify-center transition-all duration-300 shadow-lg"
                  >
                    <img 
                      src={isMuted ? "/images/unmute.png" : "/images/mute.png"} 
                      alt={isMuted ? "Unmute" : "Mute"}
                      className="w-10 h-10"
                    />
                  </button>
                  
                  {/* Control de volumen master */}
                  <div className="flex items-center space-x-2">
                    <span className="text-white text-xs font-mono">Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-20 h-1 bg-gray-600 appearance-none cursor-pointer accent-yellow-400"
                    />
                    <span className="text-white text-xs font-mono w-8">
                      {Math.round((isMuted ? 0 : volume) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
              

              {/* BPM and Key Display */}
              <BpmDisplay 
                songId={selectedSong?.id}
                originalUrl={selectedSong?.fileUrl}
                headerBpm={selectedSong?.bpm}
                headerKey={selectedSong?.key}
              />

              {/* Botón Metronome - REMOVED */}
              
              {/* Botón de cerrar en el lado derecho */}
              <button
                onClick={() => {
                  // Limpiar elementos de audio
                  Object.values(audioElements).forEach(audio => {
                    audio.pause()
                    audio.currentTime = 0
                    audio.src = ''
                  })
                  
                  // Limpiar también los elementos de audio original
                  Object.values(originalAudioElements).forEach(audio => {
                    audio.pause()
                    audio.currentTime = 0
                    audio.src = ''
                  })
                  
                  setAudioElements({})
                  setWaveforms({})
                  setTrackLoadingStates({})
                  setOriginalAudioElements({})
                  setCurrentPlayingSong(null)
                  closeSongModal()
                }}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Línea separadora */}
            <div className="h-[20px] bg-gray-950 w-full"></div>
            
            {/* Tracks Area - 60% */}
            <div className="h-[60vh] bg-gray-900 flex overflow-hidden">
              {/* Área fija de controles a la izquierda */}
              <div className="w-40 bg-gray-700 border-r border-gray-600 flex flex-col flex-shrink-0">
                {(() => {
                  const tracks = selectedSong?.stems ? Object.entries(selectedSong.stems) : [];
                  
                  return tracks.length > 0;
                })() ? (
                  (() => {
                    const tracks = selectedSong?.stems ? Object.entries(selectedSong.stems) : [];
                    
                    
                    return tracks;
                  })().map(([trackKey, trackUrl], index) => {
                    // Colores grises escalados para cada track (fallback)
                    const grayColors = [
                      'bg-gray-700',  // Gris oscuro
                      'bg-gray-600',  // Gris medio-oscuro
                      'bg-gray-800',  // Gris muy oscuro
                      'bg-gray-500',  // Gris medio
                      'bg-gray-900',  // Gris casi negro
                      'bg-gray-700',  // Gris oscuro (repetir)
                    ];
                    const defaultColor = grayColors[index % grayColors.length];
                    const trackBackgroundColor = trackColors[trackKey] || defaultColor;
                    
                    const trackConfig = {
                      vocals: { color: 'bg-pink-500', letter: 'V', name: 'Vocals' },
                      instrumental: { color: 'bg-blue-500', letter: 'I', name: 'Instrumental' },
                      drums: { color: 'bg-orange-500', letter: 'D', name: 'Drums' },
                      bass: { color: 'bg-green-500', letter: 'B', name: 'Bass' },
                      other: { color: 'bg-purple-500', letter: 'O', name: 'Other' },
                      piano: { color: 'bg-yellow-500', letter: 'P', name: 'Piano' },
                    };
                    
                    const config = trackConfig[trackKey as keyof typeof trackConfig] || { 
                      color: 'bg-gray-500', 
                      letter: trackKey.charAt(0).toUpperCase(), 
                      name: trackKey 
                    };
                    
                    // Si es el track del metronome, renderizar componente especial - REMOVED
                    
                    return (
                      <div key={trackKey} className="h-[12%] border-b border-gray-600 flex flex-col items-start justify-between p-2">
                        {/* Parte superior con nombre y color */}
                        <div className="flex items-start justify-between w-full">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-white text-xs font-bold">{config.name}</span>
                              {/* Mostrar mensaje especial para track temporal de generación */}
                              {trackUrl === undefined ? (
                                <span className="text-gray-400 text-[10px] font-mono bg-gray-800/50 px-1 rounded animate-pulse">
                                  Generando...
                                </span>
                              ) : (
                                <>
                                  {(() => {
                                    const onsetValue = trackOnsets[trackKey];
                                    return onsetValue !== undefined && (
                                      <span className="text-gray-300 text-[10px] font-mono bg-gray-800/50 px-1 rounded">
                                        {onsetValue}ms
                                      </span>
                                    );
                                  })()}
                                </>
                              )}
                            </div>
                          </div>
                          
                          {/* Botón selector de color - LED parpadeante */}
                          <button
                            onClick={() => setShowColorPicker(trackKey)}
                            className="w-4 h-2 rounded border border-gray-600 hover:border-white transition-all duration-300 animate-pulse shadow-lg"
                            style={{ 
                              backgroundColor: getColorFromClass(trackBackgroundColor),
                              boxShadow: `0 0 4px ${getColorFromClass(trackBackgroundColor)}, 0 0 8px ${getColorFromClass(trackBackgroundColor)}`
                            }}
                            title="Cambiar color del track"
                          />
                          
                          {/* Botón de debug temporal para click track */}
                        </div>
                        
                        {/* Slider de Volumen + Botones M y S - Solo mostrar si no se está generando */}
                        {trackUrl !== null && (
                          <div className="flex flex-col space-y-1 w-full">
                            {/* Slider de Volumen Horizontal - Sin punto, solo barra */}
                            <div className="w-full relative">
                              {/* Barra de fondo */}
                              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                                <div 
                                  className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-150"
                                  style={{ width: `${(trackVolumeStates[trackKey] ?? 1) * 100}%` }}
                                />
                              </div>
                              {/* Input invisible sobre la barra */}
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={trackVolumeStates[trackKey] ?? 1}
                                onChange={(e) => setTrackVolume(trackKey, parseFloat(e.target.value))}
                                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                title={`Volumen: ${Math.round((trackVolumeStates[trackKey] ?? 1) * 100)}%`}
                              />
                            </div>

                            {/* Botones M y S */}
                            <div className="flex space-x-1 self-end">
                              <button
                                onClick={() => toggleTrackMute(trackKey)}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-all text-xs font-bold ${
                                  trackMutedStates[trackKey] 
                                    ? 'bg-yellow-500 text-gray-900' 
                                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                                }`}
                                style={trackMutedStates[trackKey] ? {
                                  boxShadow: '0 0 6px rgba(234, 179, 8, 0.4)'
                                } : {}}
                                title={trackMutedStates[trackKey] ? "Unmute track" : "Mute track"}
                              >
                                M
                              </button>
                              
                              <button
                                onClick={() => toggleTrackSolo(trackKey)}
                                className={`w-5 h-5 rounded flex items-center justify-center transition-all text-xs font-bold ${
                                  trackSoloStates[trackKey] 
                                    ? 'bg-yellow-500 text-gray-900' 
                                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                                }`}
                                style={trackSoloStates[trackKey] ? {
                                  boxShadow: '0 0 6px rgba(234, 179, 8, 0.4)'
                                } : {}}
                                title={trackSoloStates[trackKey] ? "Desactivar solo" : "Solo track"}
                              >
                                S
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : null}
                
              </div>
              
              {/* Área de tracks (sin controles) */}
              <div className="flex-1 overflow-x-auto overflow-y-hidden">
                <div className="h-full flex flex-col min-w-full">
                  {(() => {
                    const tracks = selectedSong?.stems ? Object.entries(selectedSong.stems) : [];
                    
                    
                    return tracks.length > 0;
                  })() ? (
                  (() => {
                    const tracks = selectedSong?.stems ? Object.entries(selectedSong.stems) : [];
                    
                    
                    return tracks;
                  })().map(([trackKey, trackUrl], index) => {
                    // Colores grises escalados para cada track (fallback)
                    const grayColors = [
                      'bg-gray-700',  // Gris oscuro
                      'bg-gray-600',  // Gris medio-oscuro
                      'bg-gray-800',  // Gris muy oscuro
                      'bg-gray-500',  // Gris medio
                      'bg-gray-900',  // Gris casi negro
                      'bg-gray-700',  // Gris oscuro (repetir)
                    ];
                    const defaultColor = grayColors[index % grayColors.length];
                    const trackBackgroundColor = trackColors[trackKey] || defaultColor;
                    
                    const trackConfig = {
                      vocals: { color: 'bg-pink-500', letter: 'V', name: 'Vocals' },
                      instrumental: { color: 'bg-blue-500', letter: 'I', name: 'Instrumental' },
                      drums: { color: 'bg-orange-500', letter: 'D', name: 'Drums' },
                      bass: { color: 'bg-green-500', letter: 'B', name: 'Bass' },
                      other: { color: 'bg-purple-500', letter: 'O', name: 'Other' },
                      piano: { color: 'bg-yellow-500', letter: 'P', name: 'Piano' },
                    };
                    
                    const config = trackConfig[trackKey as keyof typeof trackConfig] || { 
                      color: 'bg-gray-500', 
                      letter: trackKey.charAt(0).toUpperCase(), 
                      name: trackKey 
                    };
                    
                    return (
                      <div key={trackKey} className="h-[12%] w-full min-w-[800px]">
                        {/* Track independiente */}
                        <div className={`h-full ${trackBackgroundColor} border-b border-gray-700 min-w-0 relative overflow-visible`}>
                          {/* Waveform Container - Sin restricciones */}
                          <div className="w-full h-full relative flex items-center justify-center px-0 overflow-visible">
                            {/* Mostrar mensaje especial para track temporal de generación */}
                            {trackUrl === null ? (
                              <div className="flex items-center justify-center w-full h-full">
                                <div className="text-center">
                                  <div className="text-gray-300 text-sm font-bold animate-pulse">
                                    Generando Track...
                                  </div>
                                  <div className="text-gray-500 text-xs mt-1">
                                    Detectando onsets y calculando sincronización
                                  </div>
                                </div>
                              </div>
                            ) : waveforms[trackKey] && waveforms[trackKey].length > 0 ? (
                              <div className="w-full h-full relative flex items-center justify-center">
                                {waveformStyle === 'bars' && (
                                  // Waveform profesional estilo DAW
                                  <div className="flex items-center justify-center h-full w-full relative">
                                    <svg 
                                      width="100%" 
                                      height="100%" 
                                      viewBox="0 0 800 60"
                                      className="absolute inset-0"
                                      preserveAspectRatio="none"
                                    >
                                      <defs>
                                        <linearGradient id={`waveGradient-${trackKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                          <stop offset="0%" style={{stopColor: '#FFFFFF', stopOpacity: 0.9}} />
                                          <stop offset="100%" style={{stopColor: '#FFFFFF', stopOpacity: 0.9}} />
                                        </linearGradient>
                                      </defs>
                                      
                                      {/* Línea central */}
                                      <line x1="2" y1="30" x2="800" y2="30" stroke="#374151" strokeWidth="0.5" opacity="0.3"/>
                                      
                                      {/* Waveform rellena profesional */}
                                      <path
                                        d={generateFilledWaveformPath(waveforms[trackKey])}
                                        fill={`url(#waveGradient-${trackKey})`}
                                        stroke="none"
                                      />
                                      
                                      {/* Contorno de la waveform */}
                                      <path
                                        d={waveforms[trackKey].map((value, index) => {
                                          const x = 2 + (index / (waveforms[trackKey].length - 1)) * 798;
                                          const y = 30 - (value * 25);
                                          return index === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                                        }).join(' ')}
                                        fill="none"
                                        stroke="#FFFFFF"
                                        strokeWidth="1"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        opacity="0.8"
                                      />
                                      
                                      <path
                                        d={waveforms[trackKey].map((value, index) => {
                                          const x = 2 + (index / (waveforms[trackKey].length - 1)) * 798;
                                          const y = 30 + (value * 25);
                                          return index === 0 ? `M ${x},${y}` : `L ${x},${y}`;
                                        }).join(' ')}
                                        fill="none"
                                        stroke="#FFFFFF"
                                        strokeWidth="1"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        opacity="0.8"
                                      />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-gray-500 text-xs text-center">
                                {isLoadingAudio ? 'Loading...' : 
                                 audioElements[trackKey] ? 'Ready' : 
                                 trackUrl ? 'Available' : 'Not available'}
                              </div>
                            )}
                          </div>
                          
                          {/* Línea de reproducción profesional sincronizada - CLICKEABLE */}
                          {audioElements[trackKey] && duration > 0 && (
                            <div 
                              className="absolute inset-0 z-20 cursor-pointer"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect()
                                const x = e.clientX - rect.left
                                const percentage = x / rect.width
                                const newTime = percentage * duration
                                
                                // Marcar timestamp del seek manual
                                lastSeekTimeRef.current = Date.now();
                                
                                // Actualizar tiempo en todos los tracks
                                Object.values(audioElements).forEach(audio => {
                                  audio.currentTime = newTime
                                })
                                Object.values(originalAudioElements).forEach(audio => {
                                  audio.currentTime = newTime
                                })
                                setCurrentTime(newTime)
                                console.log('⏩ Seek a:', newTime.toFixed(2), 's')
                              }}
                            >
                              {/* Línea de reproducción principal */}
                              <div 
                                className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 shadow-lg pointer-events-none"
                                style={{ 
                                  left: `${Math.max(0, Math.min(100, (currentTime / Math.max(duration, 0.1)) * 100))}%`,
                                  boxShadow: '0 0 4px rgba(251, 191, 36, 0.8)'
                                }}
                              />
                              
                              {/* Indicador de posición en la waveform */}
                              <div 
                                className="absolute top-1/2 w-2 h-2 bg-yellow-400 rounded-full shadow-lg transform -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                                style={{ 
                                  left: `${Math.max(0, Math.min(100, (currentTime / Math.max(duration, 0.1)) * 100))}%`,
                                  boxShadow: '0 0 6px rgba(251, 191, 36, 1)'
                                }}
                              />
                              
                              {/* Área ya reproducida */}
                              <div 
                                className="absolute inset-y-0 bg-gradient-to-r from-gray-600/20 to-transparent pointer-events-none"
                                style={{ 
                                  width: `${Math.max(0, Math.min(100, (currentTime / Math.max(duration, 0.1)) * 100))}%`
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-gray-400 text-center">
                      <p>No stems available</p>
                      <p className="text-xs mt-2">This song hasn't been processed yet</p>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Mixer Area - 30% */}
            <div className="h-[30vh] bg-black pl-6 pr-[20px] pt-6 pb-6">
              <div className="h-full">
                {showEQInMixer ? (
                  <VolumeEQModal
                    isOpen={true}
                    onClose={() => setShowEQInMixer(false)}
                  />
                ) : (
                  <ChordAnalysis
                    audioUrl={selectedSong?.originalUrl || selectedSong?.fileUrl}
                    currentTime={currentTime}
                    duration={duration || 0}
                    isPlaying={isPlaying}
                    onSeekTo={(time) => {
                      // Implementar búsqueda en el audio
                      Object.entries(audioElements).forEach(([trackKey, audio]) => {
                        audio.currentTime = time;
                      });
                      Object.entries(originalAudioElements).forEach(([trackKey, audio]) => {
                        audio.currentTime = time;
                      });
                      setCurrentTime(time);
                    }}
                    songChords={selectedSong?.chords}
                    songKeyInfo={selectedSong?.keyInfo}
                    showEQButton={true}
                    onEQClick={() => {
                      setShowEQInMixer(true);
                    }}
                    onEQChange={(bass, mid, treble) => {
                      // Aplicar valores a los filtros de EQ
                      if (bassFilterRef.current) {
                        bassFilterRef.current.gain.value = bass;
                      }
                      if (midFilterRef.current) {
                        midFilterRef.current.gain.value = mid;
                      }
                      if (trebleFilterRef.current) {
                        trebleFilterRef.current.gain.value = treble;
                      }
                    }}
                    audioElements={audioElements}
                    songBPM={selectedSong?.bpm}
                    stems={selectedSong?.stems}
                    songId={selectedSong?.id}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de selección de colores */}
      {showColorPicker && (
        <div className="fixed inset-0 z-50">
          <div className="absolute left-[160px] top-20 bg-gray-800 rounded-lg p-2 w-48 border border-gray-600 shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-white text-sm font-bold">Colores</h3>
              <button
                onClick={() => setShowColorPicker(null)}
                className="text-gray-400 hover:text-white text-lg"
              >
                ×
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {/* Columna Amarillo */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#FFFF00]')}
                  className="w-10 h-10 bg-[#FFFF00] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Amarillo puro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#FFD700]')}
                  className="w-10 h-8 bg-[#FFD700] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Amarillo dorado"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#FFA500]')}
                  className="w-10 h-8 bg-[#FFA500] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Amarillo naranja"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#FF8C00]')}
                  className="w-10 h-8 bg-[#FF8C00] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Amarillo oscuro"
                />
              </div>
              
              {/* Columna Azul */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#0000FF]')}
                  className="w-10 h-10 bg-[#0000FF] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Azul puro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#0080FF]')}
                  className="w-10 h-8 bg-[#0080FF] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Azul claro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#0066CC]')}
                  className="w-10 h-8 bg-[#0066CC] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Azul medio"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#003399]')}
                  className="w-10 h-8 bg-[#003399] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Azul oscuro"
                />
              </div>
              
              {/* Columna Rojo */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#FF0000]')}
                  className="w-10 h-10 bg-[#FF0000] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Rojo puro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#FF6666]')}
                  className="w-10 h-8 bg-[#FF6666] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Rojo claro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#CC0000]')}
                  className="w-10 h-8 bg-[#CC0000] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Rojo medio"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#800000]')}
                  className="w-10 h-8 bg-[#800000] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Rojo oscuro"
                />
              </div>
              
              {/* Columna Negro/Grises */}
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-black')}
                  className="w-10 h-10 bg-black rounded border border-gray-600 hover:border-white transition-colors"
                  title="Negro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#333333]')}
                  className="w-10 h-8 bg-[#333333] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Gris muy oscuro"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#666666]')}
                  className="w-10 h-8 bg-[#666666] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Gris medio"
                />
                <button
                  onClick={() => changeTrackColor(showColorPicker, 'bg-[#999999]')}
                  className="w-10 h-8 bg-[#999999] rounded border border-gray-600 hover:border-white transition-colors"
                  title="Gris claro"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Metronome Component - REMOVED */}

      {/* Pitch & Tempo Modal */}
      {showPitchTempoModal && (
        <PitchTempoModal
          isOpen={showPitchTempoModal}
          onClose={closePitchTempoModal}
        />
      )}

      {/* Metronome Modal */}
      {showMetronomeModal && (
        <MetronomeModal
          isOpen={showMetronomeModal}
          onClose={closeMetronomeModal}
        />
      )}

      {/* Volume EQ Modal */}
      {showVolumeEQModal && (
        <VolumeEQModal
          isOpen={showVolumeEQModal}
          onClose={closeVolumeEQModal}
        />
      )}

      {/* BPM Detector Modal */}
      {showBpmDetectorModal && (
        <BpmDetectorModal
          isOpen={showBpmDetectorModal}
          onClose={closeBpmDetectorModal}
        />
      )}

      {/* Chord Analysis Modal */}
      {showChordAnalysisModal && (
        <ChordAnalysisModal
          isOpen={showChordAnalysisModal}
          onClose={closeChordAnalysisModal}
          isPremium={isPremium}
        />
      )}

      {/* YouTube Extract Modal */}
      {showYoutubeExtractModal && (
        <YoutubeExtractModal
          isOpen={showYoutubeExtractModal}
          onClose={closeYoutubeExtractModal}
          isPremium={isPremium}
          onSeparateTrack={(file) => {
            setPreloadedAudioFile(file)
            setShowMoisesStyleModal(true)
            setShowYoutubeExtractModal(false)
          }}
        />
      )}

      {/* Modal de confirmación de eliminación */}
      {deleteConfirmModal.show && deleteConfirmModal.song && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000]">
          <div className="bg-gray-900 border-2 border-red-500 p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-center mb-4">
              <div className="bg-red-500/20 p-3">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
            </div>
            
            <h3 className="text-xl font-bold text-white text-center mb-3">
              Eliminar Canción
            </h3>
            
            <p className="text-gray-300 text-center mb-2 text-sm">
              ¿Estás seguro que quieres eliminarla?
            </p>
            
            <p className="text-lg font-semibold text-white text-center mb-5">
              "{deleteConfirmModal.song.title}"
            </p>
            
            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirmModal({ show: false, song: null })}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 transition-all duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const songId = deleteConfirmModal.song!.id!;
                  deleteSong(songId)
                    .then(() => {
                      console.log('✅ Canción eliminada exitosamente');
                      setDeleteConfirmModal({ show: false, song: null });
                    })
                    .catch(err => {
                      console.error('❌ Error eliminando:', err);
                      alert('Error al eliminar: ' + err.message);
                      setDeleteConfirmModal({ show: false, song: null });
                    });
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 transition-all duration-200"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero Popup */}
      <HeroPopup 
        isOpen={showHeroPopup}
        onClose={() => setShowHeroPopup(false)}
      />

    </div>
  )
}