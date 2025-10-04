/**
 * Moises Style Upload Component
 * Arquitectura simplificada estilo Moises:
 * - Solo B2 Storage
 * - URLs consistentes
 * - Sin almacenamiento local
 * - Flujo simplificado
 */

import React, { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { saveSong } from '../lib/firestore';

interface MoisesStyleUploadProps {
  onUploadComplete?: (songData: any) => void;
}

interface SeparationOptions {
  separationType: string; // 'vocals-instrumental', 'vocals-drums-bass-other', 'vocals-chorus-drums-bass-piano'
  hiFiMode: boolean;
}

const MoisesStyleUpload: React.FC<MoisesStyleUploadProps> = ({ onUploadComplete }) => {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [separationOptions, setSeparationOptions] = useState<SeparationOptions>({
    vocals: true,
    instrumental: true,
    drums: false,
    bass: false,
    other: false,
    hiFiMode: false
  });

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setUploadMessage(`Archivo seleccionado: ${file.name}`);
    }
  }, []);

  const getSeparationType = (options: SeparationOptions): string => {
    if (options.vocals && options.instrumental && !options.drums && !options.bass && !options.other) {
      return "vocals-instrumental";
    }
    if (options.vocals && options.drums && options.bass && options.other) {
      return "vocals-drums-bass-other";
    }
    return "vocals-instrumental"; // Default
  };

  const handleUpload = async () => {
    if (!uploadedFile || !user) {
      console.error('❌ No hay archivo o usuario:', { uploadedFile, user });
      return;
    }

    console.log('🚀 Iniciando upload:', {
      fileName: uploadedFile.name,
      fileSize: uploadedFile.size,
      fileType: uploadedFile.type,
      userId: user.uid,
      separationType: getSeparationType(separationOptions),
      hiFi: separationOptions.hiFiMode
    });

    setIsUploading(true);
    setUploadProgress(0);
    setUploadMessage('Iniciando subida estilo Moises...');

    try {
      // Crear FormData
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('separation_type', getSeparationType(separationOptions));
      formData.append('hi_fi', separationOptions.hiFiMode.toString());
      formData.append('user_id', user.uid);

      console.log('📤 FormData creado:', {
        separationType: getSeparationType(separationOptions),
        hiFi: separationOptions.hiFiMode.toString(),
        userId: user.uid
      });

      setUploadMessage('Subiendo archivo a B2 Storage...');
      setUploadProgress(20);

      console.log('🌐 Enviando request a:', 'http://localhost:8000/separate');
      
      // Llamar al backend original que ya tiene CORS configurado
      const response = await fetch('http://localhost:8000/separate', {
        method: 'POST',
        body: formData,
      });

      console.log('📡 Response recibida:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      setUploadProgress(60);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Error del servidor (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ Resultado Moises Style:', result);

      // Siempre usar formato Moises Style
      if (result.success && result.data) {
        setUploadMessage('Guardando metadata en Firestore...');
        setUploadProgress(80);

        // Guardar en Firestore
        const songData = {
          title: uploadedFile.name.replace(/\.[^/.]+$/, ""), // Sin extensión
          artist: user.displayName || 'Usuario',
          genre: 'Unknown',
          bpm: 120, // Default
          key: 'C', // Default
          duration: '0:00', // Se puede calcular después
          durationSeconds: 0,
          timeSignature: '4/4',
          album: '',
          thumbnail: '🎵',
          fileUrl: result.data.original_url,
          uploadedAt: new Date().toISOString(),
          userId: user.uid,
          fileSize: uploadedFile.size,
          fileName: uploadedFile.name,
          status: 'completed' as const,
          stems: result.data.stems,
          separationTaskId: result.data.task_id
        };

        const firestoreSongId = await saveSong(songData);
        console.log('✅ Guardado en Firestore:', firestoreSongId);

        setUploadProgress(100);
        setUploadMessage('¡Separación completada estilo Moises!');

        // Notificar al componente padre
        if (onUploadComplete) {
          onUploadComplete({
            ...songData,
            id: firestoreSongId,
            ...result.data
          });
        }

        // Reset después de un momento
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
          setUploadMessage('');
          setUploadedFile(null);
        }, 2000);

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
      setUploadMessage(`❌ Error: ${errorMessage}`);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleOptionChange = (option: keyof SeparationOptions) => {
    setSeparationOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        🎵 Moises Style Upload
      </h2>
      
      <div className="space-y-6">
        {/* File Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Seleccionar Archivo de Audio
          </label>
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isUploading}
          />
          {uploadedFile && (
            <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800">
                <strong>Archivo:</strong> {uploadedFile.name}
              </p>
              <p className="text-green-600 text-sm">
                <strong>Tamaño:</strong> {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          )}
        </div>

        {/* Separation Options */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Opciones de Separación
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'vocals', label: '🎤 Vocals', description: 'Voces principales' },
              { key: 'instrumental', label: '🎸 Instrumental', description: 'Música sin voces' },
              { key: 'drums', label: '🥁 Drums', description: 'Batería y percusión' },
              { key: 'bass', label: '🎸 Bass', description: 'Línea de bajo' },
              { key: 'other', label: '🎹 Other', description: 'Otros instrumentos' }
            ].map(({ key, label, description }) => (
              <label key={key} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={separationOptions[key as keyof SeparationOptions]}
                  onChange={() => handleOptionChange(key as keyof SeparationOptions)}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={isUploading}
                />
                <div>
                  <div className="font-medium text-gray-900">{label}</div>
                  <div className="text-sm text-gray-500">{description}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Hi-Fi Mode */}
        <div>
          <label className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50">
            <input
              type="checkbox"
              checked={separationOptions.hiFiMode}
              onChange={() => handleOptionChange('hiFiMode')}
              className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={isUploading}
            />
            <div>
              <div className="font-medium text-gray-900">🎚️ Modo Hi-Fi</div>
              <div className="text-sm text-gray-500">Calidad superior (procesamiento más lento)</div>
            </div>
          </label>
        </div>

        {/* Upload Progress */}
        {isUploading && (
          <div className="space-y-3">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="text-center text-sm text-gray-600">{uploadMessage}</p>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={!uploadedFile || isUploading}
          className={`w-full py-3 px-6 rounded-lg font-medium text-white transition-colors ${
            !uploadedFile || isUploading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-200'
          }`}
        >
          {isUploading ? 'Procesando...' : '🚀 Separar Audio Estilo Moises'}
        </button>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-900 mb-2">✨ Arquitectura Moises Style</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Solo B2 Storage:</strong> Archivos almacenados en la nube</li>
            <li>• <strong>URLs Consistentes:</strong> Acceso directo desde cualquier dispositivo</li>
            <li>• <strong>Sin Archivos Locales:</strong> No ocupa espacio en el servidor</li>
            <li>• <strong>Limpieza Automática:</strong> Archivos temporales se eliminan automáticamente</li>
            <li>• <strong>Metadata en Firestore:</strong> Información persistente en base de datos</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MoisesStyleUpload;
