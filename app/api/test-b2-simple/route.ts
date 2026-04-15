import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: 'Endpoint deshabilitado por seguridad. Usa /api/health para diagnóstico.'
    },
    { status: 410 }
  )
}
