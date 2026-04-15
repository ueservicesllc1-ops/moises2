'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { gsap } from 'gsap'
// Evita conflicto de casing Draggable.d.ts vs draggable.d.ts en Windows (resolución de tipos de gsap)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const DraggablePlugin = require('gsap/Draggable.js').default
if (typeof window !== 'undefined') {
  gsap.registerPlugin(DraggablePlugin)
}

interface Cover {
  id: string
  title: string
  description: string
  icon: React.ElementType
  bgColor: string
  textColor: string
  action: () => void
  color: string
  gradient: string
}

interface ProfessionalCoverFlowProps {
  covers: Cover[]
  onCoverSelect?: (cover: Cover) => void
}

const ProfessionalCoverFlow: React.FC<ProfessionalCoverFlowProps> = ({ covers, onCoverSelect }) => {
  const [currentIndex, setCurrentIndex] = useState(Math.floor(covers.length / 2))
  const [isAnimating, setIsAnimating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const slidesRef = useRef<(HTMLDivElement | null)[]>([])
  const draggableRef = useRef<Draggable | null>(null)

  // Función principal para actualizar el CoverFlow con GSAP
  const updateCoverflow = useCallback(() => {
    if (!slidesRef.current || slidesRef.current.length === 0) return

    setIsAnimating(true)
    
    slidesRef.current.forEach((slide, index) => {
      if (!slide) return

      const offset = index - currentIndex
      const distance = Math.abs(offset)

      // Solo mostrar covers cercanos (máximo 3)
      if (distance > 2) {
        gsap.set(slide, { opacity: 0, scale: 0 })
        return
      }

      gsap.to(slide, {
        duration: 0.7,
        x: offset * 220, // Separación entre covers
        rotationY: offset * -45, // Rotación 3D
        scale: offset === 0 ? 1.2 : 0.7, // Escala del cover central vs laterales
        z: -distance * 100, // Profundidad 3D
        opacity: 1,
        ease: "power3.out",
        onComplete: () => {
          if (index === slidesRef.current.length - 1) {
            setIsAnimating(false)
          }
        }
      })
    })
  }, [currentIndex])

  // Navegación con teclado
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (isAnimating) return

    if (event.key === 'ArrowRight') {
      setCurrentIndex(prev => Math.min(prev + 1, covers.length - 1))
    } else if (event.key === 'ArrowLeft') {
      setCurrentIndex(prev => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter') {
      onCoverSelect?.(covers[currentIndex])
      covers[currentIndex]?.action()
    }
  }, [isAnimating, currentIndex, covers, onCoverSelect])

  // Click en cover
  const handleCoverClick = useCallback((cover: Cover, index: number) => {
    if (isAnimating) return
    
    setCurrentIndex(index)
    onCoverSelect?.(cover)
    cover.action()
  }, [isAnimating, onCoverSelect])

  // Navegación manual
  const handlePrevious = useCallback(() => {
    if (isAnimating) return
    setCurrentIndex(prev => Math.max(prev - 1, 0))
  }, [isAnimating])

  const handleNext = useCallback(() => {
    if (isAnimating) return
    setCurrentIndex(prev => Math.min(prev + 1, covers.length - 1))
  }, [isAnimating])

  // Efecto hover 3D
  const handleMouseEnter = useCallback((index: number) => {
    if (isAnimating) return
    
    const slide = slidesRef.current[index]
    if (!slide) return

    gsap.to(slide, {
      duration: 0.3,
      scale: index === currentIndex ? 1.3 : 0.8,
      rotationY: (index - currentIndex) * -45 - 5,
      ease: "power2.out"
    })
  }, [isAnimating, currentIndex])

  const handleMouseLeave = useCallback((index: number) => {
    if (isAnimating) return
    
    const slide = slidesRef.current[index]
    if (!slide) return

    const offset = index - currentIndex
    gsap.to(slide, {
      duration: 0.3,
      scale: offset === 0 ? 1.2 : 0.7,
      rotationY: offset * -45,
      ease: "power2.out"
    })
  }, [isAnimating, currentIndex])

  // Configurar Draggable para swipe
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return

    draggableRef.current = DraggablePlugin.create(containerRef.current, {
      type: "x",
      edgeResistance: 0.65,
      inertia: true,
      bounds: { minX: -200, maxX: 200 } as any,
      onDragEnd: function() {
        if (isAnimating) return

        const container = containerRef.current
        if (!container) return

        const containerRect = container.getBoundingClientRect()
        const center = containerRect.left + containerRect.width / 2
        let closestIndex = currentIndex
        let closestDist = Infinity

        slidesRef.current.forEach((slide, index) => {
          if (!slide) return
          
          const rect = slide.getBoundingClientRect()
          const slideCenter = rect.left + rect.width / 2
          const dist = Math.abs(center - slideCenter)
          
          if (dist < closestDist) {
            closestIndex = index
            closestDist = dist
          }
        })

        setCurrentIndex(closestIndex)
      }
    })[0]

    return () => {
      if (draggableRef.current) {
        draggableRef.current.kill()
      }
    }
  }, [isAnimating, currentIndex])

  // Configurar eventos y animaciones
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    updateCoverflow()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown, updateCoverflow])

  // Actualizar cuando cambia el índice
  useEffect(() => {
    updateCoverflow()
  }, [updateCoverflow])

  return (
    <div className="w-full h-96 flex flex-col items-center justify-center relative overflow-hidden bg-gradient-to-b from-gray-100 to-white">
      {/* Controles de navegación */}
      <div className="flex items-center justify-between w-full mb-6 px-8 z-10">
        <button
          onClick={handlePrevious}
          disabled={isAnimating || currentIndex === 0}
          className="p-3 bg-white/90 hover:bg-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg rounded-full"
        >
          <ChevronLeft className="w-6 h-6 text-gray-700" />
        </button>
        
        <div className="flex space-x-2">
          {covers.map((_, index) => (
            <button
              key={index}
              onClick={() => handleCoverClick(covers[index], index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentIndex 
                  ? 'bg-blue-500 scale-125' 
                  : 'bg-gray-400 hover:bg-gray-500'
              }`}
              disabled={isAnimating}
            />
          ))}
        </div>
        
        <button
          onClick={handleNext}
          disabled={isAnimating || currentIndex === covers.length - 1}
          className="p-3 bg-white/90 hover:bg-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg rounded-full"
        >
          <ChevronRight className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      {/* Área principal del CoverFlow */}
      <div 
        ref={containerRef}
        className="relative w-full h-80 flex items-center justify-center"
        style={{ 
          perspective: '1200px',
          transformStyle: 'preserve-3d'
        }}
      >
        {/* Piso con reflejo de cristal */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.1) 100%)',
            backdropFilter: 'blur(2px)',
            borderTop: '1px solid rgba(255,255,255,0.2)'
          }}
        />
        
        <div className="relative w-full h-full flex items-center justify-center">
          {covers.map((cover, index) => (
            <div
              key={cover.id}
              ref={(el) => { slidesRef.current[index] = el }}
              className="absolute cursor-pointer transition-all duration-300"
              onClick={() => handleCoverClick(cover, index)}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={() => handleMouseLeave(index)}
              style={{
                transformStyle: 'preserve-3d',
                width: '280px',
                height: '200px'
              }}
            >
              {/* Cover principal */}
              <div
                className="w-full h-full shadow-2xl relative overflow-hidden group"
                style={{
                  background: cover.gradient,
                  borderRadius: '16px',
                  transformStyle: 'preserve-3d'
                }}
              >
                {/* Efecto de cristal superior */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />
                
                {/* Reflejo superior */}
                <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
                
                {/* Contenido del cover */}
                <div className="relative z-10 h-full flex items-center justify-center p-6">
                  <div className="flex items-center space-x-4">
                    {/* Icono */}
                    <div 
                      className="w-16 h-16 flex items-center justify-center transition-all duration-300 group-hover:scale-110 flex-shrink-0 rounded-full"
                      style={{ 
                        backgroundColor: `${cover.color}30`,
                        boxShadow: `0 8px 25px ${cover.color}40`
                      }}
                    >
                      {React.createElement(cover.icon as React.ElementType, {
                        className: 'w-8 h-8',
                        style: { color: cover.color }
                      })}
                    </div>
                    
                    {/* Texto */}
                    <div className="text-left">
                      <h4 className="text-white font-bold text-xl mb-2 group-hover:text-white/90">
                        {cover.title}
                      </h4>
                      <p className="text-white/80 text-sm leading-relaxed group-hover:text-white/90">
                        {cover.description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Borde brillante para el cover activo */}
                {index === currentIndex && (
                  <div className="absolute inset-0 border-2 border-white/50 rounded-16" 
                       style={{ boxShadow: `0 0 30px ${cover.color}80` }} />
                )}
              </div>
              
              {/* Reflejo en el piso */}
              <div
                className="absolute top-full left-0 w-full h-32 opacity-40"
                style={{
                  background: cover.gradient,
                  transform: 'scaleY(-1)',
                  filter: 'blur(3px) brightness(0.8)',
                  borderRadius: '16px',
                  transformStyle: 'preserve-3d'
                }}
              >
                {/* Efecto de cristal en el reflejo */}
                <div className="absolute inset-0 bg-gradient-to-t from-white/25 via-transparent to-transparent" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Información del cover activo */}
      <div className="mt-6 text-center">
        <h3 className="text-2xl font-bold text-gray-800 mb-2">
          {covers[currentIndex]?.title}
        </h3>
        <p className="text-gray-600 max-w-md">
          {covers[currentIndex]?.description}
        </p>
      </div>
    </div>
  )
}

export default ProfessionalCoverFlow
