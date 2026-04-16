/**
 * URL “pública” del API para el navegador (fetch desde el cliente).
 * Monolito: deja NEXT_PUBLIC_API_URL vacío o usa https://tu-dominio (mismo sitio que Next).
 * No uses placeholders tipo TU-BACKEND-FASTAPI (se ignoran y se usa el origen actual).
 */

import { isPlaceholderBackendUrl } from './backendUrl'

export const getBackendUrl = (): string => {
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (pub && !isPlaceholderBackendUrl(pub)) {
    return pub.replace(/\/$/, '')
  }
  
  // Detección automática basada en el dominio actual (solo en cliente)
  if (typeof window !== 'undefined') {
    const currentDomain = window.location.origin
    
    // Si estamos en producción (judith.life, railway.app, o run.app)
    if (currentDomain.includes('judith.life') || currentDomain.includes('railway.app') || currentDomain.includes('run.app')) {
      // Usar la misma URL del frontend como backend (están en el mismo servidor)
      return currentDomain
    }
  }
  
  // Desarrollo local
  return 'http://localhost:8000'
}

export const BACKEND_URL = getBackendUrl()

