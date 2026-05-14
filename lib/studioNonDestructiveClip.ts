/**
 * Modelo de clip no destructivo para Judith Studio (DAW-style).
 * El archivo de audio no se modifica; solo offsets y posición en timeline.
 */

export const MIN_STEM_CLIP_SPAN_SEC = 0.08

/** Persistencia / API (JSON, Firestore). */
export type StemClipEditPersisted = {
  timelineStartSec: number
  sourceInSec: number
  /** null u omitido = reproducir hasta el final natural del stem al cargar */
  sourceOutSec?: number | null
  fadeInSec?: number
  fadeOutSec?: number
  /** Reservado: loop por clip (sin motor aún). */
  loop?: { enabled?: boolean; iterations?: number }
}

export type StudioTimelineExport = {
  version: 1
  tracks: Array<{
    trackId: string
    clips: StemClipEditPersisted[]
  }>
}

export function resolveSourceOutSec(
  stored: number | null | undefined,
  stemDurationSec: number,
): number {
  const d = Math.max(0.01, stemDurationSec)
  if (stored == null || !Number.isFinite(stored) || stored <= 0) return d
  return Math.min(Math.max(MIN_STEM_CLIP_SPAN_SEC, stored), d)
}

export function clampSourceInOut(
  sourceIn: number,
  sourceOut: number,
  stemDurationSec: number,
): { sourceIn: number; sourceOut: number } {
  const d = Math.max(0.01, stemDurationSec)
  let sIn = Math.max(0, Math.min(sourceIn, d - MIN_STEM_CLIP_SPAN_SEC))
  let sOut = resolveSourceOutSec(sourceOut, d)
  sOut = Math.max(sIn + MIN_STEM_CLIP_SPAN_SEC, Math.min(sOut, d))
  return { sourceIn: sIn, sourceOut: sOut }
}

/** Tiempo en archivo (s) = inicio fuente + (tiempo proyecto − inicio clip en timeline) − offset click. */
export function stemFileTimeFromTimelineTrimmed(
  timelineSec: number,
  timelineClipStartSec: number,
  sourceInSec: number,
  clickOffsetSec: number,
): number {
  return sourceInSec + (timelineSec - timelineClipStartSec) - clickOffsetSec
}

/**
 * Recorta el array de peaks al tramo [sourceIn, sourceOut] sin regenerar el análisis.
 */
export function slicePeaksForSourceWindow(
  peaks: number[] | undefined,
  sourceInSec: number,
  sourceOutSec: number,
  stemDurationSec: number,
): number[] {
  if (!peaks?.length) return peaks ?? []
  const d = Math.max(0.01, stemDurationSec)
  const n = peaks.length
  const t0 = Math.max(0, Math.min(sourceInSec, d))
  const t1 = Math.max(t0, Math.min(sourceOutSec, d))
  const i0 = Math.max(0, Math.floor((t0 / d) * (n - 1)))
  const i1 = Math.min(n - 1, Math.ceil((t1 / d) * (n - 1)))
  if (i1 <= i0) return [peaks[i0] ?? 0]
  return peaks.slice(i0, i1 + 1)
}

/** Multiplicador 0..1 según fades en el tramo visible del clip (tiempo proyecto). */
export function clipFadeGainAtProjectTime(
  projectSec: number,
  clipTimelineStartSec: number,
  spanSec: number,
  fadeInSec: number,
  fadeOutSec: number,
): number {
  if (spanSec <= MIN_STEM_CLIP_SPAN_SEC) return 1
  const u = projectSec - clipTimelineStartSec
  if (u < 0 || u > spanSec) return 1
  const fi = Math.max(0, fadeInSec)
  const fo = Math.max(0, fadeOutSec)
  const maxFade = Math.max(MIN_STEM_CLIP_SPAN_SEC, spanSec / 2 - 0.01)
  const fiC = Math.min(fi, maxFade)
  const foC = Math.min(fo, maxFade)
  let g = 1
  if (fiC > 0 && u < fiC) g *= u / fiC
  if (foC > 0 && u > spanSec - foC) g *= Math.max(0, (spanSec - u) / foC)
  return Math.max(0, Math.min(1, g))
}
