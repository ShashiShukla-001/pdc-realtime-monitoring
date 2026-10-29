import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { formatTS, formatTSMs } from '../../utils/format'

export type LivePointRow = { ts: number } & Record<string, number | undefined>

export type LiveSeries = {
  key: string
  name: string
  color: string
  dash?: string
}

export type LiveGuide = {
  y: number
  color: string
  label?: string
}

type Props = {
  rows: LivePointRow[]
  series: LiveSeries[]
  /** Adjust the automatic min/max (for example keep FNOM inside the scale). */
  yBounds?: (min: number, max: number) => [number, number]
  yDigits?: number
  unit?: string
  guides?: LiveGuide[]
  height?: number | string
}

type Tip = { x: number; y: number; title: string; lines: { color: string; text: string }[] }

/**
 * Draws the line in place on one canvas. New samples do not build a new SVG,
 * which is what was running the browser out of memory.
 */
export function LiveLineChart({
  rows,
  series,
  yBounds,
  yDigits = 2,
  unit = '',
  guides = [],
  height = '100%',
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }))
    })
    ro.observe(host)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const pad = { l: 56, r: 10, t: 10, b: 22 }
    const dpr = window.devicePixelRatio || 1
    const width = host.clientWidth
    const heightPx = host.clientHeight
    if (width < 10 || heightPx < 10) return

    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(heightPx * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, heightPx)

    const plotW = width - pad.l - pad.r
    const plotH = heightPx - pad.t - pad.b
    let yMin = Infinity
    let yMax = -Infinity
    for (const row of rows) {
      for (const s of series) {
        const v = row[s.key]
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        if (v < yMin) yMin = v
        if (v > yMax) yMax = v
      }
    }
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
      yMin = 0
      yMax = 1
    }
    if (yMin === yMax) {
      yMin -= 1
      yMax += 1
    }
    if (yBounds) [yMin, yMax] = yBounds(yMin, yMax)
    const ySpan = yMax - yMin || 1

    const t0 = rows[0]?.ts ?? 0
    const t1 = rows[rows.length - 1]?.ts ?? t0 + 1
    const tSpan = t1 - t0 || 1
    const xOf = (ts: number) => pad.l + ((ts - t0) / tSpan) * plotW
    const yOf = (v: number) => pad.t + (1 - (v - yMin) / ySpan) * plotH

    ctx.strokeStyle = 'rgba(226, 232, 240, 0.22)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (plotH * i) / 4
      ctx.beginPath()
      ctx.moveTo(pad.l, y)
      ctx.lineTo(pad.l + plotW, y)
      ctx.stroke()
    }
    ctx.setLineDash([])

    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 4; i++) {
      const v = yMax - (ySpan * i) / 4
      const y = pad.t + (plotH * i) / 4
      ctx.fillText(v.toFixed(yDigits), pad.l - 6, y)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const xTicks = 4
    for (let i = 0; i <= xTicks; i++) {
      const ts = t0 + (tSpan * i) / xTicks
      ctx.fillText(rows.length ? formatTS(ts) : '', pad.l + (plotW * i) / xTicks, pad.t + plotH + 6)
    }

    for (const guide of guides) {
      const y = yOf(guide.y)
      ctx.strokeStyle = guide.color
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(pad.l, y)
      ctx.lineTo(pad.l + plotW, y)
      ctx.stroke()
      ctx.setLineDash([])
      if (guide.label) {
        ctx.fillStyle = guide.color
        ctx.textAlign = 'left'
        ctx.fillText(guide.label, pad.l + 4, y - 12)
      }
    }

    for (const s of series) {
      ctx.strokeStyle = s.color
      ctx.lineWidth = 1.75
      ctx.setLineDash(s.dash ? s.dash.split(/\s+/).map(Number) : [])
      ctx.beginPath()
      let pen = false
      for (const row of rows) {
        const v = row[s.key]
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          pen = false
          continue
        }
        const x = xOf(row.ts)
        const y = yOf(v)
        if (!pen) {
          ctx.moveTo(x, y)
          pen = true
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }
    ctx.setLineDash([])
  }, [rows, series, yBounds, yDigits, guides, box])

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const host = hostRef.current
    if (!host || rows.length < 1) {
      setTip(null)
      return
    }
    const rect = host.getBoundingClientRect()
    const padL = 56
    const padR = 10
    const x = event.clientX - rect.left - padL
    const plotW = rect.width - padL - padR
    if (plotW <= 0) return
    const t0 = rows[0].ts
    const t1 = rows[rows.length - 1].ts
    const ts = t0 + (Math.min(Math.max(x, 0), plotW) / plotW) * ((t1 - t0) || 1)
    let nearest = rows[0]
    let best = Infinity
    for (const row of rows) {
      const d = Math.abs(row.ts - ts)
      if (d < best) {
        best = d
        nearest = row
      }
    }
    const lines = series
      .map((s) => {
        const v = nearest[s.key]
        if (typeof v !== 'number' || !Number.isFinite(v)) return null
        return { color: s.color, text: `${s.name}  ${v.toFixed(yDigits)}${unit ? ` ${unit}` : ''}` }
      })
      .filter((line): line is { color: string; text: string } => line != null)
    setTip({
      x: event.clientX - rect.left + 12,
      y: event.clientY - rect.top + 12,
      title: formatTSMs(nearest.ts),
      lines,
    })
  }

  return (
    <div
      ref={hostRef}
      style={{ position: 'relative', width: '100%', height }}
      onMouseMove={onMove}
      onMouseLeave={() => setTip(null)}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {tip && tip.lines.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: tip.x,
            top: tip.y,
            pointerEvents: 'none',
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#e2e8f0',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            borderRadius: 6,
            padding: '6px 8px',
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            zIndex: 2,
          }}
        >
          <div style={{ marginBottom: 4 }}>{tip.title}</div>
          {tip.lines.map((line) => (
            <div key={line.text} style={{ color: line.color }}>
              {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
