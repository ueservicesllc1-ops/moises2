/**
 * NewSongUpload - Componente para subir canciones nuevas a la nube
 */

import React, { useState } from 'react';
import { X, Upload, Music, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { saveSong } from '@/lib/firestore';
import realB2Service from '@/lib/realB2Service';
import AudioSeparationModal from './AudioSeparationModal';

interface NewSongUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: (songData: any) => void;
  onOpenMixer?: (songId: string) => void;
}

interface SeparationOptions {
  type: 'basic' | 'custom';
  basicType?: 'vocals-instrumental' | 'vocals-drums-bass-other';
  customTracks: {
    vocals: boolean;
    guitar: boolean;
    bass: boolean;
    drums: boolean;
  };
  hiFiMode: boolean;
}

const NewSongUpload: React.FC<NewSongUploadProps> = ({ isOpen, onClose, onUploadComplete, onOpenMixer }) => {
  const { user } = useAuth();
  const [songTitle, setSongTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSeparationModal, setShowSeparationModal] = useState(false);
  const [separationOptions, setSeparationOptions] = useState<SeparationOptions | null>(null);
  const [uploadedSongData, setUploadedSongData] = useState<any>(null);
  // const [showAudioEditor, setShowAudioEditor] = useState(false); // REMOVED
  const [isProcessingSeparation, setIsProcessingSeparation] = useState(false);
  const [separationProgress, setSeparationProgress] = useState(0);
  const [separationMessage, setSeparationMessage] = useState('');

  const saveSeparatedSongToCloud = async (statusResult: any, songData: any, taskId: string) => {
    try {
      console.log('☁️ Saving separated song to B2 and Firestore...');
      
      // Subir archivo original a B2 (si no está ya)
      const uploadProgressCallback = (progress: any) => {
        console.log('Progreso de subida original:', progress.progress);
      };

      const uploadResult = await realB2Service.uploadAudioFile(
        selectedFile!,
        user!.uid,
        uploadProgressCallback,
        songData.id,
        selectedFile!.name
      );
      
      const downloadUrl = typeof uploadResult === 'string' ? uploadResult : (uploadResult as any).downloadUrl || uploadResult;
      console.log('✅ Archivo original subido a B2:', downloadUrl);
      
      // Guardar información en Firestore
      const song = {
        title: songData.title,
        artist: songData.artist,
        genre: '',
        bpm: statusResult.bpm || 0,
        key: statusResult.key || '',
        duration: statusResult.duration || '0:00',
        durationSeconds: 0,
        timeSignature: statusResult.timeSignature || '4/4',
        year: undefined,
        album: '',
        track: undefined,
        thumbnail: '🎵',
        fileUrl: downloadUrl,
        uploadedAt: new Date().toISOString(),
        userId: user!.uid,
        fileSize: songData.fileSize,
        fileName: songData.fileName,
        status: 'uploaded' as const,
        stems: statusResult.stems || {},
        separationTaskId: taskId
      };

      const firestoreSongId = await saveSong(song);
      console.log('✅ Información guardada en Firestore con ID:', firestoreSongId);
      
      // Actualizar songData con las pistas reales separadas
      const updatedSongData = {
        ...songData,
        stems: statusResult.stems || {
          vocals: statusResult.vocals_url,
          instrumental: statusResult.instrumental_url,
          drums: statusResult.drums_url,
          bass: statusResult.bass_url,
          other: statusResult.other_url
        },
        bpm: statusResult.bpm || 126,
        key: statusResult.key || 'E',
        timeSignature: statusResult.timeSignature || '4/4',
        duration: statusResult.duration || '5:00',
        separationTaskId: taskId,
        b2Url: downloadUrl,
        firestoreId: firestoreSongId
      };
      
      // Actualizar los datos de la canción
      setUploadedSongData(updatedSongData);
      
      // Cerrar modal de separación y mostrar editor
      setIsProcessingSeparation(false);
      setShowSeparationModal(false);
      // setShowAudioEditor(true); // REMOVED
      
    } catch (error) {
      console.error('❌ Error saving to cloud:', error);
      setIsProcessingSeparation(false);
      alert(`❌ Error saving to cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const pollSeparationStatus = async (taskId: string, songData: any) => {
    const maxAttempts = 120; // 120 intentos máximo (2 minutos para Demucs)
    let attempts = 0;
    
    const poll = async () => {
      try {
        const statusResponse = await fetch(`http://localhost:8000/status/${taskId}`);
        const statusResult = await statusResponse.json();
        
        console.log(`🔄 Separation status (attempt ${attempts + 1}):`, statusResult);
        
        // Actualizar progreso y mensaje
        setSeparationProgress(statusResult.progress || 0);
        if (statusResult.progress) {
          if (statusResult.progress < 20) {
            setSeparationMessage('Iniciando separación...');
          } else if (statusResult.progress < 40) {
            setSeparationMessage('Iniciando Demucs AI...');
          } else if (statusResult.progress < 70) {
            setSeparationMessage('Procesando con Demucs AI...');
          } else if (statusResult.progress < 85) {
            setSeparationMessage('Demucs completado, procesando archivos...');
          } else if (statusResult.progress < 95) {
            setSeparationMessage('Subiendo archivos a la nube...');
          } else {
            setSeparationMessage('¡Casi listo!');
          }
        }
        
        if (statusResult.status === 'completed') {
          console.log('✅ REAL Audio separation completed!');
          
          // Ahora subir las pistas separadas a B2 y guardar en Firestore
          await saveSeparatedSongToCloud(statusResult, songData, taskId);
          
          // Retornar éxito para abrir el mixer
          return { success: true, taskId, stems: statusResult.stems };
          
        } else if (statusResult.status === 'failed') {
          throw new Error('Audio separation failed');
        } else if (attempts < maxAttempts) {
          // Continuar polling
          attempts++;
          setTimeout(poll, 1000); // Poll cada segundo
        } else {
          throw new Error('Audio separation timeout');
        }
        
      } catch (error) {
        console.error('❌ Error polling separation status:', error);
        setIsProcessingSeparation(false);
        throw error;
      }
    };
    
    return await poll();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validar tipo de archivo
      const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac', 'audio/ogg'];
      if (!allowedTypes.includes(file.type)) {
        alert('Por favor selecciona un archivo de audio válido (MP3, WAV, M4A, AAC, OGG)');
        return;
      }
      
      // Validar tamaño (máximo 100MB)
      if (file.size > 100 * 1024 * 1024) {
        alert('El archivo es demasiado grande. Máximo 100MB.');
        return;
      }
      
      setSelectedFile(file);
      console.log('Archivo seleccionado:', file.name, file.size, 'bytes');
      
      // Auto-cargar datos del archivo
      const fileName = file.name;
      const parsedData = parseFileName(fileName);
      
      // Siempre cargar el título, y el artista si está disponible
      setSongTitle(parsedData.title);
      if (parsedData.artist) {
        setArtistName(parsedData.artist);
      }
      console.log('Datos auto-cargados:', parsedData);
    }
  };

  // Función para parsear el nombre del archivo y extraer artista y título
  const parseFileName = (fileName: string) => {
    // Remover extensión
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    
    // Patrones comunes de nombres de archivos de música
    const patterns = [
      // "Artista - Título" o "Artista - Título (Año)"
      /^(.+?)\s*-\s*(.+?)(?:\s*\([0-9]{4}\))?$/,
      // "Título - Artista"
      /^(.+?)\s*-\s*(.+?)$/,
      // "Artista_Título" o "Artista_Título (Año)"
      /^(.+?)_(.+?)(?:\s*\([0-9]{4}\))?$/,
      // Solo título (sin separador)
      /^(.+)$/
    ];
    
    for (const pattern of patterns) {
      const match = nameWithoutExt.match(pattern);
      if (match) {
        if (pattern === patterns[3]) {
          // Solo título encontrado
          return {
            artist: '',
            title: match[1].trim()
          };
        } else {
          // Artista y título encontrados
          return {
            artist: match[1].trim(),
            title: match[2].trim()
          };
        }
      }
    }
    
    // Si no coincide con ningún patrón, usar el nombre completo como título
    return {
      artist: '',
      title: nameWithoutExt
    };
  };

  const handleSeparationOptions = async (options: SeparationOptions) => {
    setSeparationOptions(options);
    console.log('Separation options selected:', options);
    
    // Aquí procesaremos la separación con el archivo ya subido
    if (uploadedSongData) {
      await processAudioSeparation(uploadedSongData, options);
    }
  };

  const processAudioSeparation = async (songData: any, options: SeparationOptions) => {
    try {
      console.log('🎵 Starting REAL audio separation for:', songData);
      console.log('🎛️ Separation options:', options);
      
      setIsProcessingSeparation(true);
      
      // Crear FormData para enviar archivo directo
      const formData = new FormData();
      if (selectedFile) {
        formData.append('file', selectedFile);
      }
      formData.append('separation_type', options.basicType || 'vocals-instrumental');
      formData.append('separation_options', JSON.stringify(options.customTracks || {}));
      formData.append('hi_fi', options.hiFiMode.toString());
      formData.append('song_id', songData.id);
      formData.append('user_id', user?.uid || '');
      
      // Llamar al backend REAL para separación directa
      const separationResponse = await fetch('http://localhost:8000/separate', {
        method: 'POST',
        body: formData
      });
      
      if (!separationResponse.ok) {
        throw new Error(`Backend error: ${separationResponse.status}`);
      }
      
      const separationResult = await separationResponse.json();
      console.log('✅ REAL Audio separation started:', separationResult);
      
      // Polling para verificar el estado de la separación
      const taskId = separationResult.task_id;
      const result = await pollSeparationStatus(taskId, songData);
      
      // Si la separación fue exitosa, abrir el mixer automáticamente
      if (result && typeof result === 'object' && 'success' in result) {
        console.log('🎵 Opening mixer automatically after successful separation');
        // Limpiar estados de progreso
        setIsProcessingSeparation(false);
        setSeparationProgress(0);
        setSeparationMessage('');
        // Buscar la canción en la lista y abrir el mixer
        const songId = songData.id;
        if (onOpenMixer) {
          onOpenMixer(songId);
        }
      }
      
    } catch (error) {
      console.error('❌ Error processing REAL audio separation:', error);
      setIsProcessingSeparation(false);
      setSeparationProgress(0);
      setSeparationMessage('');
      
      // Fallback a simulación si el backend falla
      console.log('🔄 Falling back to simulation...');
      setTimeout(() => {
        console.log('✅ Simulated audio separation completed!');
        
        const editorData = {
          ...songData,
          stems: {
            vocals: `${songData.b2Url}_vocals.wav`,
            drums: `${songData.b2Url}_drums.wav`,
            bass: `${songData.b2Url}_bass.wav`,
            other: `${songData.b2Url}_other.wav`
          },
          bpm: 126,
          key: 'E',
          timeSignature: '4/4',
          duration: '5:00'
        };
        
        setUploadedSongData(editorData);
        setIsProcessingSeparation(false);
        setShowSeparationModal(false);
        // setShowAudioEditor(true); // REMOVED
      }, 2000);
      
      alert(`⚠️ Backend no disponible, usando simulación. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleUploadSong = async () => {
    try {
      if (!songTitle || !artistName || !selectedFile) {
        alert('Por favor completa todos los campos y selecciona un archivo');
        return;
      }

      if (!user?.uid) {
        alert('Debes estar autenticado para subir a la nube');
        return;
      }

      // Generar ID único para la canción
      const songId = `newsong_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log(`🎵 Preparando nueva canción: ${artistName} - ${songTitle}`);
      console.log(`📁 Archivo: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`🆔 ID de canción: ${songId}`);
      
      // Datos básicos de la canción (sin subir a B2 aún)
      const songData = {
        id: songId,
        songId: songId,
        title: songTitle,
        artist: artistName,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        uploadDate: new Date().toLocaleString(),
        userId: user.uid,
        status: 'pending_separation' // Estado pendiente de separación
      };
      
      // Guardar datos de la canción para la separación
      setUploadedSongData(songData);
      
      // Mostrar modal de separación directamente (sin subir a B2 primero)
      console.log('✅ Song prepared, showing separation modal');
      setShowSeparationModal(true);
      
    } catch (error) {
      console.error('❌ Error preparando nueva canción:', error);
      alert(`❌ Error al preparar la canción: ${error instanceof Error ? error.message : 'Error desconocido'}`);
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSongTitle('');
      setArtistName('');
      setSelectedFile(null);
      setUploadProgress(0);
      setShowSeparationModal(false);
      setSeparationOptions(null);
      setUploadedSongData(null);
      // setShowAudioEditor(false); // REMOVED
      setIsProcessingSeparation(false);
      onClose();
    }
  };

  // const handleEditorClose = () => { // REMOVED
  //   setShowAudioEditor(false);
  //   
  //   // Llamar callback si existe para actualizar la lista de canciones
  //   if (onUploadComplete && uploadedSongData) {
  //     onUploadComplete(uploadedSongData);
  //   }
  //   
  //   // Limpiar y cerrar todo
  //   handleClose();
  // };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-2">
            <Music className="h-6 w-6 text-primary-400" />
            <h2 className="text-xl font-bold text-white">🎵 Nueva Canción</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="text-gray-400 hover:text-white text-2xl disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-white font-bold mb-2">🎤 Nombre del Artista:</label>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              disabled={isUploading}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-primary-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          
          <div>
            <label className="block text-white font-bold mb-2">🎶 Título de la Canción:</label>
            <input
              type="text"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              placeholder="Ej: Mi Nueva Canción"
              disabled={isUploading}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-primary-500 focus:outline-none disabled:opacity-50"
            />
          </div>
          
          <div>
            <label className="block text-white font-bold mb-2">📁 Archivo de Audio:</label>
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.aac,.ogg"
              onChange={handleFileSelect}
              disabled={isUploading}
              className="w-full bg-gray-700 text-white p-3 rounded-lg border border-gray-600 focus:border-primary-500 focus:outline-none disabled:opacity-50"
            />
            {selectedFile && (
              <div className="mt-2 space-y-1">
                <p className="text-green-400 text-sm">
                  ✅ Archivo seleccionado: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                </p>
                {(songTitle || artistName) && (
                  <p className="text-blue-400 text-sm">
                    🔄 Datos auto-cargados del nombre del archivo
                  </p>
                )}
              </div>
            )}
          </div>

          {isUploading && (
            <div className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-white text-sm font-medium">Subiendo...</span>
                <span className="text-white text-sm">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-600 rounded-full h-2">
                <div 
                  className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}
          

          <button
            onClick={handleUploadSong}
            disabled={!songTitle || !artistName || !selectedFile}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
          >
            <Music className="h-4 w-4" />
            <span>🤖 Procesar con IA</span>
          </button>

          <div className="text-xs text-gray-400 text-center space-y-1">
            <div>🤖 El archivo se procesará con IA para separar las pistas automáticamente</div>
            <div className="text-gray-500">
              💡 <strong>Tip:</strong> Nombra tu archivo como "Artista - Título" para auto-cargar los datos
              <br />Ejemplos: "Juan Pérez - Mi Canción.mp3" o "Banda - Rock Song (2024).wav"
            </div>
          </div>
        </div>

        {/* Progress Bar for Separation */}
        {isProcessingSeparation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-dark-800 rounded-lg p-6 w-full max-w-md mx-4">
              <div className="text-center">
                <div className="flex items-center justify-center mb-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400"></div>
                  <span className="ml-3 text-white text-lg font-semibold">🎵 Procesando Audio</span>
                </div>
                
                <div className="mb-4">
                  <div className="text-white text-sm mb-2">{separationMessage}</div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-primary-500 to-primary-400 h-3 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${separationProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-gray-300 text-xs mt-2">{separationProgress}%</div>
                </div>
                
                <div className="text-gray-400 text-sm">
                  🤖 Usando Demucs AI para separación de alta calidad
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Audio Separation Modal */}
        <AudioSeparationModal
          isOpen={showSeparationModal && !isProcessingSeparation}
          onClose={() => {
            setShowSeparationModal(false);
            setIsProcessingSeparation(false);
            // Si se cancela la separación, llamar callback y cerrar todo
            if (onUploadComplete && uploadedSongData) {
              onUploadComplete(uploadedSongData);
            }
            handleClose();
          }}
          onSave={handleSeparationOptions}
          songData={uploadedSongData}
          isProcessing={isProcessingSeparation}
        />
      </div>

      {/* Audio Editor - REMOVED */}
    </div>
  );
};

export default NewSongUpload;
