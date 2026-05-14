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

export function applyLocalDevBrowserCors(request: NextRequest, headers: Headers): void {
  const o = request.headers.get('origin')
  if (o && isLocalDevBrowserOrigin(o)) {
    headers.set('Access-Control-Allow-Origin', o)
    headers.append('Vary', 'Origin')
  }
}
