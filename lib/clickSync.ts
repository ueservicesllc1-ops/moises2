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

function linearResample(input: Float32Array, srcSr: number, dstSr: number): Float32Array {
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

async function fetchDecodeMono(url: string, ac: AudioContext): Promise<{ data: Float32Array; sr: number }> {
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
  const n = Math.min(refMono.length, clickMono.length)
  if (n < sr * 0.35 || bpm < 40 || bpm > 240) return 0
  const period = (60 / bpm) * sr
  const periodSec = 60 / bpm
  const hop = Math.max(128, Math.floor(sr / 220))
  const start = Math.max(0, Math.min(Math.floor(anchorSec * sr), n - 1))
  const winLen = Math.min(Math.floor(sr * 8), n - start)
  if (winLen < sr * 0.35) return 0

  const fluxBins = Math.floor(winLen / hop)
  const flux = new Float32Array(fluxBins)
  for (let i = 2; i < fluxBins; i++) {
    const pos = start + i * hop
    let pos0 = 0
    let pos1 = 0
    for (let j = 0; j < hop; j++) {
      const a = refMono[pos + j] ?? 0
      const b = refMono[pos + j - hop] ?? 0
      pos0 += Math.max(0, a - b)
      pos1 += Math.abs(a)
    }
    flux[i] = pos0 * 0.65 + pos1 * 0.08
  }

  const cflux = new Float32Array(fluxBins)
  for (let i = 0; i < fluxBins; i++) {
    const pos = start + i * hop
    let e = 0
    for (let j = 0; j < hop; j++) e += Math.abs(clickMono[pos + j] ?? 0)
    cflux[i] = e
  }

  const steps = Math.max(32, Math.min(96, Math.ceil(period / hop)))
  let bestRef = 0
  let bestRefScore = -Infinity
  for (let s = 0; s < steps; s++) {
    const phi = (s / steps) * period
    let score = 0
    for (let t = phi; t < winLen; t += period) {
      const fi = Math.floor(t / hop)
      if (fi >= 0 && fi < fluxBins) score += flux[fi]
    }
    if (score > bestRefScore) {
      bestRefScore = score
      bestRef = phi
    }
  }

  let bestClick = 0
  let bestClickScore = -Infinity
  for (let s = 0; s < steps; s++) {
    const phi = (s / steps) * period
    let score = 0
    for (let t = phi; t < winLen; t += period) {
      const fi = Math.floor(t / hop)
      if (fi >= 0 && fi < fluxBins) score += cflux[fi]
    }
    if (score > bestClickScore) {
      bestClickScore = score
      bestClick = phi
    }
  }

  const deltaSamples = bestClick - bestRef
  const deltaSec = deltaSamples / sr
  return wrapPhaseDeltaSec(deltaSec, periodSec)
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
