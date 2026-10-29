import { useMemo } from 'react'
import { LiveLineChart } from '../charts/LiveLineChart'
import { useAlignedBatchesEachSecond } from '../../hooks/useAlignedBatches'
import { trendFromAlignedBatches } from '../../utils/alignedChart'

type Props = {
  pmuName: string
  fnomHz?: number
}

export function FreqChart({ pmuName, fnomHz = 60 }: Props) {
  const batches = useAlignedBatchesEachSecond()
  const rows = useMemo(
    () =>
      trendFromAlignedBatches(batches, pmuName, batches.length || 1).map((point) => ({
        ts: point.ts,
        frequency: point.frequency,
      })),
    [batches, pmuName],
  )

  return (
    <div className="panel chart-panel">
      <div className="panel-head">
        <div>
          <h3>Frequency</h3>
          <p className="panel-sub">Hz · each aligned tick · FNOM {fnomHz} Hz</p>
        </div>
      </div>
      <div className="chart-wrap small">
        <LiveLineChart
          rows={rows}
          series={[{ key: 'frequency', name: 'Freq (Hz)', color: '#2563eb' }]}
          yDigits={3}
          unit="Hz"
          yBounds={(min, max) => [
            Math.min(Number.isFinite(min) ? min : fnomHz, fnomHz - 0.05),
            Math.max(Number.isFinite(max) ? max : fnomHz, fnomHz + 0.05),
          ]}
          guides={[{ y: fnomHz, color: '#15803d', label: `FNOM ${fnomHz}` }]}
        />
      </div>
    </div>
  )
}
