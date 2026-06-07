/**
 * Detección de fase del click respecto a stems rítmicos (cliente).
 * El BPM debe venir de la canción (metadata / análisis); aquí solo alineamos fase.
 */

export function isClickStemKey(key: string): boolean {
  const k = key.toLowerCase()
  return k === 'click' || k.startsWith('click_')
}

export function wrapPhaseDeltaSec(deltaSec: number, periodSec: number): number {
  if (periodSec <= 1e-6 || !Number.isFinite(deltaSec)) return 0
  let d = deltaSec
  const h = periodSec / 2
  while (d > h) d -= periodSec
  while (d < -h) d += periodSec
  return d
}

export function linearResample(input: Float32Array, srcSr: number, dstSr: number): Float32Array {
  if (srcSr === dstSr || input.length === 0) return input
  const ratio = dstSr / srcSr
  const outLen = Math.max(1, Math.floor(input.length * ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const x = i / ratio
    const x0 = Math.floor(x)
    const x1 = Math.min(x0 + 1, input.length - 1)
    const t = x - x0
    out[i] = input[x0] * (1 - t) + input[x1] * t
  }
  return out
}

function bufferToMono(buf: AudioBuffer): { data: Float32Array; sr: number } {
  const len = buf.length
  const out = new Float32Array(len)
  const ch0 = buf.getChannelData(0)
  for (let i = 0; i < len; i++) out[i] = ch0[i]
  const n = buf.numberOfChannels
  if (n > 1) {
    for (let c = 1; c < n; c++) {
      const ch = buf.getChannelData(c)
      for (let i = 0; i < len; i++) out[i] += ch[i]
    }
    for (let i = 0; i < len; i++) out[i] /= n
  }
  return { data: out, sr: buf.sampleRate }
}

export async function fetchDecodeMono(url: string, ac: AudioContext): Promise<{ data: Float32Array; sr: number }> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`No se pudo descargar audio (${r.status})`)
  const ab = await r.arrayBuffer()
  const buf = await ac.decodeAudioData(ab.slice(0))
  return bufferToMono(buf)
}

function mixMonos(parts: Float32Array[]): Float32Array {
  if (parts.length === 0) return new Float32Array(0)
  let minL = parts[0].length
  for (const p of parts) minL = Math.min(minL, p.length)
  const out = new Float32Array(minL)
  for (const p of parts) {
    for (let i = 0; i < minL; i++) out[i] += p[i] ?? 0
  }
  let m = 0
  for (let i = 0; i < minL; i++) m = Math.max(m, Math.abs(out[i]))
  if (m > 1e-8) for (let i = 0; i < minL; i++) out[i] /= m
  return out
}

/**
 * Offset en segundos: usar playback del click como `masterTime - offset`
 * para alinear impulsos del click con la rejilla rítmica detectada en `refMono`.
 */
