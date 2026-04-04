'use client'

import React, { useState, useEffect } from 'react'
import { X, Star, Gift, Zap, Crown } from 'lucide-react'
import Image from 'next/image'
import AdminModalLabel from './AdminModalLabel'

interface HeroPopupProps {
  isOpen: boolean
  onClose: () => void
}

const HeroPopup: React.FC<HeroPopupProps> = ({ isOpen, onClose }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [animationPhase, setAnimationPhase] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      // Secuencia de animaciones
      setTimeout(() => setAnimationPhase(1), 100)
      setTimeout(() => setAnimationPhase(2), 300)
      setTimeout(() => setAnimationPhase(3), 500)
    }
  }, [isOpen])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(onClose, 300)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <AdminModalLabel modalName="HeroPopup" />
      {/* Backdrop con efecto de blur y partículas */}
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-sm"
        style={{
          animation: isVisible ? 'fadeIn 0.3s ease-out' : 'fadeOut 0.3s ease-out'
        }}
      >
        {/* Partículas flotantes */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-full opacity-40"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `float ${3 + Math.random() * 2}s infinite ease-in-out`,
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* Modal principal */}
      <div 
        className="relative bg-gradient-to-br from-gray-950 via-gray-900 to-black border-2 border-gray-700 rounded-3xl p-8 max-w-2xl mx-4 shadow-2xl"
        style={{
          animation: isVisible ? 'slideInScale 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'slideOutScale 0.3s ease-out',
          boxShadow: '0 0 50px rgba(0, 0, 0, 0.8), inset 0 0 50px rgba(75, 85, 99, 0.1)'
        }}
      >
        {/* Botón de cerrar */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Contenido principal */}
        <div className="text-center space-y-6">
          {/* Logo/Título principal */}
          <div 
            className="relative"
            style={{
              animation: animationPhase >= 1 ? 'bounceIn 0.6s ease-out' : 'none',
              opacity: animationPhase >= 1 ? 1 : 0
            }}
          >
            {/* Logo */}
            <div className="flex justify-center mb-2">
              <Image 
                src="/images/logo.png" 
                alt="Judith Logo" 
                width={150} 
                height={150}
                className="object-contain"
              />
            </div>
            
            <div className="text-sm text-gray-400 mb-3">
              Versión 1.0
            </div>
            <div 
              className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-gray-700 to-gray-800 text-gray-200 font-bold rounded-full text-sm border border-gray-600"
              style={{
                animation: animationPhase >= 1 ? 'pulse 2s infinite' : 'none'
              }}
            >
              <Star className="w-4 h-4 mr-1" />
              BETA
              <Star className="w-4 h-4 ml-1" />
            </div>
          </div>

          {/* Mensaje principal */}
          <div 
            className="space-y-4"
            style={{
              animation: animationPhase >= 2 ? 'slideInUp 0.6s ease-out' : 'none',
              opacity: animationPhase >= 2 ? 1 : 0
            }}
          >
            <h2 className="text-3xl font-bold text-gray-200 mb-4">
              ¡Bienvenido al futuro de la música!
            </h2>
            <div className="text-xl text-gray-400 leading-relaxed">
                <span className="text-gray-300 font-bold">¡GRATIS hasta Julio de 2026!</span>
              <p className="text-gray-500">
                Después de este período, Judith será de uso limitado para quienes no obtengan una suscripción premium.
              </p>
            </div>
          </div>

          {/* Características destacadas */}
          <div 
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8"
            style={{
              animation: animationPhase >= 3 ? 'slideInUp 0.6s ease-out' : 'none',
              opacity: animationPhase >= 3 ? 1 : 0
            }}
          >
            <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border border-gray-700">
              <Gift className="w-6 h-6 text-gray-400" />
              <span className="text-gray-300 font-semibold">100% Gratis</span>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border border-gray-700">
              <Zap className="w-6 h-6 text-gray-400" />
              <span className="text-gray-300 font-semibold">IA Avanzada</span>
            </div>
            <div className="flex items-center space-x-3 p-4 bg-gradient-to-r from-gray-800 to-gray-900 rounded-xl border border-gray-700">
              <Crown className="w-6 h-6 text-gray-400" />
              <span className="text-gray-300 font-semibold">Premium</span>
            </div>
          </div>

          {/* Botón de acción */}
          <div 
            className="pt-6"
            style={{
              animation: animationPhase >= 3 ? 'slideInUp 0.6s ease-out' : 'none',
              opacity: animationPhase >= 3 ? 1 : 0
            }}
          >
            <button
              onClick={handleClose}
              className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold rounded-full text-lg transition-all duration-300 transform hover:scale-105 hover:shadow-lg"
              style={{
                boxShadow: '0 0 30px rgba(168, 85, 247, 0.5)',
                animation: 'pulse 2s infinite'
              }}
            >
              ¡Empezar ahora!
            </button>
          </div>

          {/* Fecha límite destacada */}
          <div 
            className="text-center pt-4"
            style={{
              animation: animationPhase >= 3 ? 'slideInUp 0.6s ease-out' : 'none',
              opacity: animationPhase >= 3 ? 1 : 0
            }}
          >
            <div className="text-sm text-gray-400">
              Oferta válida hasta <span className="text-yellow-400 font-bold">Julio, 2026</span>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos CSS para las animaciones */}
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        
        @keyframes slideInScale {
          0% {
            opacity: 0;
            transform: scale(0.5) translateY(50px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        @keyframes slideOutScale {
          0% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          100% {
            opacity: 0;
            transform: scale(0.8) translateY(-50px);
          }
        }
        
        @keyframes bounceIn {
          0% {
            opacity: 0;
            transform: scale(0.3) rotate(-10deg);
          }
          50% {
            opacity: 1;
            transform: scale(1.1) rotate(5deg);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }
        
        @keyframes slideInUp {
          0% {
            opacity: 0;
            transform: translateY(30px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-20px) rotate(180deg);
          }
        }
      `}</style>
    </div>
  )
}

export default HeroPopup
