# WaveSurfer.js Integration

## 🎵 Descripción

Esta integración añade capacidades avanzadas de visualización y edición de audio a la aplicación Moises Clone usando WaveSurfer.js.

## 🚀 Características

### ✨ Visualización de Ondas
- **Ondas en tiempo real**: Visualización interactiva de ondas de audio
- **Navegación precisa**: Click para saltar a cualquier punto del audio
- **Zoom y pan**: Controles avanzados de navegación
- **Colores personalizables**: Diferentes colores para ondas, progreso y cursor

### 🎛️ Controles Avanzados
- **Reproducción sincronizada**: Múltiples pistas sincronizadas perfectamente
- **Controles individuales**: Mute, solo, volumen y pan por pista
- **Interfaz responsive**: Adaptable a diferentes tamaños de pantalla
- **Carga dinámica**: WaveSurfer.js se carga solo cuando es necesario

## 📦 Componentes Creados

### 1. WaveSurferPlayer
Reproductor básico con visualización de ondas.

```typescript
<WaveSurferPlayer
  src="/path/to/audio.mp3"
  title="Song Title"
  artist="Artist Name"
  isPlaying={isPlaying}
  onPlay={() => setIsPlaying(true)}
  onPause={() => setIsPlaying(false)}
  height={80}
  waveColor="#3b82f6"
  progressColor="#1d4ed8"
  cursorColor="#1e40af"
/>
```

### 2. WaveSurferEditor
Editor avanzado para múltiples pistas.

```typescript
<WaveSurferEditor
  tracks={tracks}
  isPlaying={isPlaying}
  onPlay={togglePlay}
  onPause={togglePlay}
  onTrackUpdate={handleTrackUpdate}
  onSeek={handleSeek}
  currentTime={currentTime}
  duration={duration}
/>
```

### 3. useWaveSurfer Hook
Hook personalizado para manejar WaveSurfer.

```typescript
const {
  waveformRef,
  wavesurfer,
  isLoading,
  isReady,
  duration,
  currentTime,
  volume,
  isPlaying,
  play,
  pause,
  stop,
  setVolume,
  seekTo,
  destroy
} = useWaveSurfer(src, options);
```

### 4. AudioEditorWithWaveSurfer
Editor completo integrado con WaveSurfer.

```typescript
<AudioEditorWithWaveSurfer
  isOpen={isOpen}
  onClose={onClose}
  songData={songData}
/>
```

## 🛠️ Instalación

### 1. Instalar dependencia
```bash
npm install wavesurfer.js
```

### 2. Importar componentes
```typescript
import WaveSurferPlayer from '@/components/WaveSurferPlayer';
import WaveSurferEditor from '@/components/WaveSurferEditor';
import { useWaveSurfer } from '@/hooks/useWaveSurfer';
```

## 🎨 Personalización

### Colores de Ondas
```typescript
const options = {
  waveColor: '#3b82f6',      // Color de las ondas
  progressColor: '#1d4ed8',  // Color del progreso
  cursorColor: '#1e40af',    // Color del cursor
  barWidth: 2,               // Ancho de las barras
  barGap: 1,                 // Espacio entre barras
  height: 60,                // Altura del waveform
  responsive: true           // Responsive
};
```

### Colores por Pista
```typescript
const trackColors = {
  vocals: '#ef4444',      // Rojo para voces
  drums: '#f59e0b',       // Naranja para batería
  bass: '#10b981',        // Verde para bajo
  other: '#8b5cf6',       // Púrpura para otros
  instrumental: '#06b6d4', // Cian para instrumental
  metronome: '#6b7280'    // Gris para metrónomo
};
```

## 📱 Uso en la Aplicación

### 1. Página Principal
La página principal ya está configurada para usar WaveSurfer cuando se abra el editor de audio.

### 2. Página de Demo
Visita `/wavesurfer-demo` para ver una demostración completa de las capacidades.

### 3. Integración con AudioEditor
El `AudioEditor` original se puede reemplazar con `AudioEditorWithWaveSurfer` para obtener todas las funcionalidades de WaveSurfer.

## 🔧 Configuración Avanzada

### Opciones de WaveSurfer
```typescript
interface WaveSurferOptions {
  waveColor?: string;
  progressColor?: string;
  cursorColor?: string;
  barWidth?: number;
  barGap?: number;
  height?: number;
  responsive?: boolean;
  normalize?: boolean;
  backend?: string;
  mediaControls?: boolean;
  interact?: boolean;
}
```

### Eventos Disponibles
- `ready`: Cuando el audio está listo
- `audioprocess`: Durante la reproducción
- `seek`: Al hacer clic en el waveform
- `play`: Al iniciar reproducción
- `pause`: Al pausar
- `finish`: Al terminar el audio

## 🚀 Servidores en Ejecución

Para usar WaveSurfer.js, asegúrate de que estos servidores estén funcionando:

1. **Frontend Next.js** (puerto 3000)
   ```bash
   npm run dev
   ```

2. **Servidor Proxy B2 S3** (puerto 3001)
   ```bash
   node server-s3.js
   ```

3. **Backend FastAPI** (puerto 8000)
   ```bash
   cd backend && python main.py
   ```

## 🎯 Próximos Pasos

1. **Integrar con el AudioEditor existente**
2. **Añadir más efectos de audio**
3. **Implementar grabación en tiempo real**
4. **Añadir soporte para más formatos**
5. **Optimizar rendimiento para archivos grandes**

## 📚 Recursos

- [WaveSurfer.js Documentation](https://wavesurfer.xyz/)
- [WaveSurfer.js GitHub](https://github.com/katspaugh/wavesurfer.js)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## 🐛 Solución de Problemas

### Error: "WaveSurfer is not defined"
- Asegúrate de que WaveSurfer.js esté instalado: `npm install wavesurfer.js`

### Error: "Container not found"
- Verifica que el elemento contenedor exista antes de crear WaveSurfer

### Audio no se reproduce
- Verifica que el archivo de audio sea accesible
- Comprueba que el formato sea compatible (MP3, WAV, etc.)

### Problemas de sincronización
- Asegúrate de que todas las pistas tengan la misma duración
- Verifica que los eventos estén configurados correctamente
