/**
 * WaveSurferDemo - Componente de demostración de WaveSurfer.js
 */

import React, { useState } from 'react';
import WaveSurferPlayer from './WaveSurferPlayer';

const WaveSurferDemo: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState({
    src: '/uploads/0641eb4d-9f9e-4c52-a1a8-914fd0544d2b/original.mp3',
    title: 'Demo Track',
    artist: 'Moises Clone'
  });

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8 text-center">
          WaveSurfer.js Integration Demo
        </h1>
        
        <div className="max-w-4xl mx-auto">
          <div className="bg-gray-800 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Características de WaveSurfer.js</h2>
            <ul className="space-y-2 text-gray-300">
              <li>• Visualización de ondas de audio en tiempo real</li>
              <li>• Controles de reproducción avanzados</li>
              <li>• Sincronización precisa de múltiples pistas</li>
              <li>• Interfaz interactiva para edición</li>
              <li>• Soporte para diferentes formatos de audio</li>
            </ul>
          </div>

          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Reproductor con WaveSurfer</h2>
            <p className="text-gray-300 mb-4">
              Haz clic en el botón de reproducción para escuchar el audio con visualización de ondas.
            </p>
            
            <WaveSurferPlayer
              src={currentTrack.src}
              title={currentTrack.title}
              artist={currentTrack.artist}
              isPlaying={isPlaying}
              onPlay={handlePlay}
              onPause={handlePause}
              height={80}
              waveColor="#3b82f6"
              progressColor="#1d4ed8"
              cursorColor="#1e40af"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaveSurferDemo;
