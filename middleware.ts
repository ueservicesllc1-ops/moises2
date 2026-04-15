import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/** En desarrollo: el navegador no guarda HTML con hashes viejos de /_next (evita 404 en chunks). */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.next()
  }

  // En dev, algunos navegadores piden chunks sin query `v` y Next responde 404.
  // Forzamos query para estabilizar hot reload.
  const { pathname, searchParams } = request.nextUrl
  const isDevChunk = pathname.startsWith('/_next/static/chunks/') && pathname.endsWith('.js')
  if (isDevChunk && !searchParams.has('v')) {
    const url = request.nextUrl.clone()
    url.searchParams.set('v', Date.now().toString())
    return NextResponse.redirect(url)
  }

  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  return res
}

export const config = {
  matcher: ['/((?!_next/image|favicon.ico).*)'],
}
