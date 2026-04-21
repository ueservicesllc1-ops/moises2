import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy simple para evitar errores de CORS al descargar archivos
 * desde servicios externos como Backblaze B2 en el cliente.
 */
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    
    if (!url) {
        return NextResponse.json({ error: 'Falta el parámetro URL' }, { status: 400 });
    }

    try {
        console.log('📡 Proxying request to:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Error en el servidor remoto: ${response.status} ${response.statusText}`);
        }

        const blob = await response.blob();
        const contentType = response.headers.get('Content-Type') || 'audio/wav';

        // Retornar el archivo con los headers adecuados
        return new NextResponse(blob, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=31536000',
                // Aseguramos que el cliente pueda leerlo
                'Access-Control-Allow-Origin': '*',
            }
        });
    } catch (error: any) {
        console.error('❌ Error en el proxy de audio:', error);
        return NextResponse.json({ 
            error: 'Error al obtener el archivo remoto', 
            details: error.message 
        }, { status: 500 });
    }
}
