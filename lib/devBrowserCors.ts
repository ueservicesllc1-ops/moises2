import type { NextRequest } from 'next/server'

/** Origen `http(s)://localhost` o `127.0.0.1` (cualquier puerto). */
export function isLocalDevBrowserOrigin(origin: string | null): boolean {
  if (!origin) return false
  try {
    const u = new URL(origin)
    return (
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
      (u.protocol === 'http:' || u.protocol === 'https:')
    )
  } catch {
    return false
  }
}

export function applyLocalDevBrowserCors(request: Request | NextRequest, headers: Headers): void {
  const origin = (request instanceof Request ? request.headers.get('origin') : request.headers.get('origin'))
  
  // Si el origen es localhost, siempre permitimos CORS (útil para usar Railway como proxy desde local)
  if (origin && (origin.includes('localhost:') || origin.includes('127.0.0.1:'))) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.append('Vary', 'Origin')
  }
}
