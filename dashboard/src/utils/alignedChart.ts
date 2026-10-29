import type { AlignedBatch, AlignedPoint, TrendPoint } from '../types/dashboard'
import { pmuKey } from './pmu'

/** How many aligned ticks to keep on overview / frame charts. */
export const ALIGNED_CHART_WINDOW = 90

const ALIGNED_PHASOR_FIELDS = [
  { label: 'VA', mag: 'va', angle: 'vaAngle' },
  { label: 'VB', mag: 'vb', angle: 'vbAngle' },
  { label: 'VC', mag: 'vc', angle: 'vcAngle' },
  { label: 'IA', mag: 'ia', angle: 'iaAngle' },
  { label: 'IB', mag: 'ib', angle: 'ibAngle' },
  { label: 'IC', mag: 'ic', angle: 'icAngle' },
] as const

export type AlignedPhasorRow = {
  label: string
  cfgName: string
  magnitude: number
  angleDeg: number
}

/**
 * Chart position for one aligned tick. Sub-millisecond ticks stay apart.
 * Labels still format this as a clock time.
 */
export function alignedChartTs(batch: AlignedBatch): number {
  return typeof batch.tsUs === 'number' && batch.tsUs > 0 ? batch.tsUs / 1000 : batch.ts
}

/**
 * Newest aligned tick, even when every online PMU is missing on it.
 */
export function latestAlignedBatch(
  batches: AlignedBatch[] | undefined,
  _preferPmuNames?: string[],
): AlignedBatch | undefined {
  if (!batches?.length) return undefined
  return batches[batches.length - 1]
}

/** VA–IC mag/angle from one aligned point (same fields as Overview / Analytics trends). */
export function phasorsFromAlignedPoint(point: AlignedPoint | undefined): AlignedPhasorRow[] {
  if (!point) return []
  const out: AlignedPhasorRow[] = []
  for (const f of ALIGNED_PHASOR_FIELDS) {
    const magnitude = point[f.mag]
    const angleDeg = point[f.angle]
    if (typeof magnitude !== 'number' || typeof angleDeg !== 'number') continue
    if (magnitude === 0 && angleDeg === 0) continue
    out.push({ label: f.label, cfgName: f.label, magnitude, angleDeg })
  }
  return out
}

/**
 * Build one chart row per aligned tick for the selected PMUs.
 * Missing PMUs get no value (gap on the chart when connectNulls is false).
 */
export function rowsFromAlignedBatches(
  batches: AlignedBatch[] | undefined,
  pmuNames: string[],
  window = ALIGNED_CHART_WINDOW,
): ({ ts: number } & Record<string, number | undefined>)[] {
  if (!batches?.length || !pmuNames.length) return []

  return batches.slice(-window).map((batch) => {
    const row: { ts: number } & Record<string, number | undefined> = { ts: alignedChartTs(batch) }
    for (const name of pmuNames) {
      const key = pmuKey(name)
      const point = batch.points?.[name]
      if (!point) continue
      row[`${key}__frequency`] = point.frequency
      if (typeof point.frequencyDev === 'number') {
        row[`${key}__frequencyDev`] = point.frequencyDev
      }
      if (typeof point.rocof === 'number') {
        row[`${key}__rocof`] = point.rocof
      }
    }
    return row
  })
}

/**
 * Single-PMU frequency series from aligned ticks (Data Frames page).
 * Gaps stay as holes (no fabricated points).
 */
export function trendFromAlignedBatches(
  batches: AlignedBatch[] | undefined,
  pmuName: string,
  window = ALIGNED_CHART_WINDOW,
): TrendPoint[] {
  if (!batches?.length || !pmuName) return []

  const out: TrendPoint[] = []
  for (const batch of batches.slice(-window)) {
    const point = batch.points?.[pmuName]
    if (!point) {
      out.push({
        ts: alignedChartTs(batch),
        frequency: Number.NaN,
        mw: Number.NaN,
        mvar: Number.NaN,
        rocof: Number.NaN,
      })
      continue
    }
    const analogs = point.analogs ?? {}
    const analogVals = Object.values(analogs)
    out.push({
      ts: alignedChartTs(batch),
      frequency: point.frequency,
      frequencyDev: point.frequencyDev ?? 0,
      rocof: point.rocof ?? 0,
      mw: analogs.Analog1 ?? analogVals[0] ?? 0,
      mvar: analogs.Analog2 ?? analogVals[1] ?? 0,
      va: point.va ?? 0,
      vb: point.vb ?? 0,
      vc: point.vc ?? 0,
      ia: point.ia ?? 0,
      ib: point.ib ?? 0,
      ic: point.ic ?? 0,
    })
  }
  return out
}
