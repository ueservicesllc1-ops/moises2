import { existsSync } from 'fs'
import { join } from 'path'
import { NextResponse } from 'next/server'

/** Solo desarrollo: comprueba si existen los chunks típicos del cliente. */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const root = process.cwd()
  const webpack = existsSync(join(root, '.next/static/chunks/webpack.js'))
  const layoutCss = existsSync(join(root, '.next/static/css/app/layout.css'))

  return NextResponse.json({
    cwd: root,
    webpackChunkExists: webpack,
    layoutCssExists: layoutCss,
    ok: webpack && layoutCss,
    hint: webpack && layoutCss
      ? 'Los estáticos de dev están en disco. Si el navegador sigue con 404, suele ser puerto equivocado (otro proceso en :3000) o caché.'
      : 'Faltan archivos de compilación. Para el servidor, borra .next y ejecuta: npm run dev:clean',
  })
}
