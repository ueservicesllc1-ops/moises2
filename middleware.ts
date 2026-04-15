import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/** En desarrollo: el navegador no guarda HTML con hashes viejos de /_next (evita 404 en chunks). */
export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.next()
  }
  const res = NextResponse.next()
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack|favicon.ico).*)'],
}
