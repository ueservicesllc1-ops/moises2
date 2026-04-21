/**
 * Moises Style Upload Component
 * Arquitectura simplificada estilo Moises:
 * - Solo B2 Storage
 * - URLs consistentes
 * - Sin almacenamiento local
 * - Flujo simplificado
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { saveSong, getCurrentMonthProcessedSeconds } from '../lib/firestore';
import { getBackendUrl } from '../lib/config';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { PLAN_LIMITS, resolvePlanIdFromUserData } from '@/lib/pricing';
import { stemPathFromB2PublicUrl, toBackendAudioProxyUrl } from '@/lib/audioProxy';
import SuccessWavePopup from './SuccessWavePopup';

interface MoisesStyleUploadProps {
  onUploadComplete?: (songData: any) => void;
  preloadedFile?: File | null; // Archivo precargado desde YouTube u otra fuente
}

interface SeparationOptions {
  separationType: string; // 'vocals-instrumental', 'vocals-drums-bass-other', 'custom'
  vocals?: boolean;
  drums?: boolean;
  bass?: boolean;
  other?: boolean;
  guitar?: boolean;
  piano?: boolean;
  hiFiMode: boolean;
  qualityProfile: 'fast' | 'pro_balanced' | 'hifi';
}

const MoisesStyleUpload: React.FC<MoisesStyleUploadProps> = ({ onUploadComplete, preloadedFile }) => {
  const { user } = useAuth();
  const [currentPlanId, setCurrentPlanId] = useState<'starter' | 'lite' | 'pro'>('starter');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(preloadedFile || null);
  const [showNoFilePopup, setShowNoFilePopup] = useState(false);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [pythonServerOnline, setPythonServerOnline] = useState(false);
  const [demucsWorking, setDemucsWorking] = useState(false);
  const [b2ProxyOnline, setB2ProxyOnline] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [completedTrackCount, setCompletedTrackCount] = useState(2);
  const [monthlyUsedSeconds, setMonthlyUsedSeconds] = useState(0);
  const [usageLoading, setUsageLoading] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [showQueuePopup, setShowQueuePopup] = useState(false);
  const [separationOptions, setSeparationOptions] = useState<SeparationOptions>({
    separationType: 'vocals-instrumental',
    vocals: false,
    drums: false,
    bass: false,
    other: false,
    guitar: false,
    piano: false,
    hiFiMode: false,
    qualityProfile: 'pro_balanced'
  });

  // Efecto para manejar archivo precargado
  React.useEffect(() => {
    if (preloadedFile) {
      setUploadedFile(preloadedFile);
      setUploadMessage(`Archivo de YouTube: ${preloadedFile.name}`);
      console.log('📁 Archivo precargado desde YouTube:', preloadedFile.name);
    }
  }, [preloadedFile]);

  useEffect(() => {
    const loadPlan = async () => {
      if (!user?.uid) {
        setCurrentPlanId('starter');
        return;
      }
      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : null;
        setCurrentPlanId(resolvePlanIdFromUserData(userData));
      } catch (error) {
        console.error('Error loading user plan:', error);
        setCurrentPlanId('starter');
      }
    };

    loadPlan();
  }, [user?.uid]);

  useEffect(() => {
    const loadUsage = async () => {
      if (!user?.uid) {
        setMonthlyUsedSeconds(0);
        return;
      }
      try {
        setUsageLoading(true);
        const usedSeconds = await getCurrentMonthProcessedSeconds(user.uid);
        setMonthlyUsedSeconds(usedSeconds);
      } catch (error) {
        console.error('Error loading monthly usage:', error);
      } finally {
        setUsageLoading(false);
      }
    };

    loadUsage();
  }, [user?.uid, currentPlanId]);

  const isPremium = currentPlanId !== 'starter';
  const planLimits = PLAN_LIMITS[currentPlanId];
  const monthlyLimitSeconds = planLimits.includedMinutesMonthly ? planLimits.includedMinutesMonthly * 60 : null;
  const usedMinutes = monthlyUsedSeconds / 60;
  const remainingMinutes = monthlyLimitSeconds !== null ? Math.max(0, (monthlyLimitSeconds - monthlyUsedSeconds) / 60) : null;

  // Timer para contador de tiempo transcurrido
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isUploading && uploadStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - uploadStartTime) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isUploading, uploadStartTime]);

  // Formatear tiempo transcurrido
  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const buildUserFriendlySeparationError = (rawError: string): string => {
    const msg = (rawError || '').toLowerCase();
    if (
      msg.includes('worker remoto') ||
      msg.includes('timeout') ||
      msg.includes('saturado') ||
      msg.includes('tiempo de espera')
    ) {
      return 'El motor de separación está ocupado temporalmente. Intenta de nuevo en 1-2 minutos.';
    }
    if (msg.includes('error del servidor (500)')) {
      return 'El servidor de IA devolvió un error interno. Reintenta en unos minutos.';
    }
    return rawError || 'Error desconocido durante la separación.';
  };

  // Verificar estado del servidor Python cada 3 segundos
  useEffect(() => {
    const checkPythonServer = async () => {
      try {
        // Usar el endpoint de Next.js que hace proxy al backend
        const response = await fetch('/api/health', {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        });
        setPythonServerOnline(response.ok);
      } catch (error) {
        setPythonServerOnline(false);
      }
    };

    // Verificar inmediatamente
    checkPythonServer();
    
    // Verificar cada 3 segundos
    const interval = setInterval(checkPythonServer, 3000);
    
    return () => clearInterval(interval);
  }, []);

  // Verificar estado del proxy B2 (Mock) ahora que S3 es nativo
  useEffect(() => {
    // Como eliminamos el proxy en puerto 3001 y centralizamos en el Backend,
    // el estado de la comunicación S3 está atado con la salud de Python (8000).
    setB2ProxyOnline(pythonServerOnline);
  }, [pythonServerOnline]);

  // Detectar si Demucs está trabajando (cuando está procesando)
  useEffect(() => {
    if (isUploading && uploadProgress >= 20 && uploadProgress < 95) {
      setDemucsWorking(true);
    } else {
      setDemucsWorking(false);
    }
  }, [isUploading, uploadProgress]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setUploadMessage(`Archivo seleccionado: ${file.name}`);
    }
  }, []);

  // Función para calcular la duración del audio
  const getAudioDuration = async (file: File): Promise<{duration: string, durationSeconds: number}> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        const durationSeconds = Math.floor(audio.duration);
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = durationSeconds % 60;
        const duration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        resolve({ duration, durationSeconds });
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('Error al cargar el audio para calcular duración'));
      };
      
      audio.src = URL.createObjectURL(file);
    });
  };

  const getSeparationType = (options: SeparationOptions): string => {
    return options.separationType;
  };

  const handleUpload = async () => {
    if (!uploadedFile) {
      setShowNoFilePopup(true);
      return;
    }
    
    if (!user) {
      console.error('❌ No hay usuario:', { user });
      return;
    }

    if (uploadedFile.size > planLimits.maxUploadBytes) {
      const maxMb = Math.floor(planLimits.maxUploadBytes / (1024 * 1024));
      alert(`Tu plan ${planLimits.displayName} permite archivos de hasta ${maxMb}MB.`);
      setUploadMessage(`❌ Límite de archivo excedido (máx. ${maxMb}MB)`);
      return;
    }

    let nextAudioDurationSeconds = 0;
    try {
      const audioDuration = await getAudioDuration(uploadedFile);
      nextAudioDurationSeconds = audioDuration.durationSeconds;
    } catch (err) {
      console.warn('No se pudo calcular duración antes de subir:', err);
    }

    if (planLimits.includedMinutesMonthly !== null) {
      try {
        const usedSeconds = await getCurrentMonthProcessedSeconds(user.uid);
        const monthlyLimitSeconds = planLimits.includedMinutesMonthly * 60;
        const projectedTotal = usedSeconds + nextAudioDurationSeconds;
        if (projectedTotal > monthlyLimitSeconds) {
          const usedMinutes = (usedSeconds / 60).toFixed(1);
          alert(
            `Tu plan Starter incluye 10 minutos al mes. Ya llevas ${usedMinutes} min este mes. ` +
            'Puedes ver resultados gratis y subir más minutos al pasar a Lite o Pro.'
          );
          setUploadMessage('❌ Límite mensual Starter alcanzado (10 min)');
          return;
        }
      } catch (err) {
        console.error('Error validando minutos del plan Starter:', err);
      }
    }

    console.log('🚀 Iniciando upload:', {
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      fileType: uploadedFile.type,
      userId: user.uid,
      separationType: getSeparationType(separationOptions),
      hiFi: separationOptions.hiFiMode,
      tracksSeleccionados: {
        vocals: separationOptions.vocals,
        drums: separationOptions.drums,
        bass: separationOptions.bass,
        other: separationOptions.other,
        guitar: separationOptions.guitar,
        piano: separationOptions.piano
      }
    });

    setIsUploading(true);
    setUploadProgress(0);
    setUploadMessage('Iniciando subida estilo Moises...');
    setUploadStartTime(Date.now());
    setElapsedTime(0);

    try {
      // Crear FormData
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('separation_type', getSeparationType(separationOptions));
      formData.append('hi_fi', separationOptions.hiFiMode.toString());
      formData.append('user_id', user.uid);
      const effectiveQualityProfile = separationOptions.hiFiMode ? 'hifi' : separationOptions.qualityProfile;
      formData.append('quality_profile', effectiveQualityProfile);
      
      // 🔥 FIX: Enviar tracks seleccionados cuando es custom
      if (separationOptions.separationType === 'custom') {
        const selectedTracks = {
          vocals: separationOptions.vocals,
          drums: separationOptions.drums,
          bass: separationOptions.bass,
          other: separationOptions.other,
          guitar: separationOptions.guitar,
          piano: separationOptions.piano
        };
        formData.append('separation_options', JSON.stringify(selectedTracks));
        console.log('🎯 Enviando tracks custom:', selectedTracks);
      }

      console.log('📤 FormData creado:', {
        separationType: getSeparationType(separationOptions),
        hiFi: separationOptions.hiFiMode.toString(),
        userId: user.uid,
        separationOptions: separationOptions.separationType === 'custom' ? {
          vocals: separationOptions.vocals,
          drums: separationOptions.drums,
          bass: separationOptions.bass,
          other: separationOptions.other,
          guitar: separationOptions.guitar,
          piano: separationOptions.piano
        } : 'N/A'
      });

      setUploadProgress(20);
      setUploadMessage('📤 Enviando archivo al servidor...');

      console.log('🌐 Enviando request a: /api/separate');
      
      // Llamar al endpoint de Next.js que hace proxy al backend Python
      const response = await fetch('/api/separate', {
        method: 'POST',
        body: formData,
      });

      console.log('📡 Response recibida:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      setUploadProgress(40);
      setUploadMessage('☁️ Subiendo archivo a la nube...');

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Error del servidor (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Resultado Moises Style:', result);

      // Siempre usar formato Moises Style
      if (result.success && result.data) {
        setUploadMessage('🤖 Procesando con IA (Demucs)...');
        setUploadProgress(60);
        
        // Esperar a que se complete la separación
        await waitForSeparationCompletion(result.data.task_id, uploadedFile, user);
        
      } else {
        throw new Error(result.error || 'Error en el procesamiento');
      }

    } catch (error) {
      console.error('❌ Error completo en upload:', {
        error,
        message: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined
      });
      
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      const friendlyMessage = buildUserFriendlySeparationError(errorMessage);
      setUploadMessage(`❌ ${friendlyMessage}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleOptionChange = (option: keyof SeparationOptions) => {
    if (!isPremium) {
      alert("⭐️ Esta característica requiere una cuenta PRO.");
      return;
    }

    // Si están activando un track individual (vocals, drums, bass, other)
    if (option === 'vocals' || option === 'drums' || option === 'bass' || option === 'other') {
      setSeparationOptions(prev => {
        const newValue = !prev[option];
        
        // Si están activando un track individual, desactivar "vocals-instrumental"
        if (newValue) {
          return {
            ...prev,
            [option]: newValue,
            separationType: 'custom' // Cambiar a modo custom
          };
        } else {
          // Si están desactivando, verificar si todos los tracks están desactivados
          const updatedOptions = {
            ...prev,
            [option]: newValue
          };
          
          // Si todos los tracks individuales están desactivados, activar "vocals-instrumental"
          if (!updatedOptions.vocals && !updatedOptions.drums && !updatedOptions.bass && !updatedOptions.other) {
            return {
              ...updatedOptions,
              separationType: 'vocals-instrumental'
            };
          }
          
          return updatedOptions;
        }
      });
    } else {
      // Para hiFiMode u otras opciones
      setSeparationOptions(prev => ({
        ...prev,
        [option]: !prev[option]
      }));
    }
  };

  const waitForSeparationCompletion = async (taskId: string, file: File, user: any) => {
    const maxAttempts = 300; // 15 minutos máximo para Railway
    const estimatedTimeSeconds = 240; // 4 minutos estimados
    const startTime = Date.now();
    const maxTransientErrors = 8;
    let transientErrors = 0;
    
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      try {
        // Usar el proxy de Next.js en vez de ir directo al backend
        const statusResponse = await fetch(`/api/status/${taskId}`);
        if (!statusResponse.ok) {
          throw new Error(`status_http_${statusResponse.status}`);
        }
        const statusResult = await statusResponse.json();
        transientErrors = 0;

        if (statusResult.status === 'queued') {
          const pos = statusResult.queue_position || 1;
          const isRealQueue = statusResult.is_real_queue || (pos > 1);
          
          setQueuePosition(pos);
          setIsQueued(true);
          
          // Solo mostrar el popup si realmente hay una cola esperando (más de 2 activos)
          if (isRealQueue) {
            setShowQueuePopup(true);
          }
          
          setUploadMessage(`Tu separación está en cola. Posición: ${pos}`);
          setUploadProgress(5);
          
          console.log(`[QUEUE] Tarea ${taskId} en cola. Posición ${pos}`);
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }

        // Si ya no está en cola pero antes lo estaba
        if (isQueued && statusResult.status !== 'queued') {
          setIsQueued(false);
          setShowQueuePopup(false);
          console.log(`[QUEUE] Tarea ${taskId} salió de la cola.`);
        }

        // Calcular progreso estimado basado en tiempo transcurrido
        const elapsedSeconds = (Date.now() - startTime) / 1000;
        const timeBasedProgress = 10 + Math.min((elapsedSeconds / estimatedTimeSeconds) * 80, 80); // 10% → 90% en 4 min
        
        // Usar el progreso estimado, pero nunca superar el 90% hasta que el backend confirme
        let displayProgress = Math.min(Math.floor(timeBasedProgress), 90);
        
        // Solo pasar del 90% cuando el backend realmente complete
        const backendProgress = statusResult.progress || 0;
        if (backendProgress >= 95) {
          displayProgress = backendProgress; // 95%, 100%
        }
        
        setUploadProgress(displayProgress);
        setUploadMessage(`Procesando con IA... ${displayProgress}% (${Math.floor(elapsedSeconds)}s)`);

        console.log(`[POLLING] Attempt ${attempts + 1}/${maxAttempts} - Display: ${displayProgress}% - Backend: ${backendProgress}% - Time: ${Math.floor(elapsedSeconds)}s - Status:`, statusResult);

        if (statusResult.status === 'completed') {
          console.log('[COMPLETED] Processing completed! Saving to Firestore...');
          setUploadMessage('Guardando metadata en base de datos...');
          setUploadProgress(95);

          // Calcular duración del audio
          let audioDuration = { duration: '0:00', durationSeconds: 0 };
          try {
            audioDuration = await getAudioDuration(file);
            console.log(`✅ Duración calculada: ${audioDuration.duration} (${audioDuration.durationSeconds}s)`);
          } catch (error) {
            console.warn('⚠️ No se pudo calcular la duración:', error);
          }

          // Usar valores del backend
          let calculatedKey = statusResult.key || 'E';
          let calculatedTimeSignature = statusResult.timeSignature || '4/4';

          console.log('[FIRESTORE] Preparing song data...');
          
          // Guardar en Firestore
          const songData = {
            title: file.name.replace(/\.[^/.]+$/, ""), // Sin extensión
            artist: user.displayName || 'Usuario',
            genre: 'Unknown',
            bpm: statusResult.bpm || 126,
            key: calculatedKey,
            duration: audioDuration.duration,
            durationSeconds: audioDuration.durationSeconds,
            timeSignature: calculatedTimeSignature,
            album: '',
            thumbnail: '',
            fileUrl: statusResult.stems?.original || `${getBackendUrl()}/audio/${taskId}/original.mp3`,
            uploadedAt: new Date().toISOString(),
            userId: user.uid,
            userEmail: user.email || '',
            fileSize: file.size,
            fileName: file.name,
            status: 'completed' as const,
            stems: statusResult.stems || {
              vocals: `${getBackendUrl()}/audio/${taskId}/vocals.wav`,
              drums: `${getBackendUrl()}/audio/${taskId}/drums.wav`,
              bass: `${getBackendUrl()}/audio/${taskId}/bass.wav`,
              other: `${getBackendUrl()}/audio/${taskId}/other.wav`
            },
            separationTaskId: taskId,
            chords: statusResult.chords || [],
            keyInfo: statusResult.keyInfo || null
          };

          console.log('[FIRESTORE] About to save song...');
          const firestoreSongId = await saveSong(songData);
          console.log('[FIRESTORE] Song saved successfully! ID:', firestoreSongId);
          try {
            const refreshedUsage = await getCurrentMonthProcessedSeconds(user.uid);
            setMonthlyUsedSeconds(refreshedUsage);
          } catch (error) {
            console.warn('No se pudo refrescar consumo mensual:', error);
          }

          setUploadProgress(100);
          setUploadMessage('¡Separación completada exitosamente! 💾 Pre-cacheando en Disco...');
          
          // ==========================================
          // GHOST PREFETCH FOR ZERO-LATENCY PLAYBACK
          // ==========================================
          try {
            console.log('[PREFETCH] Iniciando descarga fantasma hacia Memoria Caché...');
            const cache = await caches.open('moises-audio-cache');
            
            // Extraer URLs
            const stemUrls = Object.values(statusResult.stems || {});
            
            // Loop para descargar e inyectar al disco
            const prefetchPromises = stemUrls.map(async (url: any) => {
              if (typeof url !== 'string') return;
              
              // Proxy Next → FastAPI o B2; si el proxy falla (p. ej. Python caído en Railway), B2 directo
              let proxyUrl = url;
              const stem = stemPathFromB2PublicUrl(url);
              if (stem) {
                proxyUrl = toBackendAudioProxyUrl(stem);
              }
              
              // Revisar si ya está en caché
              const cachedResponse = await cache.match(proxyUrl);
              if (!cachedResponse) {
                 console.log(`[PREFETCH] 👻 Descargando stem al disco: ${proxyUrl.split('/').pop()}`);
                 let response = await fetch(proxyUrl);
                 if (!response.ok && stem) {
                   response = await fetch(url);
                 }
                 if (response.ok) {
                    await cache.put(proxyUrl, response.clone());
                 }
              }
            });
            
            // Esperar paciente a que todos bajen antes de abrir el Mixer (Asegura Cero latencia real)
            await Promise.all(prefetchPromises);
            console.log('[PREFETCH] ✨ Todos los Stems pre-descargados exitosamente en Caché.');
            
          } catch(err) {
            console.error('[PREFETCH] Error bajando fantasmas (no crítico):', err);
          }

          console.log('[COMPLETE] Setting progress to 100%');

          // Determinar número de tracks
          const trackCount = Object.keys(statusResult.stems || {}).length || 2;
          setCompletedTrackCount(trackCount);

          // Notificar al componente padre
          if (onUploadComplete) {
            const completeData = {
              ...songData,
              id: firestoreSongId
            };
            console.log('[CALLBACK] Calling onUploadComplete with:', completeData);
            onUploadComplete(completeData);
          } else {
            console.log('[WARNING] No onUploadComplete callback provided');
          }

          console.log('[COMPLETE] Scheduling cleanup...');
          
          // Mostrar popup de éxito
          setShowSuccessPopup(true);
          
          // Reset después de mostrar el popup
          setTimeout(() => {
            console.log('[CLEANUP] Resetting upload state');
            setIsUploading(false);
            setUploadProgress(0);
            setUploadMessage('');
            setUploadedFile(null);
          }, 1000);
          
          // Salir del loop cuando termine exitosamente
          return;

        } else if (statusResult.status === 'failed') {
          const backendError = statusResult.error || 'Error desconocido';
          throw new Error(buildUserFriendlySeparationError(backendError));
        }
        
        // Esperar antes del siguiente intento (polling normal)
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        const rawError = error instanceof Error ? error.message : 'Error desconocido';
        const lower = rawError.toLowerCase();
        const isTransient =
          lower.includes('network') ||
          lower.includes('failed to fetch') ||
          lower.includes('timeout') ||
          lower.startsWith('status_http_5') ||
          lower.startsWith('status_http_429') ||
          lower.startsWith('status_http_404');

        if (isTransient && transientErrors < maxTransientErrors) {
          transientErrors += 1;
          const backoffMs = Math.min(15000, 2000 * Math.pow(2, transientErrors - 1));
          console.warn(
            `[POLLING] Transient error ${transientErrors}/${maxTransientErrors}: ${rawError}. Reintentando en ${backoffMs}ms`
          );
          setUploadMessage(
            `Reconectando con el motor de IA... intento ${transientErrors}/${maxTransientErrors}`
          );
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        console.error('Error polling status:', error);
        setUploadMessage(`❌ ${buildUserFriendlySeparationError(rawError)}`);
        setIsUploading(false);
        setUploadProgress(0);
        throw error;
      }
    }
    
    // Si llegamos aquí, se acabó el tiempo
    throw new Error(`Separación tardó demasiado tiempo (${maxAttempts} intentos = ${maxAttempts * 3 / 60} minutos)`);
  };

  return (
    <div className="mx-auto w-full max-w-4xl rounded-lg border border-slate-700 bg-slate-950 p-3 shadow-xl sm:p-4">

      <div className="grid gap-3 md:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <div className="rounded-md border border-slate-700 bg-slate-900 p-2.5 text-xs text-zinc-200 sm:p-3">
            <p className="font-semibold text-white">
              Plan actual: {planLimits.displayName}
            </p>
            <p className="mt-1 text-zinc-300">
              {monthlyLimitSeconds === null
                ? 'Minutos relajados ilimitados.'
                : usageLoading
                  ? 'Calculando consumo mensual...'
                  : `${usedMinutes.toFixed(1)} / ${planLimits.includedMinutesMonthly} min usados este mes (${remainingMinutes?.toFixed(1)} min disponibles)`}
            </p>
            <p className="mt-1 text-zinc-400">
              Limite por archivo: {(planLimits.maxUploadBytes / (1024 * 1024)).toFixed(0)}MB
              {!planLimits.requiresCard ? ' · sin tarjeta' : ''}
            </p>
            {currentPlanId === 'starter' && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href="/login?plan=lite&billing=yearly"
                  className="rounded bg-amber-300 px-2.5 py-1 font-semibold text-black"
                >
                  Upgrade a Lite
                </a>
                <a
                  href="/login?plan=pro&billing=yearly"
                  className="rounded bg-violet-400 px-2.5 py-1 font-semibold text-black"
                >
                  Upgrade a Pro
                </a>
              </div>
            )}
          </div>

          {/* Status Indicators */}
          <div className="flex items-center justify-start gap-1.5">
            {/* Python Server Status */}
            <div className="flex items-center space-x-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
              <span className={`text-xs font-bold ${pythonServerOnline ? 'text-blue-400' : 'text-gray-500'}`}>P</span>
              <div className={`w-2 h-2 rounded-full transition-all ${
                pythonServerOnline
                  ? 'bg-blue-500 shadow-lg shadow-blue-500/50 animate-pulse'
                  : 'bg-gray-600'
              }`}></div>
            </div>

            {/* B2 Proxy Status */}
            <div className="flex items-center space-x-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
              <span className={`text-xs font-bold ${b2ProxyOnline ? 'text-cyan-400' : 'text-gray-500'}`}>B2</span>
              <div className={`w-2 h-2 rounded-full transition-all ${
                b2ProxyOnline
                  ? 'bg-cyan-500 shadow-lg shadow-cyan-500/50 animate-pulse'
                  : 'bg-gray-600'
              }`}></div>
            </div>

            {/* Demucs Working Status */}
            <div className="flex items-center space-x-1.5 rounded-md border border-slate-700 bg-slate-900 px-2 py-1">
              <span className={`text-xs font-bold ${demucsWorking ? 'text-green-400' : 'text-gray-500'}`}>D</span>
              <div className={`w-2 h-2 rounded-full transition-all ${
                demucsWorking
                  ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                  : 'bg-gray-600'
              }`}></div>
            </div>
          </div>

          {/* File Upload */}
          <div className="rounded-md border border-slate-700 bg-slate-900 p-2.5 sm:p-3">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-300">
              Seleccionar Archivo de Audio
            </label>
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              className="mobile-touch-target file:mobile-touch-target w-full rounded-md border border-slate-600 bg-slate-950 px-2.5 py-2 text-sm text-white file:mr-2.5 file:rounded file:border file:border-slate-500 file:bg-slate-800 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-zinc-100 hover:file:bg-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              disabled={isUploading}
            />
            {uploadedFile && (
              <div className="mt-2 rounded-md border border-emerald-700 bg-emerald-950/40 p-2">
                <p className="text-xs text-emerald-200">
                  <strong>Archivo:</strong> {uploadedFile.name}
                </p>
                <p className="text-xs text-emerald-300">
                  <strong>Tamaño:</strong> {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {/* Separation Options */}
          <div className="rounded-md border border-slate-700 bg-slate-900 p-2.5 sm:p-3">
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-300">
            Opciones de Separación
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {/* Botón Rápido Voz + Pista */}
            <button
              onClick={() => {
                // Si ya está seleccionado, deseleccionar
                if (separationOptions.separationType === 'vocals-instrumental') {
                  setSeparationOptions(prev => ({
                    ...prev,
                    separationType: 'vocals-instrumental',
                    vocals: false,
                    drums: false,
                    bass: false,
                    other: false
                  }));
                } else {
                  // Configurar automáticamente para separación de voz + instrumental con Spleeter
                  // y desactivar todos los tracks individuales
                  setSeparationOptions(prev => ({
                    ...prev,
                    separationType: 'vocals-instrumental',
                    vocals: false,
                    drums: false,
                    bass: false,
                    other: false
                  }));
                }
              }}
              disabled={isUploading}
              className={`col-span-2 mobile-touch-target relative w-full overflow-hidden rounded-md border p-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                isUploading
                  ? 'cursor-not-allowed border-slate-600 bg-slate-800 text-gray-500'
                  : separationOptions.separationType === 'vocals-instrumental'
                    ? 'border-emerald-500 bg-emerald-900/40 text-white'
                    : 'border-slate-600 bg-slate-950 text-white hover:border-slate-500'
              }`}
            >
              🎤 Voz + Pista
              <div className={`w-4 h-2 rounded transition-colors absolute top-2 right-2 ${
                separationOptions.separationType === 'vocals-instrumental'
                  ? 'bg-emerald-400' 
                  : 'bg-gray-500'
              }`}></div>
            </button>
            
            {[
              { key: 'vocals', label: '🎤 Vocals', description: 'Voces principales' },
              { key: 'drums', label: '🥁 Drums', description: 'Batería y percusión' },
              { key: 'bass', label: '🎸 Bass', description: 'Línea de bajo' },
              { key: 'guitar', label: '🎸 Guitar', description: 'Guitarras limpias' },
              { key: 'piano', label: '🎹 Piano', description: 'Teclados y pianos' },
              { key: 'other', label: '🔮 Other', description: 'Sintetizadores, pads' }
            ].map(({ key, label, description }) => (
             <button
               key={key}
               onClick={() => handleOptionChange(key as keyof SeparationOptions)}
                 disabled={isUploading || !isPremium}
               className={`mobile-touch-target relative overflow-hidden rounded-md border p-2 text-left text-sm transition-all duration-200 ${
                 !isPremium ? 'cursor-not-allowed border-slate-700 bg-slate-800 opacity-60' :
                 separationOptions[key as keyof SeparationOptions]
                  ? 'border-blue-500 bg-blue-900/35 text-white'
                   : 'border-slate-600 bg-slate-950 text-white hover:border-slate-500'
               }`}
             >
               <div className={`w-4 h-2 rounded transition-colors absolute top-2 right-2 ${
                 separationOptions[key as keyof SeparationOptions] 
                  ? 'bg-blue-400' 
                   : 'bg-gray-500'
               }`}></div>
               <div>
                 <div className="font-medium text-sm flex items-center justify-between">
                   {label}
                   {!isPremium && <span className="text-[10px] text-yellow-500 font-bold ml-1 border border-yellow-500 rounded px-1">PRO</span>}
                 </div>
                 <div className="text-xs opacity-75">{description}</div>
               </div>
             </button>
            ))}
          </div>
          </div>

          {/* Hi-Fi Mode */}
          <div className="rounded-md border border-slate-700 bg-slate-900 p-2.5 sm:p-3">
           <button
             onClick={() => handleOptionChange('hiFiMode')}
                disabled={isUploading || !isPremium}
             className={`mobile-touch-target relative w-full overflow-hidden rounded-md border p-2.5 text-left text-sm transition-all duration-200 ${
               !isPremium ? 'cursor-not-allowed border-slate-700 bg-slate-800 opacity-60' :
               separationOptions.hiFiMode
                 ? 'border-amber-500 bg-amber-900/30 text-white'
                 : 'border-slate-600 bg-slate-950 text-white hover:border-slate-500'
             }`}
           >
             <div className={`w-4 h-2 rounded transition-colors absolute top-2 right-2 ${
               separationOptions.hiFiMode ? 'bg-amber-400' : 'bg-gray-500'
             }`}></div>
             <div className="flex items-center justify-between">
               <div>
                 <div className="font-medium text-sm flex items-center gap-1.5">
                   ✨ Modo Hi-Fi
                   {!isPremium && <span className="text-[10px] text-yellow-500 font-bold border border-yellow-500 rounded px-1">PRO</span>}
                   {separationOptions.hiFiMode && isPremium && <span className="text-[10px] text-black bg-yellow-400 font-bold rounded px-1">ACTIVO</span>}
                 </div>
                 <div className="text-[10px] opacity-70 mt-0.5">Motor MDX-Net Espectral · Pistas Puras a 24-bit</div>
               </div>
             </div>
           </button>
          </div>

          {/* Upload Button / Progress Bar */}
          {isUploading ? (
            <div className="space-y-3">
            {/* Barra de progreso mejorada */}
            <div className="w-full bg-gray-800 h-6 relative overflow-hidden rounded-lg border border-gray-600">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out flex items-center justify-center animate-pulse"
                style={{ width: `${Math.max(uploadProgress, 20)}%` }}
              >
                <span className="text-white font-bold text-sm drop-shadow-lg">
                  {Math.max(uploadProgress, 20).toFixed(0)}%
                </span>
              </div>
              {/* Efecto de brillo que se mueve */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
            
            {/* Mensaje de estado */}
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                <div className="w-3 h-3 bg-purple-500 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                <div className="w-3 h-3 bg-pink-500 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
              </div>
              <p className="text-white font-medium text-base animate-pulse">
                {uploadMessage || 'Procesando...'}
              </p>
              {separationOptions.hiFiMode && (
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-[11px] bg-yellow-500 text-black font-bold px-2 py-0.5 rounded">✨ HI-FI ACTIVO</span>
                  <span className="text-[10px] text-yellow-400">MDX-Net Espectral · 24-bit</span>
                </div>
              )}
              
              {/* Contador de tiempo */}
              <div className="text-blue-400 text-xl font-bold">
                ⏱️ {formatElapsedTime(elapsedTime)}
              </div>
              
              <p className="text-gray-400 text-xs">
                ⏱️ No te preocupes, esto puede tardar varios minutos
              </p>
              <p className="text-gray-500 text-xs">
                🔄 Estamos separando tu audio con IA...
              </p>
            </div>
            </div>
          ) : (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className={`mobile-touch-target w-full rounded-md border px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 ${
                isUploading
                  ? 'cursor-not-allowed border-slate-600 bg-slate-800'
                  : 'border-blue-600 bg-blue-600 hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40'
              }`}
            >
              Separar Tracks
            </button>
          )}
        </div>
      </div>

      {/* Popup para cuando no hay archivo */}
      {showNoFilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-4">
          <div className="bg-black bg-gradient-to-b from-white/15 via-white/8 to-transparent border border-white/20 p-5 md:p-6 max-w-md w-full shadow-lg overflow-hidden">
            <div className="text-center">
              <h3 className="text-white text-lg font-semibold mb-4">
                Para separar los tracks...
              </h3>
              <p className="text-gray-300 mb-6">
                Primero sube una canción Bro
              </p>
              <button
                onClick={() => setShowNoFilePopup(false)}
                className="mobile-touch-target bg-black border border-white/20 bg-gradient-to-b from-white/10 via-white/5 to-transparent hover:from-white/15 hover:via-white/8 text-white px-6 py-2 transition-all duration-300 shadow-lg overflow-hidden"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Popup Modal */}
      {showQueuePopup && isQueued && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Background Accent */}
            <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl"></div>
            
            <button 
              onClick={() => setShowQueuePopup(false)}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="mb-4 relative">
                <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl animate-pulse"></div>
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 border border-blue-500/30">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
              </div>

              <h3 className="mb-2 text-xl font-bold text-white">Separación en Cola</h3>
              <p className="mb-6 text-sm text-slate-400 leading-relaxed">
                Tu separación está en cola por alta demanda de nuestro motor de IA. 
                La procesaremos automáticamente en cuanto haya un espacio disponible.
              </p>

              <div className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800/50 p-4 mb-6">
                <div className="text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Estado Actual</span>
                  <span className="text-sm font-semibold text-blue-400">Esperando en cola</span>
                </div>
                <div className="h-8 w-[1px] bg-slate-700"></div>
                <div className="text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Posición</span>
                  <span className="text-lg font-bold text-white">#{queuePosition}</span>
                </div>
              </div>

              <button
                onClick={() => setShowQueuePopup(false)}
                className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white transition-all hover:bg-blue-500 active:scale-95 shadow-lg shadow-blue-600/20"
              >
                Entendido, seguiré esperando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Wave Popup */}
      <SuccessWavePopup 
        isOpen={showSuccessPopup} 
        onClose={() => setShowSuccessPopup(false)}
        trackCount={completedTrackCount}
      />
    </div>
  );
};

export default MoisesStyleUpload;