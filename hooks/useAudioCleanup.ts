/**
 * useAudioCleanup - Hook para limpiar completamente el audio
 */

import { useEffect } from 'react';

export const useAudioCleanup = () => {
  useEffect(() => {
    // Función global para limpiar todo el audio
    const cleanupAllAudio = () => {
      console.log('🛑 LIMPIEZA COMPLETA DE AUDIO');
      
      // Detener todos los elementos de audio
      const allAudioElements = document.querySelectorAll('audio');
      console.log(`🎵 STOPPING ${allAudioElements.length} elementos de audio del DOM`);
      
      allAudioElements.forEach((audio, index) => {
        console.log(`⏹️ STOPPING audio DOM ${index + 1}`);
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
        audio.load();
        audio.removeAttribute('src');
      });
      
      // Detener todos los elementos de video
      const allVideoElements = document.querySelectorAll('video');
      allVideoElements.forEach((video, index) => {
        console.log(`⏹️ STOPPING video DOM ${index + 1}`);
        video.pause();
        video.currentTime = 0;
        video.src = '';
        video.load();
        video.removeAttribute('src');
      });
      
      // Cerrar todos los AudioContext
      try {
        if (window.AudioContext) {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          audioContext.close();
          console.log('🎵 AudioContext CERRADO');
        }
      } catch (e) {
        console.log('Error cerrando AudioContext:', e);
      }
      
      console.log('✅ LIMPIEZA COMPLETA TERMINADA');
    };

    // Exponer función globalmente
    (window as any).stopAllAudio = cleanupAllAudio;
    
    // Limpiar al desmontar
    return () => {
      cleanupAllAudio();
    };
  }, []);
};

export default useAudioCleanup;
