/**
 * SuccessWavePopup - Popup tecnológico con ondas cuando la separación se completa
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle, Zap, Music } from 'lucide-react';

interface SuccessWavePopupProps {
  isOpen: boolean;
  onClose: () => void;
  trackCount?: number;
}

const SuccessWavePopup: React.FC<SuccessWavePopupProps> = ({ 
  isOpen, 
  onClose,
  trackCount = 2 
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isOpen) {
      // Auto-close después de 5 segundos
      const closeTimer = setTimeout(() => {
        onClose();
      }, 5000);

      // Animación de progreso
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) return 100;
          return prev + 2;
        });
      }, 100);

      return () => {
        clearTimeout(closeTimer);
        clearInterval(progressInterval);
        setProgress(0);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn p-2 md:p-4">
      {/* Ondas de fondo animadas */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 opacity-30">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                animation: `wave ${2 + i * 0.5}s ease-out infinite`,
                animationDelay: `${i * 0.3}s`
              }}
            >
              <div 
                className="rounded-full border-2 border-cyan-400"
                style={{
                  width: `${100 + i * 100}px`,
                  height: `${100 + i * 100}px`
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Partículas flotantes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-cyan-400 rounded-full opacity-60"
            style={{
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${Math.random() * 3 + 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`
            }}
          />
        ))}
      </div>

      {/* Contenedor principal */}
      <div className="relative h-[100dvh] md:h-auto overflow-y-auto bg-gradient-to-br from-gray-900 via-gray-800 to-black border-2 border-cyan-500 rounded-2xl p-5 md:p-8 max-w-md w-full mx-0 md:mx-4 shadow-2xl shadow-cyan-500/50 animate-scaleIn">
        
        {/* Efecto de brillo en el borde */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-20 blur-xl animate-pulse" />
        
        {/* Contenido */}
        <div className="relative z-10 text-center space-y-6">
          
          {/* Icono central con animación */}
          <div className="flex justify-center">
            <div className="relative">
              {/* Círculo de fondo pulsante */}
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-xl opacity-60 animate-ping" />
              
              {/* Icono principal */}
              <div className="relative bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full p-6 shadow-lg shadow-cyan-500/50">
                <CheckCircle className="h-16 w-16 text-white animate-bounce" strokeWidth={2.5} />
              </div>
              
              {/* Zaps laterales */}
              <Zap className="absolute -top-2 -right-2 h-8 w-8 text-yellow-400 animate-pulse" />
              <Zap className="absolute -bottom-2 -left-2 h-8 w-8 text-yellow-400 animate-pulse" style={{animationDelay: '0.5s'}} />
            </div>
          </div>

          {/* Texto principal */}
          <div className="space-y-3">
            <h2 className="text-2xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 animate-shimmer">
              ¡Tus Tracks Están Listos!
            </h2>
            
            <div className="flex items-center justify-center space-x-2">
              <Music className="h-5 w-5 text-cyan-400 animate-pulse" />
              <p className="text-base md:text-xl text-gray-300 font-semibold">
                Eres un Pro, Bro
              </p>
              <Music className="h-5 w-5 text-cyan-400 animate-pulse" />
            </div>

            {/* Contador de tracks */}
            <div className="flex items-center justify-center space-x-3 pt-2">
              <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/50 rounded-lg px-4 py-2">
                <span className="text-2xl font-bold text-cyan-400">{trackCount}</span>
                <span className="text-sm text-gray-400 ml-2">tracks separados</span>
              </div>
            </div>
          </div>

          {/* Barra de progreso del auto-close */}
          <div className="space-y-2">
            <div className="w-full bg-gray-700/50 rounded-full h-2 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Cerrando automáticamente en {Math.ceil((100 - progress) / 20)}s...
            </p>
          </div>

          {/* Botón OK */}
          <button
            onClick={onClose}
            className="mobile-touch-target w-full bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 hover:from-cyan-600 hover:via-blue-600 hover:to-purple-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/50"
          >
            ¡Genial! 🎵
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes wave {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -1000px 0;
          }
          100% {
            background-position: 1000px 0;
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-shimmer {
          background-size: 1000px 100%;
          animation: shimmer 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default SuccessWavePopup;