export function estimateBeatGridPhaseOffsetSec(
  refMono: Float32Array,
  clickMono: Float32Array,
  sr: number,
  bpm: number,
  anchorSec: number,
): number {
  const n = Math.min(refMono.length, sr * 20); // Analizamos los primeros 20s para estabilidad
  if (n < sr * 0.35 || bpm < 40 || bpm > 240) return 0;
  
  const beatPeriod = 60 / bpm;
  const beatSamples = Math.floor(beatPeriod * sr);
  
  // 1. Detección de Fase Fina (Alineación con cualquier golpe)
  let bestOffsetSamples = 0;
  let maxPhaseCorr = -1;
  
  for (let offset = 0; offset < beatSamples; offset += 32) { // Escaneo por saltos para velocidad
    let corr = 0;
    for (let j = 0; j < 8; j++) { 
      const pos = offset + Math.floor(j * beatSamples);
      if (pos < n) {
        // Miramos energía local
        for (let k = 0; k < 128 && pos + k < n; k++) {
          corr += Math.abs(refMono[pos + k]);
        }
      }
    }
    if (corr > maxPhaseCorr) {
      maxPhaseCorr = corr;
      bestOffsetSamples = offset;
    }
  }

  // 2. DETECCIÓN DE DOWNBEAT (Acentuación del "1")
  // Probamos cuál de los 4 beats del compás tiene más peso rítmico
  let bestDownbeatIndex = 0;
  let maxDownbeatEnergy = -1;
  
  for (let i = 0; i < 4; i++) {
    let energy = 0;
    const startOffset = bestOffsetSamples + (i * beatSamples);
    
    // Sumamos energía solo en los tiempos fuertes (cada 4 beats)
    for (let bar = 0; bar < 4; bar++) {
      const pos = startOffset + (bar * beatSamples * 4);
      if (pos < n) {
        for (let k = -200; k < 200; k++) {
          if (pos + k >= 0 && pos + k < n) {
            energy += Math.abs(refMono[pos + k]);
          }
        }
      }
    }
    
    if (energy > maxDownbeatEnergy) {
      maxDownbeatEnergy = energy;
      bestDownbeatIndex = i;
    }
  }

  // El offset final mueve el inicio del click al Downbeat más probable
  const finalOffsetSamples = bestOffsetSamples + (bestDownbeatIndex * beatSamples);
  const finalOffsetSec = finalOffsetSamples / sr;
  
  // Ajustar para que el click no empiece en el futuro lejano
  return finalOffsetSec % (beatPeriod * 4);
}

export async function computeClickSyncOffsetSecFromStems(options: {
  refUrls: string[]
  clickUrl: string
  bpm: number
  anchorSec: number
}): Promise<number> {
  const { refUrls, clickUrl, bpm, anchorSec } = options
  if (!refUrls.length) throw new Error('Falta audio de referencia (batería/mezcla).')

  const ac = new AudioContext()
  try {
    const refDecoded = await Promise.all(refUrls.map((u) => fetchDecodeMono(u, ac)))
    const targetSr = refDecoded[0].sr
    const refParts = refDecoded.map((d) => linearResample(d.data, d.sr, targetSr))
    const refMono = mixMonos(refParts)

    const clickDec = await fetchDecodeMono(clickUrl, ac)
    const clickMono = linearResample(clickDec.data, clickDec.sr, targetSr)

    const n = Math.min(refMono.length, clickMono.length)
    return estimateBeatGridPhaseOffsetSec(
      refMono.subarray(0, n),
      clickMono.subarray(0, n),
      targetSr,
      bpm,
      anchorSec,
    )
  } finally {
    await ac.close()
  }
}
/**
 * Encuentra el transitorio (golpe) más cercano a un tiempo objetivo.
 * Útil para "ajustar" manualmente el metrónomo al impacto exacto de un bombo/redoble.
 */
export function findNearestTransientSec(
  data: Float32Array,
  sampleRate: number,
  targetSec: number,
  windowSec: number = 0.3
): number {
  const halfWinSamples = Math.floor((windowSec / 2) * sampleRate);
  const centerIdx = Math.floor(targetSec * sampleRate);
  
  const startIdx = Math.max(0, centerIdx - halfWinSamples);
  const endIdx = Math.min(data.length - 1, centerIdx + halfWinSamples);
  
  let maxEnergy = -1;
  let bestIdx = centerIdx;

  // Usamos una pequeña ventana deslizante para promediar energía y evitar picos de ruido aislados
  const smoothWindow = Math.floor(sampleRate * 0.01); // 10ms
  
  for (let i = startIdx; i < endIdx - smoothWindow; i++) {
    let energy = 0;
    for (let j = 0; j < smoothWindow; j++) {
      energy += Math.abs(data[i + j]);
    }
    
    if (energy > maxEnergy) {
      maxEnergy = energy;
      bestIdx = i + Math.floor(smoothWindow / 2);
    }
  }
  
  return bestIdx / sampleRate;
}
