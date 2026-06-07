import React, { useRef, useLayoutEffect } from 'react';

interface WaveformClipCanvasProps {
  channelData: Float32Array | null;
  sampleRate: number;
  sourceInSec: number;
  sourceOutSec: number;
  color: string;
  height: number;
  zoom: number;
  selected?: boolean;
  muted?: boolean;
}

const WaveformClipCanvas: React.FC<WaveformClipCanvasProps> = ({
  channelData,
  sampleRate,
  sourceInSec,
  sourceOutSec,
  color,
  height,
  zoom,
  selected = false,
  muted = false
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Caché de picos multi-resolución (Pirámide)
  const pyramidRef = useRef<{
    levels: { step: number; peaks: Float32Array }[];
  } | null>(null);

  // Generar la pirámide de picos (idéntico al anterior para mantener estabilidad)
  useLayoutEffect(() => {
    if (!channelData) {
      pyramidRef.current = null;
      return;
    }

    const steps = [1, 4, 16, 64, 256, 1024, 4096];
    const levels = steps.map(step => {
      const numPeaks = Math.ceil(channelData.length / step);
      const peaks = new Float32Array(numPeaks * 2);
      
      for (let i = 0; i < numPeaks; i++) {
        const start = i * step;
        const end = Math.min(start + step, channelData.length);
        let min = 0;
        let max = 0;
        for (let j = start; j < end; j++) {
          const s = channelData[j];
          if (s < min) min = s;
          if (s > max) max = s;
        }
        peaks[i * 2] = min;
        peaks[i * 2 + 1] = max;
      }
      return { step, peaks };
    });

    pyramidRef.current = { levels };
  }, [channelData]);

  // Renderizado Profesional (Ableton/Logic style)
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !channelData || !pyramidRef.current) return;
    
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const h = rect.height;
      if (width <= 0 || h <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, width, h);

      const audibleDuration = Math.max(0.001, sourceOutSec - sourceInSec);
      const samplesInClip = audibleDuration * sampleRate;
      const samplesPerPixel = samplesInClip / width;
      
      let level = pyramidRef.current!.levels[0];
      for (const l of pyramidRef.current!.levels) {
        if (l.step <= samplesPerPixel) {
          level = l;
        } else {
          break;
        }
      }

      const peakDuration = level.step / sampleRate;
      const centerY = h / 2;
      const amp = (h / 2) * 0.92; // Margen sutil arriba/abajo

      // Dibujar línea central suave
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Configurar estilo de waveform
      const baseOpacity = muted ? 0.3 : (selected ? 1.0 : 0.85);
      ctx.strokeStyle = selected ? '#FFFFFF' : (color || '#FFFFFF');
      ctx.globalAlpha = baseOpacity;
      ctx.lineWidth = 1;
      ctx.beginPath();

      for (let x = 0; x < width; x++) {
        const timeStart = sourceInSec + (x / width) * audibleDuration;
        const timeEnd = sourceInSec + ((x + 1) / width) * audibleDuration;
        
        const startPeakIdx = Math.floor(timeStart / peakDuration);
        const endPeakIdx = Math.ceil(timeEnd / peakDuration);
        
        let min = 0;
        let max = 0;
        let found = false;

        for (let i = startPeakIdx; i <= endPeakIdx; i++) {
          if (i >= 0 && i < level.peaks.length / 2) {
            const pMin = level.peaks[i * 2];
            const pMax = level.peaks[i * 2 + 1];
            if (pMin < min) min = pMin;
            if (pMax > max) max = pMax;
            found = true;
          }
        }
        
        if (found) {
          const yMin = centerY + min * amp;
          const yMax = centerY + max * amp;
          const drawX = x + 0.5;
          ctx.moveTo(drawX, yMin);
          ctx.lineTo(drawX, yMax);
        }
      }
      
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    };

    const ro = new ResizeObserver(() => render());
    ro.observe(canvas);
    render();

    return () => ro.disconnect();
  }, [channelData, sampleRate, sourceInSec, sourceOutSec, color, height, zoom, selected, muted]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full block pointer-events-none"
      style={{ imageRendering: 'auto' }}
    />
  );
};

export default WaveformClipCanvas;
