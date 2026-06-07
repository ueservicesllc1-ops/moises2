/**
 * Motor de detección de BPM mediante Histograma de Intervalos (Beat Histogram).
 * Optimizado para Judith: Combina Drums + Bass para máxima precisión.
 */

export function analyzeBpmFromChannelData(
  channelData: Float32Array,
  sampleRate: number,
  secondaryData?: Float32Array
): number {
  if (!channelData || channelData.length === 0) return 120;

  // 1. Pre-procesamiento y Combinación (Drums + Bass)
  // Submuestreo a 100Hz para análisis rítmico.
  const targetSr = 100;
  const ratio = Math.floor(sampleRate / targetSr);
  const envelope = new Float32Array(Math.floor(channelData.length / ratio));
  
  for (let i = 0; i < envelope.length; i++) {
    const start = i * ratio;
    const end = Math.floor((i + 1) * ratio);
    
    let max1 = 0;
    let max2 = 0;
    
    for (let j = start; j < end; j++) {
      const v1 = Math.abs(channelData[j]);
      if (v1 > max1) max1 = v1;
      
      if (secondaryData && secondaryData[j]) {
        const v2 = Math.abs(secondaryData[j]);
        if (v2 > max2) max2 = v2;
      }
    }
    // Combinamos Drums (70%) y Bass (30%) para el análisis
    envelope[i] = secondaryData ? (max1 * 0.7 + max2 * 0.3) : max1;
  }

  // 2. Detección de Picos de Energía (Transitorios)
  const peaks: number[] = [];
  const threshold = 0.15; 
  for (let i = 2; i < envelope.length - 2; i++) {
    if (envelope[i] > threshold &&
        envelope[i] > envelope[i-1] && envelope[i] > envelope[i-2] &&
        envelope[i] > envelope[i+1] && envelope[i] > envelope[i+2]) {
      peaks.push(i);
    }
  }

  if (peaks.length < 10) return 120;

  // 3. Histograma de Intervalos (Lags)
  const minLag = Math.floor(targetSr * (60 / 180)); 
  const maxLag = Math.ceil(targetSr * (60 / 60));   
  const histogram = new Float32Array(maxLag + 1);

  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < Math.min(i + 15, peaks.length); j++) {
      const lag = peaks[j] - peaks[i];
      if (lag >= minLag && lag <= maxLag) {
        histogram[lag] += 1.0;
      }
      const halfLag = Math.round(lag / 2);
      if (halfLag >= minLag && halfLag <= maxLag) {
        histogram[halfLag] += 0.5;
      }
    }
  }

  // 4. Selección del Ganador con Sesgo Musical
  let bestLag = 0;
  let maxCount = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const smoothCount = (histogram[lag-1] || 0) + histogram[lag] + (histogram[lag+1] || 0);
    const bpm = (60 * targetSr) / lag;
    let bias = 1.0;
    if (bpm > 130) bias = 0.5;
    if (bpm < 70) bias = 0.8;
    if (bpm >= 90 && bpm <= 120) bias = 1.2;

    if (smoothCount * bias > maxCount) {
      maxCount = smoothCount * bias;
      bestLag = lag;
    }
  }

  const rawBpm = (60 * targetSr) / bestLag;
  return parseFloat(rawBpm.toFixed(2));
}
