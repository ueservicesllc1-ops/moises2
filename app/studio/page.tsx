'use client'

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { 
  Music, 
  Search,
  Plus,
  ChevronDown,
  ChevronUp,
  User,
  Volume2,
  LogOut,
  Cloud,
  Trash2,
  Zap,
  Target,
  Repeat,
  VolumeX,
  Download,
  Loader2,
  X,
  MoreVertical,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Menu,
  Home as HomeIcon,
  Youtube,
  Activity,
  Clock,
  Settings,
  Filter,
  ArrowUpDown,
  ArrowLeft,
  GripVertical,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Magnet,
} from 'lucide-react'
import MoisesStyleUpload from '@/components/MoisesStyleUpload'
import ConnectionStatus from '@/components/ConnectionStatus'
import PitchTempoChanger from '@/components/PitchTempoChanger'
import ChordAnalysis from '@/components/ChordAnalysis'
import BeatEditor from '@/components/BeatEditor'
import BpmDisplay from '@/components/BpmDisplay'
import PitchTempoModal from '@/components/PitchTempoModal'
import MetronomeModal from '@/components/MetronomeModal'
import VolumeEQModal from '@/components/VolumeEQModal'
import BpmDetectorModal from '@/components/BpmDetectorModal'
import ChordAnalysisModal from '@/components/ChordAnalysisModal'
import { resolvePlanIdFromUserData, type PlanId } from '@/lib/pricing'
import { stemPathFromB2PublicUrl, normalizeStemPlayUrl, resolveAudioFetchUrl, getCachedAudioBlobUrl } from '@/lib/audioProxy'
import { isClickStemKey, computeClickSyncOffsetSecFromStems } from '@/lib/clickSync'
import {
  clampClipStartSec,
  snapSecondsToGrid,
  type TimelineSnapGrid,
} from '@/lib/timelineSnap'
import {
  clampSourceInOut,
  clipFadeGainAtProjectTime,
  MIN_STEM_CLIP_SPAN_SEC,
  resolveSourceOutSec,
  slicePeaksForSourceWindow,
  stemFileTimeFromTimelineTrimmed,
  type StemClipEditPersisted,
} from '@/lib/studioNonDestructiveClip'

/** Duración de un compás (s) según BPM (negra) y armadura mostrada en la regla. */
type TimelineMeter = '4/4' | '3/4' | '2/4' | '6/8'

function measureDurationFromMeter(bpm: number, meter: TimelineMeter): number {
  const b = Math.max(40, Math.min(Number(bpm) || 120, 400))
  const beat = 60 / b
  switch (meter) {
    case '3/4':
      return beat * 3
    case '2/4':
      return beat * 2
    case '6/8':
      return beat * 3
    default:
      return beat * 4
  }
}

/** Altura de fila de pista en el mezclador (px): por defecto y límites al arrastrar el borde inferior. */
const DEFAULT_TRACK_ROW_HEIGHT_PX = 62
const MIN_TRACK_ROW_HEIGHT_PX = 28
const MAX_TRACK_ROW_HEIGHT_PX = 220

/** Duración mínima visible del clip en el timeline al trimar (s). */
const CLIP_TRIM_MIN_TIMELINE_SEC = 0.1

// import ChordAnalyzer from '@/components/ChordAnalyzer'
import { getUserSongs, subscribeToUserSongs, deleteSong, Song } from '@/lib/firestore'
// import useAudioCleanup from '@/hooks/useAudioCleanup'

function isLikelyThumbnailUrl(s: string | undefined): boolean {
  if (!s?.trim()) return false
  const t = s.trim()
  return (
    t.startsWith('http://') ||
    t.startsWith('https://') ||
    t.startsWith('/') ||
    t.startsWith('data:')
  )
}

/** crossOrigin debe ir antes de src; en blob:/data: no usar (evita errores con Web Audio / MediaElementSource). */
function createConfiguredStemAudio(trackUrl: string): HTMLAudioElement {
  const audio = new Audio()
  if (trackUrl.startsWith('blob:') || trackUrl.startsWith('data:')) {
    audio.removeAttribute('crossOrigin')
  } else {
    audio.crossOrigin = 'anonymous'
  }
  audio.src = trackUrl
  audio.preload = 'auto'
  return audio
}

function TrackWavePlaceholder() {
  const bars = [10, 18, 12, 22, 14, 20, 9, 16]
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-end justify-center gap-0.5 rounded-md bg-gradient-to-b from-[#1a1a1a] to-[#0f0f0f] px-1.5 pb-1.5 pt-2 ring-1 ring-[#2a2a2a]"
      aria-hidden
    >
      {bars.map((h, i) => (
        <span
          key={i}
          className="w-[3px] min-h-[3px] rounded-full bg-gradient-to-t from-[#404040] to-[#a8a8a8] opacity-90"
          style={{ height: h }}
        />
      ))}
    </div>
  )
}

