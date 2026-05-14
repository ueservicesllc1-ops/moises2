export type TimelineSnapGrid = 'off' | '1/16' | '1/8' | 'beat' | 'bar'

export function beatDurationSec(bpm: number): number {
  const b = Number(bpm)
  if (!Number.isFinite(b)) return 0.5
  return 60 / Math.max(1, b)
}

export function snapStepSec(bpm: number, grid: TimelineSnapGrid): number | null {
  if (grid === 'off') return null
  const beat = beatDurationSec(bpm)
  switch (grid) {
    case 'bar':
      return beat * 4
    case 'beat':
      return beat
    case '1/8':
      return beat / 2
    case '1/16':
      return beat / 4
    default:
      return null
  }
}

/** Alinea t (segundos) al grid más cercano. */
export function snapSecondsToGrid(
  t: number,
  bpm: number,
  grid: TimelineSnapGrid,
): number {
  const step = snapStepSec(bpm, grid)
  if (step == null || step <= 0) return t
  return Math.round(t / step) * step
}

export function clampClipStartSec(value: number, songDuration: number): number {
  const d = Math.max(0.01, songDuration)
  const maxStart = Math.max(0, d - 0.05)
  return Math.max(0, Math.min(value, maxStart))
}