export default function Home() {
  const { user, loading, logout, requestPasswordReset } = useAuth()
  const [currentPlanId, setCurrentPlanId] = useState<PlanId>('starter')
  const isPremium = currentPlanId !== 'starter' || user?.email === 'ueservicesllc1@gmail.com'
  const router = useRouter()
  
  // Component render
  
  // Hook para limpiar audio
  // useAudioCleanup()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('added')
  const [showMoisesStyleModal, setShowMoisesStyleModal] = useState(false)
  const [activeStudioView, setActiveStudioView] = useState<'tracks' | 'youtube' | 'chords' | 'metronome' | 'bpm' | 'tempo' | 'eq'>('tracks')
  const [showEQInMixer, setShowEQInMixer] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeBilling, setUpgradeBilling] = useState<'monthly' | 'yearly'>('yearly')
  const [songs, setSongs] = useState<Song[]>([])
  const [songsLoading, setSongsLoading] = useState(true)
  const [showSongModal, setShowSongModal] = useState(false)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [preloadedAudioFile, setPreloadedAudioFile] = useState<File | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [isExtractingYoutube, setIsExtractingYoutube] = useState(false)
  const [youtubeExtractedAudio, setYoutubeExtractedAudio] = useState<File | null>(null)
  const [youtubeVideoTitle, setYoutubeVideoTitle] = useState('')
  const [youtubeExtractError, setYoutubeExtractError] = useState('')

  const [songDelay, setSongDelay] = useState<number>(0)
  /** Segundos: reproducción del stem click en `masterTime - offset` para alinear fase. */
  const [clickSyncOffsetSec, setClickSyncOffsetSec] = useState(0)
  const [clickSyncBusy, setClickSyncBusy] = useState(false)
  /** Oculta el panel inferior (acordes, EQ, guardar) para ver las pistas a pantalla completa. */
  const [mixerToolsCollapsed, setMixerToolsCollapsed] = useState(false)
  const [timeFormat, setTimeFormat] = useState<'time' | 'beats'>('time')
  const [audioElements, setAudioElements] = useState<{ [key: string]: HTMLAudioElement }>({})
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [waveforms, setWaveforms] = useState<{ [key: string]: number[] }>({})
  const [trackOnsets, setTrackOnsets] = useState<{ [key: string]: number }>({}) // Onset en ms de cada track
  /** Inicio del clip en la línea de tiempo (s): t=0 del archivo alinea con este instante del proyecto. */
  const [trackClipOffsetSec, setTrackClipOffsetSec] = useState<Record<string, number>>({})
  const [timelineSnapGrid, setTimelineSnapGrid] = useState<TimelineSnapGrid>('1/16')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [timelineMeter, setTimelineMeter] = useState<TimelineMeter>('4/4')
  const [selectedEditTrackKey, setSelectedEditTrackKey] = useState<string | null>(null)
  /** Altura visual por pista (px); al achicar, la onda se recorta (no se borra el audio del archivo). */
  const [trackRowHeightsPx, setTrackRowHeightsPx] = useState<Record<string, number>>({})
  /** Trim no destructivo: inicio audible dentro del archivo (s). */
  const [trackClipSourceInSec, setTrackClipSourceInSec] = useState<Record<string, number>>({})
  /** Fin audible en archivo (s). Si falta clave → hasta el final del stem. */
  const [trackClipSourceOutSec, setTrackClipSourceOutSec] = useState<Record<string, number>>({})
  const [trackClipFadeInSec, setTrackClipFadeInSec] = useState<Record<string, number>>({})
  const [trackClipFadeOutSec, setTrackClipFadeOutSec] = useState<Record<string, number>>({})
  const trackRowResizeDragRef = useRef<{
    trackKey: string
    pointerDownY: number
    heightAtPointerDown: number
  } | null>(null)
  const clipTrimDragRef = useRef<{
    trackKey: string
    edge: 'left' | 'right'
    pointerDownX: number
    timelineStart0: number
    timelineEnd0: number
    sourceIn0: number
    sourceOut0: number
    stemDur: number
    laneWidthPx: number
    durForClip: number
  } | null>(null)
  const trackClipOffsetSecRef = useRef<Record<string, number>>({})
  const timelineSnapGridRef = useRef<TimelineSnapGrid>('1/16')
  const snapEnabledRef = useRef(true)
  const clipDragRef = useRef<{
    trackKey: string
    startClientX: number
    startClip: number
    width: number
    durationSec: number
    moved: boolean
  } | null>(null)

  const selectedSongRef = useRef<Song | null>(null)
  useEffect(() => {
    selectedSongRef.current = selectedSong
  }, [selectedSong])

  const stemClipPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const clickSyncOffsetSecRef = useRef(0)
  useEffect(() => {
    clickSyncOffsetSecRef.current = clickSyncOffsetSec
  }, [clickSyncOffsetSec])

  useEffect(() => {
    trackClipOffsetSecRef.current = trackClipOffsetSec
  }, [trackClipOffsetSec])

  useEffect(() => {
    timelineSnapGridRef.current = timelineSnapGrid
  }, [timelineSnapGrid])
  useEffect(() => {
    snapEnabledRef.current = snapEnabled
  }, [snapEnabled])
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
  const currentTimeRef = useRef(0)
  const isPlayingRef = useRef(false)
  const durationRef = useRef(0)
  /** Reloj del proyecto mientras play: origen + wall clock (no depende de ningún stem con clip corrido). */
  const playbackWallOriginProjectSecRef = useRef(0)
  const playbackWallOriginPerfRef = useRef(0)
  const [volume, setVolume] = useState(1)
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])
  useEffect(() => {
    isPlayingRef.current = isPlaying
  }, [isPlaying])
  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const [isMuted, setIsMuted] = useState(false)
  const [trackMutedStates, setTrackMutedStates] = useState<{ [key: string]: boolean }>({})
  const [trackVolumeStates, setTrackVolumeStates] = useState<{ [key: string]: number }>({})
  const [showMixerEQ, setShowMixerEQ] = useState(false) // Mostrar EQ en el mixer
  const [trackSoloStates, setTrackSoloStates] = useState<{ [key: string]: boolean }>({})
  const volumeRef = useRef(1)
  const trackVolumeStatesRef = useRef<{ [key: string]: number }>({})
  const trackMutedStatesRef = useRef<{ [key: string]: boolean }>({})
  const trackSoloStatesRef = useRef<{ [key: string]: boolean }>({})
  const trackClipSourceInSecRef = useRef<Record<string, number>>({})
  const trackClipSourceOutSecRef = useRef<Record<string, number>>({})
  const trackClipFadeInSecRef = useRef<Record<string, number>>({})
  const trackClipFadeOutSecRef = useRef<Record<string, number>>({})
  const [trackOrder, setTrackOrder] = useState<string[]>([])
  useEffect(() => {
    volumeRef.current = volume
  }, [volume])
  useEffect(() => {
    trackVolumeStatesRef.current = trackVolumeStates
  }, [trackVolumeStates])
  useEffect(() => {
    trackMutedStatesRef.current = trackMutedStates
  }, [trackMutedStates])
  useEffect(() => {
    trackSoloStatesRef.current = trackSoloStates
  }, [trackSoloStates])
  useEffect(() => {
    trackClipSourceInSecRef.current = trackClipSourceInSec
  }, [trackClipSourceInSec])
  useEffect(() => {
    trackClipSourceOutSecRef.current = trackClipSourceOutSec
  }, [trackClipSourceOutSec])
  useEffect(() => {
    trackClipFadeInSecRef.current = trackClipFadeInSec
  }, [trackClipFadeInSec])
  useEffect(() => {
    trackClipFadeOutSecRef.current = trackClipFadeOutSec
  }, [trackClipFadeOutSec])

  const audioElementsRef = useRef(audioElements)
  audioElementsRef.current = audioElements

  const persistStemClipEditsToFirestore = useCallback(async () => {
    const song = selectedSongRef.current
    if (!song?.id || !user?.uid || !song.stems) return

    const stemKeys = Object.keys(song.stems).filter((k) => k !== 'metronome')
    const edits: Record<string, StemClipEditPersisted> = {}

    for (const k of stemKeys) {
      const timelineStartSec = trackClipOffsetSecRef.current[k] ?? 0
      const sourceInSec = trackClipSourceInSecRef.current[k] ?? 0
      const soStored = trackClipSourceOutSecRef.current[k]
      const dur = Math.max(0.01, Number(audioElementsRef.current[k]?.duration) || 0.01)
      const resolvedOut = resolveSourceOutSec(soStored, dur)
      if (resolvedOut - sourceInSec < MIN_STEM_CLIP_SPAN_SEC) continue

      const entry: StemClipEditPersisted = {
        timelineStartSec,
        sourceInSec,
      }
      if (soStored != null && Number.isFinite(Number(soStored))) {
        entry.sourceOutSec = Number(soStored)
      }
      const fi = trackClipFadeInSecRef.current[k] ?? 0
      const fo = trackClipFadeOutSecRef.current[k] ?? 0
      if (fi > 0) entry.fadeInSec = fi
      if (fo > 0) entry.fadeOutSec = fo
      edits[k] = entry
    }

    if (Object.keys(edits).length === 0) return

    try {
      const { doc, updateDoc } = await import('firebase/firestore')
      const { db } = await import('@/lib/firebase')
      await updateDoc(doc(db, 'songs', song.id), { stemClipEdits: edits })
    } catch (err) {
      console.error('[studio] Error guardando stemClipEdits:', err)
    }
  }, [user?.uid])

  const schedulePersistStemClipEdits = useCallback(() => {
    if (!selectedSongRef.current?.id || !user?.uid) return
    if (stemClipPersistTimerRef.current) clearTimeout(stemClipPersistTimerRef.current)
    stemClipPersistTimerRef.current = setTimeout(() => {
      stemClipPersistTimerRef.current = null
      void persistStemClipEditsToFirestore()
    }, 900)
  }, [user?.uid, persistStemClipEditsToFirestore])

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const draggedIndexRef = useRef<number | null>(null)

  const [waveformStyle, setWaveformStyle] = useState<'bars' | 'smooth' | 'dots'>('bars')
  const [horizontalZoom, setHorizontalZoom] = useState(1);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  /** Regla TIME/COMPÁS: rueda = zoom (listener no pasivo). */
  const rulerBarRef = useRef<HTMLDivElement>(null);
  const horizontalZoomRef = useRef(1);
  horizontalZoomRef.current = horizontalZoom;

  /** Orden estable: preferir trackOrder y añadir stems que falten. */
  const mergeTrackKeysWithStems = useCallback((prevOrder: string[]): string[] => {
    const stemsKeys = Object.keys(selectedSong?.stems || {}).filter((k) => k !== 'metronome')
    if (stemsKeys.length === 0) return []
    const base = prevOrder.length > 0 ? prevOrder.filter((k) => stemsKeys.includes(k)) : []
    return [...base, ...stemsKeys.filter((k) => !base.includes(k))]
  }, [selectedSong?.stems])

  const displayedTrackKeys = useMemo(
    () => mergeTrackKeysWithStems(trackOrder),
    [trackOrder, mergeTrackKeysWithStems],
  )

  const handleTrackDragStart = (index: number) => {
    draggedIndexRef.current = index
    setDraggedIndex(index)
  }

  const handleTrackDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const from = draggedIndexRef.current
    if (from === null || from === index) return
    setTrackOrder((prev) => {
      const keys = mergeTrackKeysWithStems(prev)
      if (from < 0 || from >= keys.length || index < 0 || index >= keys.length) return prev
      const next = [...keys]
      const [item] = next.splice(from, 1)
      next.splice(index, 0, item)
      return next
    })
    draggedIndexRef.current = index
    setDraggedIndex(index)
  }

  const handleTrackDragEnd = () => {
    draggedIndexRef.current = null
    setDraggedIndex(null)
  }

  const bindTrackRowResizePointer = useCallback(
    (
      el: HTMLDivElement,
      trackKey: string,
      pointerId: number,
      clientY: number,
      heightAtPointerDown: number,
    ) => {
      trackRowResizeDragRef.current = {
        trackKey,
        pointerDownY: clientY,
        heightAtPointerDown,
      }
      const onMove = (ev: PointerEvent) => {
        const d = trackRowResizeDragRef.current
        if (!d || d.trackKey !== trackKey) return
        const dy = ev.clientY - d.pointerDownY
        const h = Math.min(
          MAX_TRACK_ROW_HEIGHT_PX,
          Math.max(MIN_TRACK_ROW_HEIGHT_PX, Math.round(d.heightAtPointerDown + dy)),
        )
        setTrackRowHeightsPx((prev) => ({ ...prev, [trackKey]: h }))
      }
      const onEnd = (ev: PointerEvent) => {
        trackRowResizeDragRef.current = null
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onEnd)
        el.removeEventListener('pointercancel', onEnd)
      }
      try {
        el.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onEnd)
      el.addEventListener('pointercancel', onEnd)
    },
    [],
  )

  const bindClipTrimPointer = useCallback(
    (
      el: HTMLDivElement,
      trackKey: string,
      edge: 'left' | 'right',
      pointerId: number,
      clientX: number,
      clipBodyEl: HTMLDivElement,
    ) => {
      const stemDur = Math.max(
        CLIP_TRIM_MIN_TIMELINE_SEC * 2,
        Number(audioElementsRef.current[trackKey]?.duration) || 1,
      )
      const durForClip = Math.max(
        0.01,
        Number(durationRef.current) || 0,
        Number(selectedSong?.durationSeconds) || 0,
        Number(audioElementsRef.current[trackKey]?.duration) || 0,
      )

      const rowEl = clipBodyEl.closest('[data-timeline-track-row]') as HTMLElement | null
      const laneWidthPx = Math.max(
        1,
        rowEl?.getBoundingClientRect().width ??
          clipBodyEl.parentElement?.getBoundingClientRect().width ??
          1,
      )

      const t00 = trackClipOffsetSecRef.current[trackKey] ?? 0
      const sIn0 = trackClipSourceInSecRef.current[trackKey] ?? 0
      const sOut0 = resolveSourceOutSec(trackClipSourceOutSecRef.current[trackKey], stemDur)
      const spanFile0 = Math.max(MIN_STEM_CLIP_SPAN_SEC, sOut0 - sIn0)
      const spanTimeline0 = Math.min(spanFile0, Math.max(0, durForClip - t00))
      const tEnd0 = t00 + spanTimeline0

      clipTrimDragRef.current = {
        trackKey,
        edge,
        pointerDownX: clientX,
        timelineStart0: t00,
        timelineEnd0: tEnd0,
        sourceIn0: sIn0,
        sourceOut0: sOut0,
        stemDur,
        laneWidthPx,
        durForClip,
      }

      let lastLogLine: string | null = null

      const onMove = (ev: PointerEvent) => {
        const d = clipTrimDragRef.current
        if (!d || d.trackKey !== trackKey) return

        const dx = ev.clientX - d.pointerDownX
        const dt = (dx / d.laneWidthPx) * d.durForClip

        if (d.edge === 'left') {
          // Borde derecho en timeline fijo (tEnd0); solo mueve inicio + sourceIn acoplados.
          let newT0 = d.timelineStart0 + dt
          const maxT0 = d.timelineEnd0 - CLIP_TRIM_MIN_TIMELINE_SEC
          const minT0FromSource = d.timelineStart0 - d.sourceIn0
          newT0 = Math.max(0, minT0FromSource, Math.min(newT0, maxT0))
          const newSIn = d.sourceIn0 + (newT0 - d.timelineStart0)

          const nextOff = { ...trackClipOffsetSecRef.current, [trackKey]: newT0 }
          trackClipOffsetSecRef.current = nextOff
          setTrackClipOffsetSec(nextOff)

          const nextIn = { ...trackClipSourceInSecRef.current, [trackKey]: newSIn }
          trackClipSourceInSecRef.current = nextIn
          setTrackClipSourceInSec(nextIn)

          lastLogLine = `[TRIM LEFT] oldStart=${d.timelineStart0.toFixed(3)}, newStart=${newT0.toFixed(3)}, fixedEnd=${d.timelineEnd0.toFixed(3)}`
        } else {
          // Borde izquierdo en timeline fijo (t00); solo acorta sourceOut / fin en timeline.
          let newSOut = d.sourceOut0 + dt
          const minSOut = d.sourceIn0 + CLIP_TRIM_MIN_TIMELINE_SEC
          const maxSOutFromTimeline = d.sourceIn0 + (d.durForClip - d.timelineStart0)
          const maxSOut = Math.min(d.stemDur, maxSOutFromTimeline)
          newSOut = Math.max(minSOut, Math.min(newSOut, maxSOut))
          const c = clampSourceInOut(d.sourceIn0, newSOut, d.stemDur)

          const nextOut = { ...trackClipSourceOutSecRef.current, [trackKey]: c.sourceOut }
          trackClipSourceOutSecRef.current = nextOut
          setTrackClipSourceOutSec(nextOut)

          if (c.sourceIn !== d.sourceIn0) {
            const nextIn = { ...trackClipSourceInSecRef.current, [trackKey]: c.sourceIn }
            trackClipSourceInSecRef.current = nextIn
            setTrackClipSourceInSec(nextIn)
          }

          const newTEnd = d.timelineStart0 + Math.min(c.sourceOut - c.sourceIn, d.durForClip - d.timelineStart0)
          lastLogLine = `[TRIM RIGHT] fixedStart=${d.timelineStart0.toFixed(3)}, oldEnd=${d.timelineEnd0.toFixed(3)}, newEnd=${newTEnd.toFixed(3)}`
        }
      }

      const onEnd = (ev: PointerEvent) => {
        if (lastLogLine) console.log(lastLogLine)
        clipTrimDragRef.current = null
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onEnd)
        el.removeEventListener('pointercancel', onEnd)
        schedulePersistStemClipEdits()
      }
      try {
        el.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onEnd)
      el.addEventListener('pointercancel', onEnd)
    },
    [selectedSong, schedulePersistStemClipEdits],
  )

  const bindClipFadePointer = useCallback(
    (
      el: HTMLDivElement,
      trackKey: string,
      edge: 'in' | 'out',
      pointerId: number,
      clientY: number,
      spanSec: number,
      fadeStart: number,
    ) => {
      const startY = clientY
      const maxF = Math.max(0, spanSec / 2 - 0.02)
      const onMove = (ev: PointerEvent) => {
        const dy = startY - ev.clientY
        const delta = dy * (spanSec / 120)
        const next = Math.max(0, Math.min(maxF, fadeStart + delta))
        if (edge === 'in') {
          const m = { ...trackClipFadeInSecRef.current, [trackKey]: next }
          trackClipFadeInSecRef.current = m
          setTrackClipFadeInSec(m)
        } else {
          const m = { ...trackClipFadeOutSecRef.current, [trackKey]: next }
          trackClipFadeOutSecRef.current = m
          setTrackClipFadeOutSec(m)
        }
      }
      const onEnd = (ev: PointerEvent) => {
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* ignore */
        }
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', onEnd)
        el.removeEventListener('pointercancel', onEnd)
        schedulePersistStemClipEdits()
      }
      try {
        el.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', onEnd)
      el.addEventListener('pointercancel', onEnd)
    },
    [schedulePersistStemClipEdits],
  )

  const moveTrack = useCallback(
    (trackKey: string, delta: number) => {
      setTrackOrder((prev) => {
        const keys = mergeTrackKeysWithStems(prev)
        const i = keys.indexOf(trackKey)
        if (i < 0) return keys
        const j = i + delta
        if (j < 0 || j >= keys.length) return keys
        const next = [...keys]
        const [item] = next.splice(i, 1)
        next.splice(j, 0, item)
        return next
      })
    },
    [mergeTrackKeysWithStems],
  )

  /** Tiempo dentro del archivo de audio (s) para un instante del proyecto (línea de tiempo). */
  function stemFileTimeFromTimeline(timelineSec: number, trackKey: string): number {
    const clip = trackClipOffsetSecRef.current[trackKey] ?? 0
    const sourceIn = trackClipSourceInSecRef.current[trackKey] ?? 0
    const off = isClickStemKey(trackKey) ? clickSyncOffsetSecRef.current : 0
    return stemFileTimeFromTimelineTrimmed(timelineSec, clip, sourceIn, off)
  }

  // Sincronizar trackOrder si cambian los stems de la canción (ej. nueva separación)
  useEffect(() => {
    if (selectedSong?.stems) {
      const stemsKeys = Object.keys(selectedSong.stems).filter(k => k !== 'metronome');
      setTrackOrder(prev => {
        // Solo actualizar si las llaves han cambiado (nuevos tracks)
        const hasNewTracks = stemsKeys.some(k => !prev.includes(k));
        const hasRemovedTracks = prev.some(k => !stemsKeys.includes(k));
        
        if (hasNewTracks || hasRemovedTracks || prev.length === 0) {
          // Mantener el orden previo para los que ya estaban, añadir los nuevos al final
          const existingInNew = prev.filter(k => stemsKeys.includes(k));
          const onlyNew = stemsKeys.filter(k => !prev.includes(k));
          return [...existingInNew, ...onlyNew];
        }
        return prev;
      });
      const edits = selectedSong?.stemClipEdits
      setTrackClipOffsetSec((prev) => {
        const next: Record<string, number> = {}
        for (const k of stemsKeys) {
          if (typeof prev[k] === 'number') next[k] = prev[k]
          else if (edits?.[k] && typeof edits[k].timelineStartSec === 'number')
            next[k] = edits[k].timelineStartSec
        }
        return next
      })
      setTrackClipSourceInSec((prev) => {
        const next: Record<string, number> = {}
        for (const k of stemsKeys) {
          if (typeof prev[k] === 'number') next[k] = prev[k]
          else if (edits?.[k] && typeof edits[k].sourceInSec === 'number') next[k] = edits[k].sourceInSec
        }
        return next
      })
      setTrackClipSourceOutSec((prev) => {
        const next: Record<string, number> = {}
        for (const k of stemsKeys) {
          if (typeof prev[k] === 'number') next[k] = prev[k]
          else if (
            edits?.[k]?.sourceOutSec != null &&
            Number.isFinite(Number(edits[k].sourceOutSec))
          ) {
            next[k] = Number(edits[k].sourceOutSec)
          }
        }
        return next
      })
      setTrackClipFadeInSec((prev) => {
        const next: Record<string, number> = {}
        for (const k of stemsKeys) {
          if (typeof prev[k] === 'number') next[k] = prev[k]
          else if (edits?.[k]?.fadeInSec != null && Number(edits[k].fadeInSec) > 0)
            next[k] = Number(edits[k].fadeInSec)
        }
        return next
      })
      setTrackClipFadeOutSec((prev) => {
        const next: Record<string, number> = {}
        for (const k of stemsKeys) {
          if (typeof prev[k] === 'number') next[k] = prev[k]
          else if (edits?.[k]?.fadeOutSec != null && Number(edits[k].fadeOutSec) > 0)
            next[k] = Number(edits[k].fadeOutSec)
        }
        return next
      })
    } else {
      setTrackOrder([])
      setTrackClipOffsetSec({})
      setTrackClipSourceInSec({})
      setTrackClipSourceOutSec({})
      setTrackClipFadeInSec({})
      setTrackClipFadeOutSec({})
    }
  }, [selectedSong?.stems, selectedSong?.stemClipEdits])

  useEffect(() => {
    const loadUserPlan = async () => {
      if (!user?.uid) {
        setCurrentPlanId('starter')
        return
      }
      try {
        const { doc, getDoc } = await import('firebase/firestore')
        const { db } = await import('@/lib/firebase')
        const userRef = doc(db, 'users', user.uid)
        const userSnap = await getDoc(userRef)
        const userData = userSnap.exists() ? userSnap.data() : null
        setCurrentPlanId(resolvePlanIdFromUserData(userData))
      } catch (error) {
        console.error('Error loading user plan in studio:', error)
        setCurrentPlanId('starter')
      }
    }

    loadUserPlan()
  }, [user?.uid])

  // Zoom/scroll horizontal: listeners `wheel` con { passive: false } (React onWheel no puede hacer preventDefault).
  useLayoutEffect(() => {
    if (!showSongModal) return

    const opts: AddEventListenerOptions = { passive: false }

    const clampZoom = (z: number) => Math.max(1, Math.min(10, z))

    const onRulerWheel = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const mag = Math.min(2, (Math.abs(e.deltaY) || 1) / 100)
      const step = 0.1 + 0.12 * mag
      const d = e.deltaY > 0 ? -step : step
      setHorizontalZoom((z) => clampZoom(z + d))
    }

    /** Solo la regla TIME/COMPÁS hace zoom con la rueda (listener en rulerBarRef). */
    const onScrollWheel = (e: WheelEvent) => {
      const el = scrollContainerRef.current
      if (!el) return

      const overflowX = el.scrollWidth - el.clientWidth
      if (overflowX <= 1) return

      if (e.shiftKey) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
        return
      }

      if (horizontalZoomRef.current > 1.001) {
        e.preventDefault()
        const dx = e.deltaX
        const dy = e.deltaY
        if (Math.abs(dx) > Math.abs(dy)) {
          el.scrollLeft += dx
        } else {
          el.scrollLeft += dy
        }
      }
    }

    const detach = () => {
      scrollContainerRef.current?.removeEventListener('wheel', onScrollWheel, opts)
      rulerBarRef.current?.removeEventListener('wheel', onRulerWheel, opts)
    }

    const attach = () => {
      detach()
      scrollContainerRef.current?.addEventListener('wheel', onScrollWheel, opts)
      rulerBarRef.current?.addEventListener('wheel', onRulerWheel, opts)
    }

    attach()
    const raf = requestAnimationFrame(() => attach())
    window.addEventListener('resize', attach)
    window.addEventListener('orientationchange', attach)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', attach)
      window.removeEventListener('orientationchange', attach)
      detach()
    }
  }, [showSongModal, selectedSong?.id])

  // Evitar scroll en el body cuando el modal del mixer está abierto
  useEffect(() => {
    if (showSongModal) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [showSongModal])

  const displayedSongs = useMemo(() => {
    let list = [...songs]
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (s) =>
          (s.title || '').toLowerCase().includes(q) ||
          (s.artist || '').toLowerCase().includes(q) ||
          (s.genre || '').toLowerCase().includes(q)
      )
    }
    switch (sortBy) {
      case 'name':
        list.sort((a, b) =>
          (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        )
        break
      case 'added':
      default:
        list.sort((a, b) => {
          const ta = new Date(a.uploadedAt || 0).getTime()
          const tb = new Date(b.uploadedAt || 0).getTime()
          return tb - ta
        })
    }
    return list
  }, [songs, searchQuery, sortBy])

  const goToTracksSection = () => {
    setActiveStudioView('tracks')
    document.getElementById('lista-canciones')?.scrollIntoView({ behavior: 'smooth' })
    setSidebarOpen(false)
  }
  
  const handleChordAnalysis = () => {
    setActiveStudioView('chords')
    setSidebarOpen(false)
  }
  
  const handleMetronome = () => {
    setActiveStudioView('metronome')
    setSidebarOpen(false)
  }
  
  const handleAudioSeparation = () => {
    setShowMoisesStyleModal(true)
  }
  
  const handleTempoChange = () => {
    setActiveStudioView('tempo')
    setSidebarOpen(false)
  }
  
  const handleVolumeControl = () => {
    setActiveStudioView('eq')
    setSidebarOpen(false)
  }
  
  const handleBpmDisplay = () => {
    setActiveStudioView('bpm')
    setSidebarOpen(false)
  }

  const isValidYoutubeUrl = (url: string) => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url)

  const handleExtractYoutubeAudio = async () => {
    if (!youtubeUrl.trim()) {
      setYoutubeExtractError('Por favor ingresa una URL de YouTube')
      return
    }

    if (!isValidYoutubeUrl(youtubeUrl)) {
      setYoutubeExtractError('URL de YouTube inválida')
      return
    }

    if (!isPremium) {
      setYoutubeExtractError('La extracción de audio de YouTube requiere plan de pago.')
      return
    }

    setIsExtractingYoutube(true)
    setYoutubeExtractError('')

    try {
      const response = await fetch('/api/youtube-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }))
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.success || !data.audioData) {
        throw new Error(data.error || 'Error al extraer audio')
      }

      const binaryString = atob(data.audioData)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' })

      const fileName = `${data.title}.mp3`.replace(/[<>:"/\\|?*]/g, '_')
      const audioFile = new File([audioBlob], fileName, { type: 'audio/mpeg' })

      setYoutubeExtractedAudio(audioFile)
      setYoutubeVideoTitle(data.title)
    } catch (err: any) {
      console.error('Error extrayendo YouTube:', err)
      setYoutubeExtractError(err.message || 'Error al extraer audio')
    } finally {
      setIsExtractingYoutube(false)
    }
  }

  const handleDownloadYoutubeAudio = () => {
    if (!youtubeExtractedAudio) return
    const url = URL.createObjectURL(youtubeExtractedAudio)
    const a = document.createElement('a')
    a.href = url
    a.download = youtubeExtractedAudio.name
    a.click()
    URL.revokeObjectURL(url)
  }

  const closeMoisesModal = () => {
    setShowMoisesStyleModal(false)
    setPreloadedAudioFile(null)
  }
  
  const handleYoutubeExtract = () => {
    setActiveStudioView('youtube')
    setSidebarOpen(false)
  }

  // Handler removed - audio separation feature no longer available
  
  const closeSongModal = () => {
    setShowSongModal(false)
    setSelectedSong(null)
    setPreloadedAudioFile(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setMixerToolsCollapsed(false)
    setSelectedEditTrackKey(null)
    setTrackRowHeightsPx({})
    setTrackClipSourceInSec({})
    setTrackClipSourceOutSec({})
    setTrackClipFadeInSec({})
    setTrackClipFadeOutSec({})
    if (stemClipPersistTimerRef.current) {
      clearTimeout(stemClipPersistTimerRef.current)
      stemClipPersistTimerRef.current = null
    }
    // El modal de canción no viene del menú lateral
  }
  
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

  // Inicializar Web Audio API con filtros EQ; reconectar stems al cambiar de canción
  useEffect(() => {
    const list = Object.values(audioElements)
    if (list.length === 0) return

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()

      bassFilterRef.current = audioContextRef.current.createBiquadFilter()
      bassFilterRef.current.type = 'lowshelf'
      bassFilterRef.current.frequency.value = 200

      midFilterRef.current = audioContextRef.current.createBiquadFilter()
      midFilterRef.current.type = 'peaking'
      midFilterRef.current.frequency.value = 1000
      midFilterRef.current.Q.value = 1

      trebleFilterRef.current = audioContextRef.current.createBiquadFilter()
      trebleFilterRef.current.type = 'highshelf'
      trebleFilterRef.current.frequency.value = 3000

      eqGainNodeRef.current = audioContextRef.current.createGain()

      bassFilterRef.current.connect(midFilterRef.current)
      midFilterRef.current.connect(trebleFilterRef.current)
      trebleFilterRef.current.connect(eqGainNodeRef.current)
      eqGainNodeRef.current.connect(audioContextRef.current.destination)

      console.log('Web Audio API inicializado con filtros EQ')
    }

    const ctx = audioContextRef.current
    const bass = bassFilterRef.current!

    audioSourcesRef.current.forEach((node, el) => {
      if (!list.includes(el)) {
        try {
          node.disconnect()
        } catch {
          /* ignore */
        }
        audioSourcesRef.current.delete(el)
      }
    })

    for (const audio of list) {
      if (audioSourcesRef.current.has(audio)) continue

      const connect = () => {
        if (audioSourcesRef.current.has(audio)) return
        try {
          const source = ctx.createMediaElementSource(audio)
          audioSourcesRef.current.set(audio, source)
          source.connect(bass)
        } catch (e) {
          console.warn('[WebAudio] createMediaElementSource:', e)
        }
      }

      // Un elemento solo puede tener un MediaElementSource; hay que crearlo cuando ya hay datos.
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        connect()
      } else {
        audio.addEventListener('loadeddata', connect, { once: true })
      }
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

  const canChangePassword = useMemo(() => {
    if (!user?.providerData?.length) return false
    return user.providerData.some((p) => p?.providerId === 'password')
  }, [user])

  const handlePasswordReset = async () => {
    if (!user?.email) {
      alert('No se encontró email para esta cuenta.')
      return
    }
    try {
      await requestPasswordReset(user.email)
      alert('Te enviamos un correo para cambiar tu contraseña.')
    } catch (error: any) {
      const code = error?.code || ''
      if (code === 'auth/too-many-requests') {
        alert('Demasiados intentos. Espera unos minutos e inténtalo otra vez.')
        return
      }
      console.error('Error enviando reset de contraseña:', error)
      alert('No se pudo enviar el correo de cambio de contraseña.')
    }
  }

  const startUpgradeCheckout = async (plan: 'lite' | 'pro', billing: 'monthly' | 'yearly') => {
    if (!user?.uid) {
      router.push(`/login?plan=${plan}&billing=${billing}`)
      return
    }
    if (plan === currentPlanId) {
      return
    }
    try {
      const res = await fetch('/api/stripe/create-embedded-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          billing,
          uid: user.uid,
          email: user.email,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.clientSecret) {
        throw new Error(data?.error || 'No se pudo iniciar checkout')
      }

      sessionStorage.setItem(
        'judith_embedded_checkout_prefetch',
        JSON.stringify({
          clientSecret: data.clientSecret,
          plan,
          billing,
          uid: user.uid,
          at: Date.now(),
        })
      )
    } catch (error) {
      console.warn('No se pudo precargar checkout, continuando flujo normal:', error)
    }

    router.push(`/checkout?plan=${plan}&billing=${billing}`)
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
        audio = createConfiguredStemAudio(audioUrl);
        
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
    if (!waveformData || waveformData.length === 0) return ''
    const denom = Math.max(1, waveformData.length - 1)

    const points = waveformData.map((value, index) => {
      const x = 2 + (index / denom) * 798
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
  function getTransportProjectTimeFromWallClock(): number {
    return (
      playbackWallOriginProjectSecRef.current +
      (performance.now() - playbackWallOriginPerfRef.current) / 1000
    )
  }

  function getProjectTimelineFromRefs(): number {
    const els = audioElementsRef.current
    if (Object.keys(els).length === 0) return currentTimeRef.current
    if (!isPlayingRef.current) return currentTimeRef.current
    const cap = Math.max(0.01, durationRef.current || 3600)
    const raw = getTransportProjectTimeFromWallClock()
    return Math.max(0, Math.min(raw, cap))
  }

  /**
   * Alinea cada stem al tiempo del proyecto.
   * Si el clip empieza después del instante actual (tiempo en archivo negativo),
   * HTMLAudio no admite currentTime negativo: se pausa el stem en 0 hasta que el timeline avance.
   * Aplica a todos los stems (no solo el click).
   */
  function resyncStemAudioFilePositions(
    projectTimelineSec: number,
    transportPlayingOverride?: boolean,
  ) {
    const els = audioElementsRef.current
    const transportPlaying =
      transportPlayingOverride !== undefined ? transportPlayingOverride : isPlayingRef.current

    for (const [k, audio] of Object.entries(els)) {
      if (!audio) continue
      const d = audio.duration || 0
      const safe = Math.max(0, d - 0.02)
      const sourceIn = trackClipSourceInSecRef.current[k] ?? 0
      const sourceOut = resolveSourceOutSec(trackClipSourceOutSecRef.current[k], Math.max(0.01, d))
      const clipOff = trackClipOffsetSecRef.current[k] ?? 0
      const span = Math.max(MIN_STEM_CLIP_SPAN_SEC, sourceOut - sourceIn)
      const fi = trackClipFadeInSecRef.current[k] ?? 0
      const fo = trackClipFadeOutSecRef.current[k] ?? 0
      const fadeEnv = clipFadeGainAtProjectTime(projectTimelineSec, clipOff, span, fi, fo)

      const applyStemVolume = () => {
        const hasSolo = Object.values(trackSoloStatesRef.current).some(Boolean)
        if (hasSolo) {
          if (trackSoloStatesRef.current[k]) {
            audio.muted = false
            audio.volume = Math.max(0, Math.min(1, volumeRef.current * fadeEnv))
          } else {
            audio.muted = true
            audio.volume = 0
          }
        } else {
          audio.muted = !!trackMutedStatesRef.current[k]
          const base = trackVolumeStatesRef.current[k] ?? 1
          audio.volume = audio.muted ? 0 : Math.max(0, Math.min(1, base * fadeEnv))
        }
      }

      const ft = stemFileTimeFromTimeline(projectTimelineSec, k)

      if (ft < sourceIn) {
        audio.currentTime = sourceIn
        applyStemVolume()
        if (transportPlaying) audio.pause()
        continue
      }

      if (ft >= sourceOut) {
        audio.currentTime = Math.min(sourceOut, safe)
        applyStemVolume()
        if (transportPlaying) audio.pause()
        continue
      }

      const clamped = Math.max(sourceIn, Math.min(ft, sourceOut, safe))
      audio.currentTime = clamped
      applyStemVolume()
      if (transportPlaying && audio.paused) {
        void audio.play().catch(() => {})
      }
    }
  }

  useEffect(() => {
    resyncStemAudioFilePositions(getProjectTimelineFromRefs(), isPlayingRef.current)
  }, [
    trackClipOffsetSec,
    trackClipSourceInSec,
    trackClipSourceOutSec,
    trackClipFadeInSec,
    trackClipFadeOutSec,
  ])

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

      const tLine = currentTimeRef.current
      playbackWallOriginProjectSecRef.current = tLine
      playbackWallOriginPerfRef.current = performance.now()
      resyncStemAudioFilePositions(tLine, true)
      Object.entries(audioElements).forEach(([trackKey, audio]) => {
        console.log(`PLAY ${trackKey}: empezando en ${audio.currentTime.toFixed(3)}s`)
      })

      setIsPlaying(true);
      
      // Metrónomo deshabilitado temporalmente
      // startMetronome();
    }
  };

  useEffect(() => {
    if (!showSongModal || !selectedSong) return
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest('input, textarea, select, [contenteditable="true"]')) return
      const k = e.key.toLowerCase()
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
        return
      }
      if (k === 'escape') {
        setSelectedEditTrackKey(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    showSongModal,
    selectedSong,
    togglePlayPause,
  ])

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

  /** Ir a un instante del timeline del proyecto (transporte, regla TIME/COMPÁS, etc.) */
  const seekMixerToProjectSec = (rawSec: number) => {
    const dur = Math.max(0.01, Number(duration || selectedSong?.duration || 1))
    const seekTime = Math.max(0, Math.min(dur, rawSec))
    lastSeekTimeRef.current = Date.now()
    resyncStemAudioFilePositions(seekTime, isPlayingRef.current)
    if (isPlayingRef.current) {
      playbackWallOriginProjectSecRef.current = seekTime
      playbackWallOriginPerfRef.current = performance.now()
    }
    Object.values(originalAudioElements).forEach((audio) => {
      const d = audio.duration || 0
      const safe = Math.max(0, d - 0.02)
      audio.currentTime = Math.max(0, Math.min(seekTime, safe))
    })
    setCurrentTime(seekTime)
  }

  // Cambiar posición de la barra
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seekMixerToProjectSec(Number(e.target.value))
  }

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

  const handleSyncClick = async () => {
    const stems = selectedSong?.stems as Record<string, string> | undefined;
    if (!stems) {
      alert('No hay stems cargados.');
      return;
    }
    const clickKey = Object.keys(stems).find(isClickStemKey);
    if (!clickKey || !stems[clickKey]) {
      alert(
        'Esta canción no tiene stem de click (click_…). Separa de nuevo el tema con la versión actual del servidor, o abre una pista que sí incluya click.'
      );
      return;
    }
    const bpm = Number(selectedSong?.bpm);
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) {
      alert('Necesitamos un BPM válido de la canción. Usa el detector de BPM o reimporta el tema.');
      return;
    }
    const refOrder = ['drums', 'instrumental', 'other', 'bass', 'vocals'] as const;
    const refUrls: string[] = [];
    for (const k of refOrder) {
      const raw = stems[k];
      if (raw && !isClickStemKey(k)) {
        const u = resolveAudioFetchUrl(raw);
        if (u) refUrls.push(u);
      }
    }
    if (refUrls.length === 0) {
      alert('No hay stems suficientes como referencia rítmica.');
      return;
    }
    setClickSyncBusy(true);
    try {
      const off = await computeClickSyncOffsetSecFromStems({
        refUrls,
        clickUrl: resolveAudioFetchUrl(stems[clickKey])!,
        bpm,
        anchorSec: currentTime,
      });
      setClickSyncOffsetSec(off);
      clickSyncOffsetSecRef.current = off;
      resyncStemAudioFilePositions(getProjectTimelineFromRefs(), isPlayingRef.current);
    } catch (err) {
      console.error('[SYNC CLICK]', err);
      alert(`No se pudo sincronizar el click: ${err instanceof Error ? err.message : 'error'}`);
    } finally {
      setClickSyncBusy(false);
    }
  };

  // ==========================================
  // SUPER CACHE: ver lib/audioProxy.ts (B2 vía proxy; opción NEXT_PUBLIC_REMOTE_AUDIO_PROXY en local)
  // ==========================================

  const loadAudioFiles = async (song: Song) => {
    if (!song.stems) return
    
    console.log(' Iniciando carga de audio...')
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
      playbackWallOriginProjectSecRef.current = 0
      playbackWallOriginPerfRef.current = performance.now()
      console.log(' Primera carga de canción - reseteando estado')
    }
    setTrackOnsets({})
    setClickSyncOffsetSec(0)

    const edits = song.stemClipEdits
    const stemKeys = Object.keys(song.stems).filter((k) => k !== 'metronome')
    const nextClip: Record<string, number> = {}
    const nextIn: Record<string, number> = {}
    const nextOut: Record<string, number> = {}
    const nextFi: Record<string, number> = {}
    const nextFo: Record<string, number> = {}
    if (edits) {
      for (const k of stemKeys) {
        const e = edits[k]
        if (!e) continue
        if (typeof e.timelineStartSec === 'number') nextClip[k] = e.timelineStartSec
        if (typeof e.sourceInSec === 'number') nextIn[k] = e.sourceInSec
        if (e.sourceOutSec != null && Number.isFinite(Number(e.sourceOutSec))) nextOut[k] = Number(e.sourceOutSec)
        if (typeof e.fadeInSec === 'number' && e.fadeInSec > 0) nextFi[k] = e.fadeInSec
        if (typeof e.fadeOutSec === 'number' && e.fadeOutSec > 0) nextFo[k] = e.fadeOutSec
      }
    }
    setTrackClipOffsetSec(nextClip)
    setTrackClipSourceInSec(nextIn)
    setTrackClipSourceOutSec(nextOut)
    setTrackClipFadeInSec(nextFi)
    setTrackClipFadeOutSec(nextFo)

    // Limpiar audio anterior
    Object.values(audioElements).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    });
    
    console.log('Estado de reproduccion reseteado para nueva cancion');

    // Inicializar el orden de las pistas
    const initialOrder = Object.keys(song.stems).filter(k => k !== 'metronome');
    setTrackOrder(initialOrder);

    setIsLoadingAudio(true)
    const newAudioElements: { [key: string]: HTMLAudioElement } = {}
    const newWaveforms: { [key: string]: number[] } = {}
    const newLoadingStates: { [key: string]: 'idle' | 'loading' | 'cached' | 'ready' } = {}

    try {
    console.log(' Loading song tracks:', song.stems)
    for (const [trackKey, originalTrackUrl] of Object.entries(song.stems)) {
      const stemSrc = typeof originalTrackUrl === 'string' ? originalTrackUrl : ''
      const cacheKeyStable = normalizeStemPlayUrl(stemSrc) || stemSrc
      const b2Fallback = stemSrc && stemPathFromB2PublicUrl(stemSrc) ? stemSrc : undefined
      if (!cacheKeyStable) continue

      console.log(` Loading audio for ${trackKey}:`, stemSrc)

      // Cada stem se carga de forma independiente: un fallo no detiene los demás
      try {
        // Descargar o recuperar del caché de la Cache API y convertir en Blob URL
        const trackUrl = await getCachedAudioBlobUrl(stemSrc, b2Fallback)

        // 1. PRIMERO: Buscar waveform en cache localStorage
        if (waveformCache[cacheKeyStable]) {
          console.log(` CACHE HIT para ${trackKey}`)
          newLoadingStates[trackKey] = 'cached'
          newWaveforms[trackKey] = waveformCache[cacheKeyStable]

          const audio = createConfiguredStemAudio(trackUrl)
          audio.addEventListener('ended', () => {
            Object.values(newAudioElements).forEach(a => { a.pause(); a.currentTime = 0 })
            setIsPlaying(false)
            setCurrentTime(0)
            playbackWallOriginProjectSecRef.current = 0
            playbackWallOriginPerfRef.current = performance.now()
          })
          newAudioElements[trackKey] = audio

          // Detectar onset (no bloquea si falla)
          try {
            const res = await fetch(trackUrl)
            const ab = await res.arrayBuffer()
            const ctx = new AudioContext()
            const buf = await ctx.decodeAudioData(ab)
            ctx.close()
            const onsetTimeMs = detectOnset(buf)
            console.log(`[ONSET] ${trackKey}: ${onsetTimeMs}ms`)
            setTrackOnsets(prev => ({ ...prev, [trackKey]: onsetTimeMs }))
          } catch (onsetErr) {
            console.warn(`[ONSET] No se pudo detectar onset para ${trackKey}:`, onsetErr)
          }
          continue
        }

        // 2. SEGUNDO: Si no está en cache, cargar desde la URL (blob de B2)
        console.log(` CACHE MISS para ${trackKey} - cargando audio`)
        newLoadingStates[trackKey] = 'loading'
        setTrackLoadingStates(prev => ({ ...prev, [trackKey]: 'loading' }))

        const audio = createConfiguredStemAudio(trackUrl)

        audio.addEventListener('loadedmetadata', () => {
          console.log(` ${trackKey} metadata loaded: dur=${audio.duration?.toFixed(2)}s`)
        })

        audio.addEventListener('ended', () => {
          Object.values(newAudioElements).forEach(a => { a.pause(); a.currentTime = 0 })
          setIsPlaying(false)
          setCurrentTime(0)
          playbackWallOriginProjectSecRef.current = 0
          playbackWallOriginPerfRef.current = performance.now()
        })

        // Esperar canplaythrough (sin llamar load() extra — asignar src ya lo dispara)
        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            audio.removeEventListener('canplaythrough', onCanPlay)
            audio.removeEventListener('error', onError)
            console.log(` ${trackKey} audio ready to play`)
            resolve()
          }
          const onError = () => {
            audio.removeEventListener('canplaythrough', onCanPlay)
            audio.removeEventListener('error', onError)
            const code = audio.error?.code
            const msg = audio.error?.message
            console.error(` ${trackKey} audio failed to load`, { code, msg, src: audio.src?.slice(0, 80) })
            reject(new Error(`${trackKey}: audio error ${code ?? '?'}`))
          }
          audio.addEventListener('canplaythrough', onCanPlay)
          audio.addEventListener('error', onError)
        })

        newAudioElements[trackKey] = audio

        // Generar waveform + detectar onset
        try {
          console.log(` Generating waveform for ${trackKey}`)
          const response = await fetch(trackUrl)
          const arrayBuffer = await response.arrayBuffer()
          console.log(`${trackKey} file size: ${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB`)

          const tempContext = new AudioContext()
          const audioBuffer = await tempContext.decodeAudioData(arrayBuffer)
          tempContext.close()

          // Detectar onset
          const onsetTimeMs = detectOnset(audioBuffer)
          console.log(`[ONSET] ${trackKey}: ${onsetTimeMs}ms`)
          setTrackOnsets(prev => ({ ...prev, [trackKey]: onsetTimeMs }))

          const channelData = audioBuffer.getChannelData(0)

          let maxAmplitude = 0
          for (let i = 0; i < channelData.length; i++) {
            const abs = Math.abs(channelData[i])
            if (abs > maxAmplitude) maxAmplitude = abs
          }

          let sumSquares = 0
          for (let i = 0; i < channelData.length; i++) sumSquares += channelData[i] * channelData[i]
          const rmsAmplitude = Math.sqrt(sumSquares / channelData.length)

          console.log(` ${trackKey} audio analysis:`, {
            samples: channelData.length,
            maxAmplitude,
            rmsAmplitude,
            duration: audioBuffer.duration,
            sampleRate: audioBuffer.sampleRate,
            hasAudio: maxAmplitude > 0.001,
          })

          const waveformData = generateProfessionalWaveform(channelData, 800)
          newWaveforms[trackKey] = waveformData

          // Guardar en cache persistente
          const newPersistentCache = { ...waveformCache, [cacheKeyStable]: waveformData }
          setWaveformCache(newPersistentCache)
          try {
            localStorage.setItem('waveform-cache', JSON.stringify(newPersistentCache))
            console.log(` GUARDADO en cache para ${trackKey}`)
          } catch {
            localStorage.removeItem('waveform-cache')
            try {
              localStorage.setItem('waveform-cache', JSON.stringify({ [cacheKeyStable]: waveformData }))
            } catch {
              console.warn('No se pudo guardar waveform en localStorage para', trackKey)
            }
          }

          newLoadingStates[trackKey] = 'ready'
          console.log(` Waveform generado para ${trackKey}: ${waveformData.length} puntos`)
        } catch (waveErr) {
          console.error(`Error generating waveform for ${trackKey}:`, waveErr)
          newLoadingStates[trackKey] = 'idle'
        }

        console.log(`Audio loaded successfully for ${trackKey}`)
      } catch (stemError) {
        // Un stem fallido NO detiene los demás tracks
        console.error(`[loadAudioFiles] Falló el stem "${trackKey}" — continuando con el resto:`, stemError)
        newLoadingStates[trackKey] = 'idle'
      }
    }

    setAudioElements(newAudioElements)
    setWaveforms(newWaveforms)
    setTrackLoadingStates(newLoadingStates)

    let maxAudioDur = 0
    for (const a of Object.values(newAudioElements)) {
      maxAudioDur = Math.max(maxAudioDur, Number(a.duration) || 0)
    }
    const songSec =
      typeof song.durationSeconds === 'number' && Number.isFinite(song.durationSeconds)
        ? song.durationSeconds
        : 0
    if (maxAudioDur > 0 || songSec > 0) {
      setDuration((d) => Math.max(d, maxAudioDur, songSec))
    }
    
    // NO resetear el tiempo si ya había audios cargados
    // Esto previene que se reinicie cuando se recarga por cambios de color u otras actualizaciones
    console.log(' Carga completada - manteniendo estado de reproducción actual')
    
    console.log('All audio files loaded:', Object.keys(newAudioElements))
    console.log('All waveforms generated:', Object.keys(newWaveforms))
    } catch (outerError) {
      console.error('[loadAudioFiles] Error inesperado:', outerError)
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
      const timeSinceLastSeek = Date.now() - lastSeekTimeRef.current
      if (timeSinceLastSeek < 1500) {
        return
      }

      const dCap = Math.max(0.01, durationRef.current || 3600)
      const projectT = Math.max(0, Math.min(getTransportProjectTimeFromWallClock(), dCap))
      setCurrentTime(projectT)

      let maxDur = 0
      for (const a of Object.values(audioElements)) {
        maxDur = Math.max(maxDur, Number(a?.duration) || 0)
      }
      if (maxDur > 0) {
        setDuration(maxDur)
      }

      resyncStemAudioFilePositions(projectT, true)
    }

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
      <div className="min-h-[100dvh] bg-gray-900 flex items-center justify-center">
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
      <div className="min-h-[100dvh] bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">Por favor, inicia sesión</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] overflow-hidden bg-[#0a0a0a] font-sans text-[#fafafa] antialiased">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/70 backdrop-blur-sm md:hidden"
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[240px] shrink-0 flex-col border-r border-[#1f1f1f] bg-black transition-transform duration-200 ease-out md:static md:min-h-[100dvh] md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[#1f1f1f] px-4">
          <img src="/images/logo.png" alt="" className="h-8 w-auto object-contain opacity-95" />
          <span className="text-[15px] font-semibold tracking-tight text-white">Judith</span>
        </div>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#737373]">
            Productos
          </p>
          <button
            type="button"
            onClick={goToTracksSection}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
              activeStudioView === 'tracks'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Music className={`h-4 w-4 shrink-0 ${activeStudioView === 'tracks' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            Mis pistas
          </button>
          <p className="mb-2 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#737373]">
            Herramientas
          </p>
          <button
            type="button"
            onClick={handleYoutubeExtract}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeStudioView === 'youtube'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Youtube className={`h-4 w-4 shrink-0 ${activeStudioView === 'youtube' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            Extraer de YouTube
          </button>
          <button
            type="button"
            onClick={handleChordAnalysis}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeStudioView === 'chords'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Activity className={`h-4 w-4 shrink-0 ${activeStudioView === 'chords' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            Análisis de acordes
          </button>
          <button
            type="button"
            onClick={handleMetronome}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeStudioView === 'metronome'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Clock className={`h-4 w-4 shrink-0 ${activeStudioView === 'metronome' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            Metrónomo
          </button>
          <button
            type="button"
            onClick={handleBpmDisplay}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeStudioView === 'bpm'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Target className={`h-4 w-4 shrink-0 ${activeStudioView === 'bpm' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            Detector de BPM
          </button>
          <button
            type="button"
            onClick={handleTempoChange}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeStudioView === 'tempo'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Play className={`h-4 w-4 shrink-0 ${activeStudioView === 'tempo' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            Cambio de tempo
          </button>
          <button
            type="button"
            onClick={handleVolumeControl}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeStudioView === 'eq'
                ? 'bg-[#262626] text-white hover:bg-[#333333]'
                : 'text-[#a3a3a3] hover:bg-[#141414] hover:text-white'
            }`}
          >
            <Zap className={`h-4 w-4 shrink-0 ${activeStudioView === 'eq' ? 'text-[#d4d4d4]' : 'opacity-80'}`} />
            EQ Pro / Control de volumen
          </button>
          <p className="mb-2 mt-5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#737373]">
            Cuenta
          </p>
          <div className="mb-3 rounded-lg border border-[#2a2a2a] bg-[#111111] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#737373]">
              Plan
            </div>
            <div className="mt-1 text-sm font-medium text-white">
              {currentPlanId === 'starter' ? 'Free' : currentPlanId.toUpperCase()}
            </div>
            {currentPlanId === 'starter' && (
              <>
                <button
                  type="button"
                  onClick={() => setShowUpgradeModal(true)}
                  className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-[#f3d12f] px-3 py-2 text-xs font-semibold text-black transition hover:brightness-105"
                >
                  Upgrade
                </button>
              </>
            )}
            {currentPlanId === 'lite' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setUpgradeBilling('yearly')
                    setShowUpgradeModal(true)
                  }}
                  className="mt-2 inline-flex items-center justify-center rounded border border-amber-400/60 px-2 py-1 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-300/10"
                >
                  Upgrade to Pro
                </button>
                <div className="mt-1 text-[10px] text-[#737373]">Elige mensual o anual</div>
              </>
            )}
          </div>
          <a
            href="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-[#a3a3a3] transition hover:bg-[#141414] hover:text-white"
          >
            <HomeIcon className="h-4 w-4 shrink-0 opacity-80" />
            Inicio
          </a>
          {user?.email === 'ueservicesllc1@gmail.com' && (
            <button
              type="button"
              onClick={() => {
                router.push('/admin')
                setSidebarOpen(false)
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#a3a3a3] transition hover:bg-[#141414] hover:text-white"
            >
              <Settings className="h-4 w-4 shrink-0 opacity-80" />
              Admin
            </button>
          )}
        </nav>
        <div className="shrink-0 border-t border-[#1f1f1f] p-3">
          <div className="mb-3 flex items-center gap-2 rounded-lg px-1 py-1">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-[#2a2a2a]"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#262626]">
                <User className="h-4 w-4 text-[#a3a3a3]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">
                {user.displayName || user.email?.split('@')[0] || 'Usuario'}
              </div>
              <div className="truncate text-xs text-[#737373]">{user.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 rounded-lg p-2 text-[#737373] transition hover:bg-[#262626] hover:text-white"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          {canChangePassword && (
            <button
              type="button"
              onClick={handlePasswordReset}
              className="mb-2 w-full rounded-lg border border-[#2a2a2a] px-3 py-2 text-left text-xs text-[#bdbdbd] transition hover:bg-[#1a1a1a] hover:text-white"
            >
              Cambiar contraseña
            </button>
          )}
          <p className="px-1 text-[10px] uppercase tracking-wider text-[#525252]">Judith · Estudio v1.0</p>
        </div>
      </aside>

      <div className="flex min-h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden bg-[#121212]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#1f1f1f] px-4 md:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-[#a3a3a3] transition hover:bg-[#1a1a1a] hover:text-white md:hidden"
              aria-label="Abrir menú"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 md:hidden">
              <img src="/images/logo.png" alt="" className="h-7 w-auto object-contain opacity-90" />
              <span className="text-sm font-semibold text-white">Judith</span>
            </div>
          </div>
          <ConnectionStatus />
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-[#1f1f1f] px-4 py-5 md:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-white">
                  {activeStudioView === 'youtube'
                    ? 'Extraer de YouTube'
                    : activeStudioView === 'chords'
                      ? 'Análisis de acordes'
                      : activeStudioView === 'metronome'
                      ? 'Metrónomo'
                      : activeStudioView === 'bpm'
                        ? 'Detector de BPM'
                        : activeStudioView === 'tempo'
                          ? 'Cambio de tempo'
                          : activeStudioView === 'eq'
                            ? 'EQ Pro / Control de volumen'
                            : 'Separación de pistas'}
                </h1>
                <p className="mt-1 text-sm text-[#a3a3a3]">
                  {activeStudioView === 'youtube'
                    ? 'Pega la URL, extrae audio y descárgalo desde aquí.'
                    : activeStudioView === 'chords'
                      ? 'Selecciona una pista para ver acordes y tonalidad.'
                      : activeStudioView === 'metronome'
                      ? 'Control de BPM, compás y click en tiempo real.'
                      : activeStudioView === 'bpm'
                        ? 'Analiza tus audios para detectar tempo automáticamente.'
                      : activeStudioView === 'tempo'
                        ? 'Ajusta tempo y procesa el audio con motor profesional.'
                        : activeStudioView === 'eq'
                          ? 'Carga audio, ajusta ecualización y exporta en WAV o MP3.'
                          : `${songs.length} ${songs.length === 1 ? 'archivo' : 'archivos'}`}
                </p>
              </div>
              {activeStudioView === 'tracks' ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 max-w-md">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" />
                  <input
                    id="studio-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar por título, artista o género…"
                    className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-[#737373] focus:border-[#404040] focus:outline-none focus:ring-1 focus:ring-[#525252]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById('studio-search')?.focus()}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] text-[#a3a3a3] transition hover:border-[#404040] hover:text-white"
                  title="Buscar / filtrar"
                >
                  <Filter className="h-4 w-4" />
                </button>
                <div className="flex h-10 items-center gap-1.5 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-2">
                  <ArrowUpDown className="h-4 w-4 shrink-0 text-[#737373]" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="cursor-pointer bg-transparent py-1 text-sm text-[#e5e5e5] focus:outline-none"
                  >
                    <option value="added">Más recientes</option>
                    <option value="name">Nombre (A–Z)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMoisesStyleModal(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-[#e5e5e5]"
                >
                  <Plus className="h-4 w-4" />
                  Añadir
                </button>
              </div>
              ) : (
                <button
                  type="button"
                  onClick={goToTracksSection}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-2.5 text-sm font-semibold text-[#d4d4d4] transition hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Ver pistas
                </button>
              )}
            </div>
          </div>

        {/* Lista de pistas */}
        <div id="lista-canciones" className="safe-bottom min-h-0 flex-1 overflow-auto px-4 pb-32 pt-4 md:px-8 md:pb-28">
          {activeStudioView === 'youtube' ? (
            <div className="mx-auto max-w-3xl rounded-xl border border-[#2a2a2a] bg-[#111] p-5 md:p-6">
              <label className="mb-2 block text-sm font-medium text-zinc-300">URL del video</label>
              <input
                type="text"
                value={youtubeUrl}
                onChange={(e) => {
                  setYoutubeUrl(e.target.value)
                  setYoutubeExtractError('')
                }}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-white placeholder:text-[#666] focus:border-red-500 focus:outline-none"
                disabled={isExtractingYoutube}
              />
              {youtubeExtractError && <p className="mt-2 text-sm text-red-400">{youtubeExtractError}</p>}

              <button
                type="button"
                onClick={handleExtractYoutubeAudio}
                disabled={isExtractingYoutube}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExtractingYoutube ? <Loader2 className="h-5 w-5 animate-spin" /> : <Youtube className="h-5 w-5" />}
                {isExtractingYoutube ? 'Extrayendo...' : 'Extraer Audio'}
              </button>

              {youtubeExtractedAudio && (
                <div className="mt-6 rounded-lg border border-[#2a2a2a] bg-[#151515] p-4">
                  <p className="font-semibold text-white">{youtubeVideoTitle}</p>
                  <p className="mt-1 text-xs text-zinc-400">{(youtubeExtractedAudio.size / 1024 / 1024).toFixed(2)} MB</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadYoutubeAudio}
                      className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      <Download className="h-4 w-4" />
                      Descargar MP3
                    </button>
                    <button
                      type="button"
                      onClick={goToTracksSection}
                      className="rounded-md border border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2 text-sm text-zinc-200 hover:text-white"
                    >
                      Volver a pistas
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : activeStudioView === 'chords' ? (
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <ChordAnalysisModal
                isOpen
                embedded
                onClose={goToTracksSection}
                isPremium={isPremium}
              />
            </div>
          ) : activeStudioView === 'metronome' ? (
            <div className="mx-auto w-full max-w-6xl">
              <MetronomeModal
                isOpen
                embedded
                onClose={goToTracksSection}
              />
            </div>
          ) : activeStudioView === 'bpm' ? (
            <div className="mx-auto w-full max-w-4xl">
              <BpmDetectorModal
                isOpen
                embedded
                onClose={goToTracksSection}
              />
            </div>
          ) : activeStudioView === 'tempo' ? (
            <div className="mx-auto w-full max-w-[1500px]">
              <PitchTempoModal
                isOpen
                embedded
                onClose={goToTracksSection}
              />
            </div>
          ) : activeStudioView === 'eq' ? (
            <div className="mx-auto w-full max-w-[1500px]">
              <VolumeEQModal
                isOpen
                embedded
                onClose={goToTracksSection}
              />
            </div>
          ) : songsLoading ? (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]/50 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[#262626] animate-pulse">
                <Music className="h-8 w-8 text-[#a3a3a3]" />
              </div>
              <p className="text-lg text-white">Cargando pistas…</p>
              <p className="mt-1 text-sm text-[#737373]">Sincronizando con la nube</p>
            </div>
          ) : songs.length === 0 ? (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]/50 p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-[#262626]">
                <Music className="h-8 w-8 text-[#a3a3a3]" />
              </div>
              <h3 className="mb-2 text-xl font-medium text-white">Aún no hay pistas</h3>
              <p className="mb-6 text-[#a3a3a3]">Sube un audio para separar stems y empezar a trabajar.</p>
              <button
                type="button"
                onClick={() => setShowMoisesStyleModal(true)}
                className="mx-auto inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#e5e5e5]"
              >
                <Plus className="h-4 w-4" />
                Añadir pista
              </button>
            </div>
          ) : displayedSongs.length === 0 ? (
            <div className="rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]/50 p-12 text-center">
              <p className="text-white">No hay resultados para «{searchQuery}»</p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 text-sm text-[#a3a3a3] underline hover:text-white"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#1a1a1a]/40">
              <table className="w-full md:min-w-[800px]">
                <thead>
                  <tr className="border-b border-[#2a2a2a]">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      Título
                    </th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      Creado
                    </th>
                    <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      Género
                    </th>
                    <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      BPM
                    </th>
                    <th className="hidden xl:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      Tonalidad
                    </th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      Duración
                    </th>
                    <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-[#a3a3a3]">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSongs.map((song, index) => (
                    <tr
                      key={song.id}
                      data-song-id={song.id}
                      className="border-b border-[#1f1f1f] transition hover:bg-[#262626]/60"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {/* Botón de opciones para móvil */}
                          <div className="relative md:hidden">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setShowDropdown(showDropdown === song.id ? null : (song.id || ''))
                              }}
                              className="rounded-lg p-1 text-[#737373] hover:bg-[#262626] hover:text-white"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            
                            {showDropdown === song.id && (
                              <div className="absolute left-0 top-full z-20 mt-1 min-w-[140px] rounded-lg border border-[#2a2a2a] bg-[#1a1a1a] py-1 shadow-2xl">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setDeleteConfirmModal({ show: true, song: song })
                                    setShowDropdown(null)
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-950/30"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                          <span className="w-5 text-right text-xs tabular-nums text-[#737373]">{index + 1}</span>
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              console.log('Opening modal for song:', song.title)
                              setSelectedSong(song)
                              setShowSongModal(true)
                              setTimeout(() => loadAudioFiles(song), 100)
                            }}
                            className="min-w-0 flex-1 rounded-lg p-1 text-left transition hover:bg-[#1f1f1f]"
                          >
                            <div className="flex items-center gap-3">
                              {isLikelyThumbnailUrl(song.thumbnail) ? (
                                <img
                                  src={song.thumbnail}
                                  alt=""
                                  className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-[#2a2a2a]"
                                />
                              ) : (
                                <TrackWavePlaceholder />
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-white">{song.title}</div>
                                <div className="truncate text-xs text-[#a3a3a3]">{song.artist || '—'}</div>
                              </div>
                            </div>
                          </button>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm text-[#a3a3a3]">
                        {song.uploadedAt
                          ? (() => {
                              try {
                                const d = new Date(song.uploadedAt)
                                return isNaN(d.getTime())
                                  ? '—'
                                  : d.toLocaleDateString('es', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                              } catch {
                                return '—'
                              }
                            })()
                          : '—'}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-sm text-[#a3a3a3]">{song.genre || '—'}</td>
                      <td className="hidden lg:table-cell px-4 py-3 text-sm tabular-nums text-[#a3a3a3]">
                        {song.bpm ? (song.bpm % 1 === 0 ? song.bpm.toFixed(0) : song.bpm.toFixed(1)) : '…'}
                      </td>
                      <td className="hidden xl:table-cell px-4 py-3 text-sm text-[#a3a3a3]">{song.key || '—'}</td>
                      <td className="hidden md:table-cell px-4 py-3 text-sm tabular-nums text-[#a3a3a3]">{song.duration || '…'}</td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div className="flex items-center gap-1">
                          {song.stems && Object.keys(song.stems).length > 0 && <></>}
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handlePlayOriginalAudio(song)
                              }}
                              className="rounded-lg p-1 transition hover:bg-[#333333]"
                              title={currentPlayingSong === song.id ? 'Pausar audio original' : 'Reproducir audio original'}
                            >
                              <img 
                                src={currentPlayingSong === song.id ? "/images/pausa.png" : "/images/play.png"} 
                                alt={currentPlayingSong === song.id ? "Pause" : "Play"}
                                className="w-10 h-10"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleStopOriginalAudio(song)
                              }}
                              className="rounded-lg p-1 transition hover:bg-[#333333]"
                              title="Detener audio original"
                            >
                              <img 
                                src="/images/stop.png" 
                                alt="Stop"
                                className="w-10 h-10"
                              />
                            </button>
                          </div>
                          
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            console.log('🗑️ Click en eliminar:', song.title)
                            setDeleteConfirmModal({ show: true, song: song })
                          }}
                          className="rounded-lg p-2 text-[#a3a3a3] transition hover:bg-red-950/40 hover:text-red-400"
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
        </div>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-between border-t border-[#1f1f1f] bg-[#141414] px-4 py-4 md:left-[240px]">
        <div className="flex items-center space-x-2">
          <Volume2 className="h-4 w-4 text-[#737373]" />
        </div>
        <div className="text-sm font-light tracking-wide text-[#737373]">
          Powered & Designed by <span className="font-medium text-[#a3a3a3]">Freedom Labs</span>
        </div>
        <div className="flex items-center space-x-3">
          <a href="#" className="text-[#737373] transition hover:text-[#a3a3a3]" title="Facebook">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </a>
          <a href="#" className="text-[#737373] transition hover:text-[#a3a3a3]" title="Instagram">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 6.62 5.367 11.987 11.988 11.987 6.62 0 11.987-5.367 11.987-11.987C24.014 5.367 18.637.001 12.017.001zM8.449 16.988c-1.297 0-2.448-.49-3.323-1.297C4.198 14.895 3.708 13.744 3.708 12.447s.49-2.448 1.297-3.323c.875-.807 2.026-1.297 3.323-1.297s2.448.49 3.323 1.297c.807.875 1.297 2.026 1.297 3.323s-.49 2.448-1.297 3.323c-.875.807-2.026 1.297-3.323 1.297zm7.83-9.281H7.721v8.562h8.558V7.707z"/>
            </svg>
          </a>
          <a href="#" className="text-[#737373] transition hover:text-[#a3a3a3]" title="X (Twitter)">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a href="#" className="text-[#737373] transition hover:text-[#a3a3a3]" title="TikTok">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
          </a>
        </div>
      </div>
      </div>

      {/* Moises Style Upload Modal */}
      {showMoisesStyleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 md:p-4">
          <div className="bg-black mx-auto flex flex-col border border-white border-opacity-20 relative max-w-5xl w-full max-h-[95vh] md:max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Botón de cerrar */}
            <div className="absolute top-4 right-4 z-50">
              <button
                onClick={closeMoisesModal}
                className="text-white hover:text-gray-400 transition-colors bg-gray-800 hover:bg-gray-700 p-2 rounded-full shadow-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido del Modal */}
            <div className="overflow-y-auto p-3 sm:p-5 custom-scrollbar">
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
        <div className="fixed inset-0 z-50 flex flex-col items-stretch overflow-hidden bg-black bg-opacity-95 py-0 px-0 md:p-0">
          
          {/* Mobile Orientation Overlay - Only shows in portrait on mobile */}
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505] p-6 text-center md:hidden portrait:flex landscape:hidden">
            <div className="mb-6 animate-bounce">
              <div className="relative h-20 w-12 rounded-lg border-4 border-white/20">
                <div className="absolute inset-x-2 top-2 h-1 rounded-full bg-white/10" />
                <div className="absolute inset-x-2 bottom-2 h-1 rounded-full bg-white/10" />
                <div className="absolute -right-8 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full bg-white/20" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="h-6 w-6 animate-pulse text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              </div>
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">Gira tu pantalla</h3>
            <p className="max-w-[200px] text-sm text-[#a3a3a3]">
              Para usar el mezclador profesional, por favor coloca tu teléfono en posición horizontal.
            </p>
            <button 
              onClick={() => {
                Object.values(audioElements).forEach(audio => {
                  audio.pause()
                  audio.src = ''
                })
                closeSongModal()
              }}
              className="mt-8 rounded-full border border-white/10 px-6 py-2 text-xs text-[#737373] hover:text-white"
            >
              Cerrar y volver
            </button>
          </div>

          <div className="relative hidden min-h-0 w-full max-w-none flex-1 flex-col overflow-hidden border-none bg-[#0c0c0c] shadow-2xl landscape:flex md:flex md:min-h-0 md:h-dvh md:max-h-dvh md:rounded-none">
            {/* Botón de cerrar Absoluto para móvil */}
            <button
              onClick={() => {
                // Mismo logic que el botón de cerrar del header
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
                setAudioElements({})
                setWaveforms({})
                setTrackLoadingStates({})
                setOriginalAudioElements({})
                setCurrentPlayingSong(null)
                closeSongModal()
              }}
              className="absolute right-2 top-1 z-[60] flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-all hover:bg-black/80 md:hidden"
              aria-label="Cerrar mixer"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Header - transporte + BPM + sync (compacto: menos banda negra arriba) */}
            <div className="shrink-0 bg-black px-2 py-1 md:px-4 md:py-1.5 flex min-h-0 flex-wrap items-center gap-x-1.5 gap-y-1 md:gap-x-2 md:gap-y-1">
              <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto no-scrollbar md:gap-1.5">
                {/* Botón Play/Pause */}
                <button
                  onClick={togglePlayPause}
                  className="flex h-10 w-10 shrink-0 items-center justify-center bg-black/40 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-black/60 md:h-11 md:w-11 md:min-h-0 md:min-w-0"
                >
                  <img 
                    src={isPlaying ? "/images/pausa.png" : "/images/play.png"} 
                    alt={isPlaying ? "Pause" : "Play"}
                    className="h-7 w-7 md:h-8 md:w-8"
                  />
                </button>
                
                {/* Botón Stop */}
                <button
                  onClick={() => {
                    Object.entries(audioElements).forEach(([, audio]) => {
                      audio.pause();
                    });
                    resyncStemAudioFilePositions(0, false);
                    playbackWallOriginProjectSecRef.current = 0
                    playbackWallOriginPerfRef.current = performance.now()
                    setIsPlaying(false);
                    setCurrentTime(0);
                  }}
                  className="flex h-10 w-10 shrink-0 items-center justify-center bg-black/40 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-black/60 md:h-11 md:w-11 md:min-h-0 md:min-w-0"
                >
                  <img 
                    src="/images/stop.png" 
                    alt="Stop"
                    className="h-7 w-7 md:h-8 md:w-8"
                  />
                </button>
                
                {/* Pantalla LED - Tiempo actual */}
                <div className="bg-black p-0.5 shadow-lg shrink-0">
                  <div className="bg-gray-800 text-gray-200 font-mono text-[10px] md:text-sm font-bold tracking-wider px-1 py-0.5">
                    {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                
                {/* Barra de progreso */}
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  value={currentTime}
                  onChange={handleSeek}
                  className="h-1 w-16 bg-gray-700 appearance-none cursor-pointer accent-teal-500 md:w-52 shrink-0"
                />
                
                {/* Pantalla LED - Duración total */}
                <div className="bg-black p-0.5 shadow-lg shrink-0">
                  <div className="bg-gray-700 text-gray-100 font-mono text-[10px] md:text-sm font-bold tracking-wider px-1 py-0.5">
                    {duration ? `${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}` : '0:00'}
                  </div>
                </div>
                
                {/* Control de volumen */}
                <div className="flex items-center gap-1 md:gap-3 shrink-0">
                  <button
                    onClick={toggleMute}
                    className="flex h-10 w-10 items-center justify-center bg-black/40 shadow-lg backdrop-blur-md transition-all duration-300 hover:bg-black/60 md:h-11 md:w-11 md:min-h-0 md:min-w-0"
                  >
                    <img 
                      src={isMuted ? "/images/unmute.png" : "/images/mute.png"} 
                      alt={isMuted ? "Unmute" : "Mute"}
                      className="h-7 w-7 md:h-8 md:w-8"
                    />
                  </button>
                  
                  {/* Control de volumen master */}
                  <div className="hidden sm:flex items-center space-x-2">
                    <span className="text-white text-[10px] font-mono">Vol</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={isMuted ? 0 : volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-16 md:w-20 h-1 bg-gray-600 appearance-none cursor-pointer accent-yellow-400"
                    />
                    <span className="text-white text-[10px] font-mono w-8">
                      {Math.round((isMuted ? 0 : volume) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end md:flex-initial">
              {/* BPM and Key Display */}
              <BpmDisplay 
                songId={selectedSong?.id}
                originalUrl={selectedSong?.fileUrl}
                headerBpm={selectedSong?.bpm}
                headerKey={selectedSong?.key}
                compact
              />

              <button
                type="button"
                onClick={() => void handleSyncClick()}
                disabled={clickSyncBusy}
                className="flex shrink-0 items-center gap-1.5 rounded-md border-2 border-amber-500 bg-amber-600/90 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg shadow-amber-900/30 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:border-gray-600 disabled:bg-gray-800 disabled:text-gray-400 disabled:shadow-none md:px-3 md:text-xs"
                title="Alinea la fase del click con la batería/mezcla (necesita stem click_* y BPM de la canción)."
              >
                {clickSyncBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 shrink-0" />
                )}
                Sync click
              </button>

              {/* Botón de cerrar en el lado derecho - Oculto en móvil ya que usamos el absoluto */}
              <button
                onClick={() => {
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
                  setAudioElements({})
                  setWaveforms({})
                  setTrackLoadingStates({})
                  setOriginalAudioElements({})
                  setCurrentPlayingSong(null)
                  closeSongModal()
                }}
                className="hidden shrink-0 text-gray-400 hover:text-white md:block"
              >
                <X className="w-6 h-6" />
              </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Barra edición timeline: ancho completo para que cabecera izquierda y ondas sigan alineadas */}
              <div className="flex w-full shrink-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 border-b border-gray-800 bg-[#0c0c0c] px-2 py-0.5 md:gap-2 md:px-2.5 md:py-1">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSnapEnabled((v) => !v)}
                    className={`flex h-7 items-center gap-0.5 rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wide transition md:h-8 md:px-2 md:text-[11px] ${
                      snapEnabled
                        ? 'border-teal-600 bg-teal-900/50 text-teal-100'
                        : 'border-gray-700 bg-black/40 text-gray-500'
                    }`}
                    title={snapEnabled ? 'Snap al grid activado' : 'Snap desactivado (arrastre libre)'}
                  >
                    <Magnet className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" aria-hidden />
                    Snap
                  </button>
                  <label className="flex items-center gap-1 text-[9px] text-gray-400 md:text-[10px]">
                    <span className="hidden sm:inline">Grid</span>
                    <select
                      aria-label="Resolución del snap"
                      value={timelineSnapGrid}
                      onChange={(e) => setTimelineSnapGrid(e.target.value as TimelineSnapGrid)}
                      className="max-w-[5.5rem] cursor-pointer rounded border border-gray-600 bg-black px-1 py-0.5 text-[9px] text-gray-200 md:max-w-[6.5rem] md:text-[10px]"
                    >
                      <option value="off">Off</option>
                      <option value="1/16">1/16</option>
                      <option value="1/8">1/8</option>
                      <option value="beat">Pulso</option>
                      <option value="bar">Compás</option>
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-1 border-l border-gray-700 pl-2 text-[9px] text-gray-400 md:text-[10px]">
                  <span className="hidden sm:inline whitespace-nowrap">Compás regla</span>
                  <select
                    aria-label="Armadura para la regla en modo compases"
                    value={timelineMeter}
                    onChange={(e) => setTimelineMeter(e.target.value as TimelineMeter)}
                    className="cursor-pointer rounded border border-gray-600 bg-black px-1 py-0.5 text-[9px] text-gray-200 md:text-[10px]"
                  >
                    <option value="4/4">4/4</option>
                    <option value="3/4">3/4</option>
                    <option value="2/4">2/4</option>
                    <option value="6/8">6/8</option>
                  </select>
                </label>
                <div className="ml-auto flex min-w-0 flex-wrap items-center gap-1 border-l border-gray-700 pl-2 md:gap-1.5">
                  <span className="hidden shrink-0 text-[9px] font-medium uppercase tracking-wide text-gray-500 sm:inline md:text-[10px]">
                    Zoom
                  </span>
                  <button
                    type="button"
                    onClick={() => setHorizontalZoom((z) => Math.max(1, Math.round((z - 0.25) * 20) / 20))}
                    className="flex h-7 shrink-0 items-center justify-center rounded border border-gray-600 bg-black/50 p-1 text-gray-300 hover:bg-gray-800 hover:text-white md:h-8"
                    title="Alejar timeline"
                    aria-label="Alejar zoom horizontal"
                  >
                    <ZoomOut className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
                  </button>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={0.1}
                    value={horizontalZoom}
                    onChange={(e) => setHorizontalZoom(parseFloat(e.target.value))}
                    className="h-1 w-20 min-w-[4.5rem] flex-1 cursor-pointer appearance-none rounded-lg bg-gray-700 accent-amber-400 sm:w-28 md:w-36"
                    aria-label="Zoom horizontal del timeline"
                    title="Ancho del timeline (1×–10×). Zoom con la rueda solo sobre la regla TIME/COMPÁS. Con zoom mayor que 1×: rueda sobre las ondas desplaza; Shift+rueda también."
                  />
                  <button
                    type="button"
                    onClick={() => setHorizontalZoom((z) => Math.min(10, Math.round((z + 0.25) * 20) / 20))}
                    className="flex h-7 shrink-0 items-center justify-center rounded border border-gray-600 bg-black/50 p-1 text-gray-300 hover:bg-gray-800 hover:text-white md:h-8"
                    title="Acercar timeline"
                    aria-label="Acercar zoom horizontal"
                  >
                    <ZoomIn className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
                  </button>
                  <span className="shrink-0 font-mono text-[9px] text-amber-400/90 tabular-nums md:text-[10px]" title="Nivel de zoom">
                    {horizontalZoom < 10
                      ? `${Math.round(horizontalZoom * 10) / 10}×`
                      : `${Math.round(horizontalZoom)}×`}
                  </span>
                </div>
              </div>
            <div
              className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden border-b border-gray-800 md:flex-row ${
                mixerToolsCollapsed
                  ? 'min-h-0 flex-1 overflow-y-auto'
                  : 'flex flex-1 min-h-[121px] overflow-y-auto overflow-x-hidden md:min-h-0'
              }`}
            >
              {/* Área fija de controles a la izquierda */}
              <div className="w-[130px] md:w-52 flex-shrink-0 flex flex-col h-auto border-r border-gray-600">
                {/* Cabecera del Timeline (Espacio vacío para alineación) */}
                <div className="flex h-10 w-full shrink-0 items-center justify-between border-b border-gray-700 bg-black/40 px-2 md:h-11 md:px-3">
                   <div className="flex items-center gap-1.5 bg-[#1a1a1a] p-1 rounded border border-gray-700">
                     <button
                       onClick={() => setTimeFormat('time')}
                       className={`text-[9px] md:text-[10px] font-bold px-2 py-1 md:px-2.5 md:py-1.5 rounded transition-all ${timeFormat === 'time' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                       title="Formato de Tiempo (Minutos:Segundos)"
                     >
                       ⏱️ TIME
                     </button>
                     <button
                       onClick={() => setTimeFormat('beats')}
                       className={`text-[9px] md:text-[10px] font-bold px-2 py-1 md:px-2.5 md:py-1.5 rounded transition-all ${timeFormat === 'beats' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                       title="Formato de Compases (Measures/Beats)"
                     >
                       🎵 COMPÁS
                     </button>
                   </div>
                </div>

                {displayedTrackKeys.map((trackKey, index) => {
                  const trackUrl = (selectedSong?.stems as any)?.[trackKey];
                  const onsetValue = trackOnsets[trackKey];
                  // Colores grises escalados para cada track (fallback)
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
                      guitar: { color: 'bg-teal-500', letter: 'G', name: 'Guitar' },
                    };
                    
                    const clickLike = trackKey.toLowerCase().startsWith('click')
                    const config = clickLike
                      ? { color: 'bg-amber-500', letter: '●', name: 'Click' }
                      : trackConfig[trackKey as keyof typeof trackConfig] || {
                          color: 'bg-gray-500',
                          letter: trackKey.charAt(0).toUpperCase(),
                          name: trackKey,
                        };
                    
                    const rowH = trackRowHeightsPx[trackKey] ?? DEFAULT_TRACK_ROW_HEIGHT_PX
                    
                    // Si es el track del metronome, renderizar componente especial - REMOVED
                    
                    return (
                      <div 
                        key={trackKey} 
                        onPointerDown={(e) => {
                          if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [data-track-resize-handle]'))
                            return
                          setSelectedEditTrackKey(trackKey)
                        }}
                        onDragOver={(e) => handleTrackDragOver(e, index)}
                        className={`relative shrink-0 overflow-hidden bg-gray-700/50 border-b border-gray-600/50 flex flex-col items-start justify-between p-1.5 pl-2.5 transition-all duration-200 ${
                          selectedEditTrackKey === trackKey ? 'ring-2 ring-teal-400/80 ring-inset' : ''
                        } ${draggedIndex === index ? 'opacity-40 scale-[0.98]' : 'opacity-100'}`}
                        style={{
                          height: rowH,
                          minHeight: MIN_TRACK_ROW_HEIGHT_PX,
                        }}
                      >
                        {/* Parte superior con nombre y color */}
                        <div className="flex items-start justify-between w-full">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1 md:gap-1.5">
                              <div className="flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  title="Subir pista"
                                  aria-label="Subir pista"
                                  disabled={index <= 0}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    moveTrack(trackKey, -1)
                                  }}
                                  className="rounded p-0.5 text-gray-500 hover:bg-gray-600 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </button>
                                <div
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.effectAllowed = 'move'
                                    e.dataTransfer.setData('text/plain', trackKey)
                                    handleTrackDragStart(index)
                                  }}
                                  onDragEnd={handleTrackDragEnd}
                                  className="cursor-grab touch-none rounded p-0.5 text-gray-500 opacity-80 hover:bg-gray-600/80 hover:opacity-100 active:cursor-grabbing"
                                  title="Arrastrar para reordenar"
                                >
                                  <GripVertical className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </div>
                                <button
                                  type="button"
                                  title="Bajar pista"
                                  aria-label="Bajar pista"
                                  disabled={index >= displayedTrackKeys.length - 1}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    moveTrack(trackKey, 1)
                                  }}
                                  className="rounded p-0.5 text-gray-500 hover:bg-gray-600 hover:text-white disabled:opacity-25 disabled:hover:bg-transparent"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </button>
                              </div>
                              <span className="text-white text-[9px] md:text-xs font-bold truncate leading-none tracking-tight">{config.name}</span>
                              {trackUrl === undefined ? (
                                <span className="text-gray-400 text-[7px] md:text-[9px] font-mono bg-gray-800/50 px-0.5 rounded animate-pulse">
                                  ...
                                </span>
                              ) : (
                                <>
                                  {(() => {
                                    const onsetValue = trackOnsets[trackKey];
                                    return onsetValue !== undefined && (
                                      <span className="text-gray-400 text-[8px] font-mono bg-gray-900/80 px-1 rounded border border-gray-700">
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
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setShowColorPicker(trackKey);
                            }}
                            className="h-3 w-4 md:h-5 md:w-6 min-h-0 min-w-0 rounded border border-gray-600 hover:border-white transition-all duration-300 animate-pulse shadow-lg shrink-0"
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
                            <div className="flex items-center justify-between w-full">
                              {/* Slider de Volumen Horizontal - Más delgado */}
                              <div className="flex-1 relative mr-2">
                                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all duration-150"
                                    style={{ width: `${(trackVolumeStates[trackKey] ?? 1) * 100}%` }}
                                  />
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={trackVolumeStates[trackKey] ?? 1}
                                  onChange={(e) => setTrackVolume(trackKey, parseFloat(e.target.value))}
                                  className="absolute inset-0 w-full opacity-0 cursor-pointer"
                                />
                              </div>

                              {/* Botones M y S - Más pequeños */}
                              <div className="flex space-x-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleTrackMute(trackKey);
                                }}
                                className={`h-5 w-5 rounded flex items-center justify-center transition-all text-[9px] font-bold ${
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
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  toggleTrackSolo(trackKey);
                                }}
                                className={`h-5 w-5 rounded flex items-center justify-center transition-all text-[9px] font-bold ${
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
                        <div
                          data-track-resize-handle
                          role="separator"
                          aria-orientation="horizontal"
                          title="Arrastra: cambiar altura de la fila (la onda se recorta al achicar)."
                          className="absolute bottom-0 left-0 right-0 z-30 h-2.5 shrink-0 cursor-ns-resize border-t border-transparent hover:border-teal-500/40 hover:bg-black/30"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return
                            e.preventDefault()
                            e.stopPropagation()
                            bindTrackRowResizePointer(
                              e.currentTarget as HTMLDivElement,
                              trackKey,
                              e.pointerId,
                              e.clientY,
                              trackRowHeightsPx[trackKey] ?? DEFAULT_TRACK_ROW_HEIGHT_PX,
                            )
                          }}
                        />
                      </div>
                    );
                  })}
              </div>

              {/* Área de tracks (sin controles) - Asegurar scroll horizontal en móvil */}
              <div
                ref={scrollContainerRef}
                className="track-timeline-scroll block min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden bg-gray-900 border-l border-gray-800 md:border-none"
              >
                <div
                  className="flex h-auto min-h-0 w-full flex-col"
                  style={{
                    width: `${horizontalZoom * 100}%`,
                    minWidth: '100%',
                  }}
                >
                  {/* Timeline Ruler - Estilo DAW Profesional (rueda aquí = zoom horizontal) */}
                  <div
                    ref={rulerBarRef}
                    className="flex h-10 w-full cursor-pointer touch-none select-none border-b border-gray-600 bg-[#151515] relative shrink-0 z-30 md:h-11"
                    title="Clic o arrastre: ir a ese instante. Rueda: zoom horizontal."
                    onPointerDown={(e) => {
                      if (e.button !== 0) return
                      e.preventDefault()
                      const el = e.currentTarget as HTMLDivElement
                      const dur = Math.max(0.01, Number(duration || selectedSong?.duration || 1))
                      const applyFromClientX = (clientX: number) => {
                        const rect = el.getBoundingClientRect()
                        const frac = (clientX - rect.left) / Math.max(1, rect.width)
                        seekMixerToProjectSec(frac * dur)
                      }
                      applyFromClientX(e.clientX)
                      el.setPointerCapture(e.pointerId)
                      const onMove = (ev: PointerEvent) => applyFromClientX(ev.clientX)
                      const onEnd = (ev: PointerEvent) => {
                        try {
                          el.releasePointerCapture(ev.pointerId)
                        } catch {
                          /* ignore */
                        }
                        el.removeEventListener('pointermove', onMove)
                        el.removeEventListener('pointerup', onEnd)
                        el.removeEventListener('pointercancel', onEnd)
                      }
                      el.addEventListener('pointermove', onMove)
                      el.addEventListener('pointerup', onEnd)
                      el.addEventListener('pointercancel', onEnd)
                    }}
                  >
                    {(() => {
                      const markers = [];
                      const songDuration = Number(duration || selectedSong?.duration || 0);
                      const currentBpm = Number(selectedSong?.bpm || 120);
                      
                      // Duración de compás según BPM y armadura elegida (regla en modo compases)
                      const measureDuration = measureDurationFromMeter(currentBpm, timelineMeter);
                      
                      if (songDuration > 0) {
                        if (timeFormat === 'time') {
                          const step = 5; // Resolución ultra-fina
                          for (let t = 0; t <= songDuration; t += step) {
                            const mins = Math.floor(t / 60);
                            const secs = Math.floor(t % 60);
                            const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
                            const pos = (t / songDuration) * 100;
                            
                            const is30s = t % 30 === 0;
                            const is15s = t % 15 === 0;

                            markers.push({ timeStr, pos, is30s, is15s });
                          }
                        } else {
                          // Formato de compases (Measures)
                          const totalMeasures = Math.ceil(songDuration / measureDuration);
                          
                          // Mostrar más o menos texto dependiendo del zoom para no saturar
                          const textInterval = horizontalZoom > 4 ? 1 : (horizontalZoom > 2 ? 4 : 8);
                          
                          for (let m = 1; m <= totalMeasures; m++) {
                            const t = (m - 1) * measureDuration;
                            const pos = (t / songDuration) * 100;
                            
                            const is30s = (m - 1) % textInterval === 0;
                            const is15s = (m - 1) % Math.max(1, textInterval / 2) === 0;

                            markers.push({ 
                              timeStr: m.toString(), 
                              pos, 
                              is30s, 
                              is15s 
                            });
                          }
                        }
                      }
                      
                      return markers.map((m, i) => (
                        <div 
                          key={i} 
                          className={`pointer-events-none absolute top-0 h-full border-l transition-colors duration-300 ${m.is30s ? 'border-white/30' : m.is15s ? 'border-white/10' : 'border-white/5'}`}
                          style={{ left: `${m.pos}%` }}
                        >
                          {/* Marca vertical con altura jerárquica */}
                          <div className={`absolute top-0 left-0 w-px bg-white transition-opacity ${
                            m.is30s ? 'h-3 opacity-60' : 
                            m.is15s ? 'h-2 opacity-30' : 
                            'h-1 opacity-10'
                          }`}></div>
                          
                          {/* Solo mostrar texto en los marcadores de 30s con estilo premium */}
                      {m.is30s && (
                            <div className="absolute top-3 left-1 flex flex-col justify-start">
                              <span className="text-[8px] md:text-[10px] text-white/50 font-mono font-bold tracking-tight select-none">
                                {m.timeStr}
                              </span>
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                    
                    {/* Indicador de Tiempo Actual (Línea de Tiempo) con efecto de luz DAW */}
                    <div 
                      className="pointer-events-none absolute top-0 bottom-0 z-40 w-[1.5px] bg-yellow-400"
                      style={{ 
                        left: `${(currentTime / Math.max(Number(duration || selectedSong?.duration || 1), 0.1)) * 100}%`,
                        boxShadow: '0 0 12px 2px rgba(234,179,8,0.7)'
                      }}
                    />
                  </div>

                  {displayedTrackKeys.map((trackKey, index) => {
                    const trackUrl = (selectedSong?.stems as any)?.[trackKey];
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
                      guitar: { color: 'bg-teal-500', letter: 'G', name: 'Guitar' },
                    };
                    
                    const clickLike = trackKey.toLowerCase().startsWith('click')
                    const config = clickLike
                      ? { color: 'bg-amber-500', letter: '●', name: 'Click' }
                      : trackConfig[trackKey as keyof typeof trackConfig] || {
                          color: 'bg-gray-500',
                          letter: trackKey.charAt(0).toUpperCase(),
                          name: trackKey,
                        };
                    
                    const durForClip = Math.max(
                      0.01,
                      Number(duration || 0),
                      Number(selectedSong?.durationSeconds || 0),
                      Number(audioElements[trackKey]?.duration || 0),
                    )
                    const showWaveGestures =
                      trackUrl !== null &&
                      ((waveforms[trackKey]?.length ?? 0) > 0 || !!audioElements[trackKey])
                    const clipOffSec = trackClipOffsetSec[trackKey] ?? 0
                    const stemDurSec = Math.max(
                      0.01,
                      Number(audioElements[trackKey]?.duration || 0) || durForClip,
                    )
                    const sourceInSec = trackClipSourceInSec[trackKey] ?? 0
                    const sourceOutSec = resolveSourceOutSec(
                      trackClipSourceOutSec[trackKey],
                      stemDurSec,
                    )
                    const audibleSpanSec = Math.max(
                      MIN_STEM_CLIP_SPAN_SEC,
                      sourceOutSec - sourceInSec,
                    )
                    /** Timeline del proyecto (misma base que la regla): inicio del clip + duración visible. */
                    const clipStartFrac = Math.min(
                      1,
                      Math.max(0, clipOffSec / durForClip),
                    )
                    const spanSeconds = Math.min(
                      audibleSpanSec,
                      Math.max(0, durForClip - clipOffSec),
                    )
                    const clipWidthFracRaw = spanSeconds / durForClip
                    const clipWidthFrac = Math.max(
                      0.004,
                      Math.min(clipWidthFracRaw, 1 - clipStartFrac + 1e-9),
                    )

                    const peaksTrim = slicePeaksForSourceWindow(
                      waveforms[trackKey],
                      sourceInSec,
                      sourceOutSec,
                      stemDurSec,
                    )

                    const rowH = trackRowHeightsPx[trackKey] ?? DEFAULT_TRACK_ROW_HEIGHT_PX

                    return (
                      <div 
                        data-timeline-track-row={trackKey}
                        key={trackKey} 
                        onPointerDown={(e) => {
                          if (
                            (e.target as HTMLElement).closest(
                              'button, input, textarea, select, a, [data-track-resize-handle], [data-clip-trim-edge], [data-clip-fade-handle]',
                            )
                          )
                            return
                          setSelectedEditTrackKey(trackKey)
                        }}
                        onDragOver={(e) => handleTrackDragOver(e, index)}
                        className={`group/row relative w-full shrink-0 overflow-hidden transition-opacity duration-200 ${
                          selectedEditTrackKey === trackKey ? 'ring-2 ring-teal-400/70 ring-inset' : ''
                        } ${draggedIndex === index ? 'opacity-40' : 'opacity-100'}`}
                        style={{
                          height: rowH,
                          minHeight: MIN_TRACK_ROW_HEIGHT_PX,
                        }}
                      >
                        {/* Track independiente */}
                        {/* Lane estilo DAW: fondo oscuro fijo; el clip coloreado es solo el bloque inicio→fin */}
                        <div className="relative h-full min-w-0 overflow-hidden border-b border-gray-800 bg-[#0a0a0a]">
                          {trackUrl !== null &&
                          waveforms[trackKey] &&
                          waveforms[trackKey].length > 0 ? (
                            <div
                              data-clip-body
                              className={`absolute inset-y-0 z-[1] flex overflow-hidden rounded-md border border-black/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-black/30 transition-shadow group-hover/row:ring-teal-500/40 ${trackBackgroundColor}`}
                              style={{
                                left: `${clipStartFrac * 100}%`,
                                width: `${clipWidthFrac * 100}%`,
                                minWidth: '6px',
                              }}
                              title="Clip: arrastra bordes para trim no destructivo; arrastra el centro para mover."
                            >
                              <div className="flex h-full w-full min-w-0 items-center justify-center">
                                {waveformStyle === 'bars' && (
                                  <div className="relative flex h-full w-full min-w-0 items-center justify-center">
                                    <svg
                                      width="100%"
                                      height="100%"
                                      viewBox="0 0 800 60"
                                      className="absolute inset-0"
                                      preserveAspectRatio="none"
                                    >
                                      <defs>
                                        <linearGradient
                                          id={`waveGradient-${trackKey}`}
                                          x1="0%"
                                          y1="0%"
                                          x2="0%"
                                          y2="100%"
                                        >
                                          <stop
                                            offset="0%"
                                            style={{ stopColor: '#FFFFFF', stopOpacity: 0.9 }}
                                          />
                                          <stop
                                            offset="100%"
                                            style={{ stopColor: '#FFFFFF', stopOpacity: 0.9 }}
                                          />
                                        </linearGradient>
                                      </defs>

                                      <line
                                        x1="2"
                                        y1="30"
                                        x2="800"
                                        y2="30"
                                        stroke="#374151"
                                        strokeWidth="0.5"
                                        opacity="0.3"
                                      />

                                      <path
                                        d={generateFilledWaveformPath(peaksTrim)}
                                        fill={`url(#waveGradient-${trackKey})`}
                                        stroke="none"
                                      />

                                      <path
                                        d={peaksTrim
                                          .map((value, index) => {
                                            const x =
                                              2 +
                                              (index / Math.max(1, peaksTrim.length - 1)) * 798
                                            const y = 30 - value * 25
                                            return index === 0 ? `M ${x},${y}` : `L ${x},${y}`
                                          })
                                          .join(' ')}
                                        fill="none"
                                        stroke="#FFFFFF"
                                        strokeWidth="1"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        opacity="0.8"
                                      />

                                      <path
                                        d={peaksTrim
                                          .map((value, index) => {
                                            const x =
                                              2 +
                                              (index / Math.max(1, peaksTrim.length - 1)) * 798
                                            const y = 30 + value * 25
                                            return index === 0 ? `M ${x},${y}` : `L ${x},${y}`
                                          })
                                          .join(' ')}
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
                              {/* Fades visuales (triángulos) */}
                              {(() => {
                                const fi = trackClipFadeInSec[trackKey] ?? 0
                                const fo = trackClipFadeOutSec[trackKey] ?? 0
                                const wIn = Math.min(48, (fi / audibleSpanSec) * 100)
                                const wOut = Math.min(48, (fo / audibleSpanSec) * 100)
                                return (
                                  <>
                                    {fi > 0.001 && (
                                      <div
                                        className="pointer-events-none absolute left-0 top-0 z-[5] h-3 bg-black/35"
                                        style={{
                                          width: `${wIn}%`,
                                          clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                                        }}
                                        aria-hidden
                                      />
                                    )}
                                    {fo > 0.001 && (
                                      <div
                                        className="pointer-events-none absolute right-0 top-0 z-[5] h-3 bg-black/35"
                                        style={{
                                          width: `${wOut}%`,
                                          clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
                                        }}
                                        aria-hidden
                                      />
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                          ) : null}

                          {trackUrl === null ? (
                            <div className="relative z-[2] flex h-full w-full items-center justify-center">
                              <div className="text-center">
                                <div className="text-gray-300 text-sm font-bold animate-pulse">
                                  Generando Track...
                                </div>
                                <div className="text-gray-500 text-xs mt-1">
                                  Detectando onsets y calculando sincronización
                                </div>
                              </div>
                            </div>
                          ) : !waveforms[trackKey] || waveforms[trackKey].length === 0 ? (
                            <div className="relative z-[2] flex h-full w-full items-center justify-center">
                              <div className="text-gray-500 text-xs text-center">
                                {isLoadingAudio
                                  ? 'Loading...'
                                  : audioElements[trackKey]
                                    ? 'Ready'
                                    : trackUrl
                                      ? 'Available'
                                      : 'Not available'}
                              </div>
                            </div>
                          ) : null}
                          
                          {/* Línea de reproducción profesional sincronizada - CLICKEABLE */}
                          {showWaveGestures && (
                            <div
                              className="absolute inset-0 z-[25] touch-none cursor-grab bg-transparent hover:bg-white/[0.03] active:cursor-grabbing"
                              title="Selecciona la pista. Arrastra para mover el clip (respeta snap si está activo). Clic sin mover = ir a ese instante."
                              onPointerDown={(e) => {
                                if (e.button !== 0) return
                                if ((e.target as HTMLElement).closest('[data-clip-trim-edge], [data-clip-fade-handle]')) return
                                e.preventDefault()
                                setSelectedEditTrackKey(trackKey)
                                const rect = e.currentTarget.getBoundingClientRect()
                                const dur = Math.max(0.01, Number(duration || selectedSong?.duration || 1))
                                clipDragRef.current = {
                                  trackKey,
                                  startClientX: e.clientX,
                                  startClip: trackClipOffsetSecRef.current[trackKey] ?? 0,
                                  width: Math.max(1, rect.width),
                                  durationSec: dur,
                                  moved: false,
                                }
                                ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
                              }}
                              onPointerMove={(e) => {
                                const d = clipDragRef.current
                                if (!d || d.trackKey !== trackKey) return
                                const dx = e.clientX - d.startClientX
                                if (Math.abs(dx) > 4) d.moved = true
                                if (!d.moved) return
                                const deltaSec = (dx / d.width) * d.durationSec
                                const raw = d.startClip + deltaSec
                                const bpm = Number(selectedSong?.bpm || 120)
                                const grid = snapEnabledRef.current
                                  ? timelineSnapGridRef.current
                                  : 'off'
                                const snapped =
                                  grid === 'off' ? raw : snapSecondsToGrid(raw, bpm, grid)
                                const next = clampClipStartSec(snapped, d.durationSec)
                                setTrackClipOffsetSec((prev) => {
                                  const nextMap = { ...prev, [trackKey]: next }
                                  trackClipOffsetSecRef.current = nextMap
                                  resyncStemAudioFilePositions(
                                    getProjectTimelineFromRefs(),
                                    isPlayingRef.current,
                                  )
                                  return nextMap
                                })
                              }}
                              onPointerUp={(e) => {
                                const el = e.currentTarget as HTMLDivElement
                                const d = clipDragRef.current
                                clipDragRef.current = null
                                try {
                                  el.releasePointerCapture(e.pointerId)
                                } catch {
                                  /* ignore */
                                }
                                if (!d || d.trackKey !== trackKey) return
                                if (d.moved) {
                                  lastSeekTimeRef.current = Date.now()
                                  resyncStemAudioFilePositions(
                                    getProjectTimelineFromRefs(),
                                    isPlayingRef.current,
                                  )
                                  schedulePersistStemClipEdits()
                                  return
                                }
                                const rect = el.getBoundingClientRect()
                                const x = e.clientX - rect.left
                                const newTime =
                                  (x / Math.max(1, rect.width)) * d.durationSec
                                lastSeekTimeRef.current = Date.now()
                                resyncStemAudioFilePositions(newTime, isPlaying)
                                Object.values(originalAudioElements).forEach((audio) => {
                                  const df = audio.duration || 0
                                  const safe = Math.max(0, df - 0.02)
                                  audio.currentTime = Math.max(0, Math.min(newTime, safe))
                                })
                                setCurrentTime(newTime)
                                if (isPlaying) {
                                  playbackWallOriginProjectSecRef.current = newTime
                                  playbackWallOriginPerfRef.current = performance.now()
                                }
                              }}
                              onPointerCancel={(e) => {
                                clipDragRef.current = null
                                try {
                                  ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
                                } catch {
                                  /* ignore */
                                }
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
                          {showWaveGestures && (waveforms[trackKey]?.length ?? 0) > 0 && (
                            <>
                              <div
                                data-clip-trim-edge="left"
                                role="separator"
                                aria-orientation="vertical"
                                title="Trim inicio (no destructivo)"
                                className={`pointer-events-auto absolute top-0 bottom-0 z-[42] w-2 cursor-ew-resize rounded-l-md bg-gradient-to-r from-black/80 to-transparent opacity-0 transition-opacity hover:opacity-100 ${
                                  selectedEditTrackKey === trackKey ? 'opacity-90' : 'group-hover/row:opacity-70'
                                }`}
                                style={{
                                  left: `${clipStartFrac * 100}%`,
                                  transform: 'translateX(-50%)',
                                }}
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const clipBody = (e.currentTarget as HTMLElement).closest(
                                    '[data-timeline-track-row]',
                                  )?.querySelector('[data-clip-body]') as HTMLDivElement | null
                                  if (!clipBody) return
                                  bindClipTrimPointer(
                                    e.currentTarget as HTMLDivElement,
                                    trackKey,
                                    'left',
                                    e.pointerId,
                                    e.clientX,
                                    clipBody,
                                  )
                                }}
                              />
                              <div
                                data-clip-trim-edge="right"
                                role="separator"
                                aria-orientation="vertical"
                                title="Trim final (no destructivo)"
                                className={`pointer-events-auto absolute top-0 bottom-0 z-[42] w-2 cursor-ew-resize rounded-r-md bg-gradient-to-l from-black/80 to-transparent opacity-0 transition-opacity hover:opacity-100 ${
                                  selectedEditTrackKey === trackKey ? 'opacity-90' : 'group-hover/row:opacity-70'
                                }`}
                                style={{
                                  left: `${(clipStartFrac + clipWidthFrac) * 100}%`,
                                  transform: 'translateX(-50%)',
                                }}
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const clipBody = (e.currentTarget as HTMLElement).closest(
                                    '[data-timeline-track-row]',
                                  )?.querySelector('[data-clip-body]') as HTMLDivElement | null
                                  if (!clipBody) return
                                  bindClipTrimPointer(
                                    e.currentTarget as HTMLDivElement,
                                    trackKey,
                                    'right',
                                    e.pointerId,
                                    e.clientX,
                                    clipBody,
                                  )
                                }}
                              />
                              <div
                                data-clip-fade-handle
                                className="pointer-events-auto absolute top-0 z-[43] h-4 w-10 cursor-ns-resize hover:bg-white/15"
                                title="Fade in: arrastra vertical"
                                style={{
                                  left: `calc(${clipStartFrac * 100}% + 2px)`,
                                }}
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return
                                  e.preventDefault()
                                  e.stopPropagation()
                                  bindClipFadePointer(
                                    e.currentTarget as HTMLDivElement,
                                    trackKey,
                                    'in',
                                    e.pointerId,
                                    e.clientY,
                                    audibleSpanSec,
                                    trackClipFadeInSec[trackKey] ?? 0,
                                  )
                                }}
                              />
                              <div
                                data-clip-fade-handle
                                className="pointer-events-auto absolute top-0 z-[43] h-4 w-10 cursor-ns-resize hover:bg-white/15"
                                title="Fade out: arrastra vertical"
                                style={{
                                  left: `calc(${(clipStartFrac + clipWidthFrac) * 100}% - 42px)`,
                                }}
                                onPointerDown={(e) => {
                                  if (e.button !== 0) return
                                  e.preventDefault()
                                  e.stopPropagation()
                                  bindClipFadePointer(
                                    e.currentTarget as HTMLDivElement,
                                    trackKey,
                                    'out',
                                    e.pointerId,
                                    e.clientY,
                                    audibleSpanSec,
                                    trackClipFadeOutSec[trackKey] ?? 0,
                                  )
                                }}
                              />
                            </>
                          )}
                          <div
                            data-track-resize-handle
                            role="separator"
                            aria-orientation="horizontal"
                            title="Arrastra: cambiar altura de la fila (la onda se recorta al achicar)."
                            className="absolute bottom-0 left-0 right-0 z-[35] h-2.5 cursor-ns-resize hover:bg-teal-400/20"
                            onPointerDown={(e) => {
                              if (e.button !== 0) return
                              e.preventDefault()
                              e.stopPropagation()
                              bindTrackRowResizePointer(
                                e.currentTarget as HTMLDivElement,
                                trackKey,
                                e.pointerId,
                                e.clientY,
                                trackRowHeightsPx[trackKey] ?? DEFAULT_TRACK_ROW_HEIGHT_PX,
                              )
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            </div>

            <div className="relative z-30 flex h-11 w-full shrink-0 border-y border-amber-900/50 bg-gradient-to-b from-[#1f1f1f] to-[#141414] shadow-[0_-6px_16px_rgba(0,0,0,0.5)]">
              <button
                type="button"
                onClick={() => void handleSyncClick()}
                disabled={clickSyncBusy}
                className="flex shrink-0 items-center gap-1.5 border-r border-gray-600 px-2.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 transition hover:bg-black/25 hover:text-amber-200 disabled:cursor-wait disabled:opacity-60 sm:px-3 sm:text-[11px]"
                title="Alinea la fase del click con batería/mezcla (usa BPM de la canción)."
              >
                {clickSyncBusy ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                )}
                Sync click
              </button>
              <button
                type="button"
                onClick={() => setMixerToolsCollapsed((c) => !c)}
                aria-expanded={!mixerToolsCollapsed}
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 border-l border-white/5 bg-black/20 px-2 text-gray-200 transition hover:bg-black/40 hover:text-white"
                title={
                  mixerToolsCollapsed
                    ? 'Mostrar acordes, EQ y guardar'
                    : 'Ocultar panel inferior (más espacio para las pistas)'
                }
              >
                {mixerToolsCollapsed ? (
                  <ChevronUp className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
                ) : (
                  <ChevronDown className="h-5 w-5 shrink-0 text-amber-400" aria-hidden />
                )}
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-200 sm:text-xs">
                  {mixerToolsCollapsed ? 'Mostrar panel' : 'Ocultar panel'}
                </span>
              </button>
            </div>

            {!mixerToolsCollapsed && (
            <div className="flex shrink-0 flex-col overflow-x-hidden overflow-y-auto bg-black px-1 pt-0 pb-0 md:px-4 md:pb-1">
              <div className="flex w-full max-w-full shrink-0 flex-col">
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
                      lastSeekTimeRef.current = Date.now()
                      resyncStemAudioFilePositions(time, isPlaying)
                      if (isPlaying) {
                        playbackWallOriginProjectSecRef.current = time
                        playbackWallOriginPerfRef.current = performance.now()
                      }
                      Object.values(originalAudioElements).forEach((audio) => {
                        const d = audio.duration || 0
                        const safe = Math.max(0, d - 0.02)
                        audio.currentTime = Math.max(0, Math.min(time, safe))
                      })
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
            )}

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
              &quot;{deleteConfirmModal.song.title}&quot;
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

      {showUpgradeModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-[#2a2a2a] bg-[#111] p-4 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Elige tu plan</h3>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="rounded p-2 text-[#a3a3a3] hover:bg-[#1a1a1a] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 inline-flex rounded-lg border border-[#2a2a2a] bg-[#0d0d0d] p-1">
              <button
                type="button"
                onClick={() => setUpgradeBilling('monthly')}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  upgradeBilling === 'monthly' ? 'bg-[#2a2a2a] text-white' : 'text-[#a3a3a3]'
                }`}
              >
                Mensual
              </button>
              <button
                type="button"
                onClick={() => setUpgradeBilling('yearly')}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  upgradeBilling === 'yearly' ? 'bg-[#2a2a2a] text-white' : 'text-[#a3a3a3]'
                }`}
              >
                Anual
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[#2a2a2a] bg-[#151515] p-4">
                <p className="text-sm text-[#a3a3a3]">Lite</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {upgradeBilling === 'yearly' ? '$4.17/mo' : '$4.99/mo'}
                </p>
                <p className="text-xs text-[#737373]">
                  {upgradeBilling === 'yearly' ? '$49.99 billed annually' : 'Facturación mensual'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (currentPlanId === 'lite') return
                    setShowUpgradeModal(false)
                    setSidebarOpen(false)
                    startUpgradeCheckout('lite', upgradeBilling)
                  }}
                  disabled={currentPlanId === 'lite'}
                  className={`mt-3 w-full rounded-md px-3 py-2 text-sm font-semibold transition ${
                    currentPlanId === 'lite'
                      ? 'cursor-not-allowed border border-[#3a3a3a] bg-[#1e1e1e] text-[#737373]'
                      : 'bg-[#f3d12f] text-black hover:brightness-105'
                  }`}
                >
                  {currentPlanId === 'lite' ? 'Plan actual' : 'Elegir Lite'}
                </button>
              </div>

              <div className="rounded-lg border border-[#2a2a2a] bg-[#151515] p-4">
                <p className="text-sm text-[#a3a3a3]">Pro</p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {upgradeBilling === 'yearly' ? '$8.33/mo' : '$9.99/mo'}
                </p>
                <p className="text-xs text-[#737373]">
                  {upgradeBilling === 'yearly' ? '$99.99 billed annually' : 'Facturación mensual'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (currentPlanId === 'pro') return
                    setShowUpgradeModal(false)
                    setSidebarOpen(false)
                    startUpgradeCheckout('pro', upgradeBilling)
                  }}
                  disabled={currentPlanId === 'pro'}
                  className={`mt-3 w-full rounded-md px-3 py-2 text-sm font-semibold transition ${
                    currentPlanId === 'pro'
                      ? 'cursor-not-allowed border border-[#3a3a3a] bg-[#1e1e1e] text-[#737373]'
                      : 'bg-[#f3d12f] text-black hover:brightness-105'
                  }`}
                >
                  {currentPlanId === 'pro' ? 'Plan actual' : 'Elegir Pro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}