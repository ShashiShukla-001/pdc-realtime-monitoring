import type { AlignedBatch } from '../types/dashboard'

/** Line charts draw this whole stretch once a second. */
const WINDOW_MS = 1000
/** Stop the list growing if the rate spikes. */
const CAP = 400

let ring: AlignedBatch[] = []
let snapshot: AlignedBatch[] = ring
const listeners = new Set<() => void>()
let raf = 0

function emit() {
  snapshot = ring.slice()
  listeners.forEach((listener) => listener())
}

function schedule() {
  if (raf) return
  if (typeof requestAnimationFrame !== 'function') {
    emit()
    return
  }
  raf = requestAnimationFrame(() => {
    raf = 0
    emit()
  })
}

function tickKey(batch: AlignedBatch): number {
  return typeof batch.tsUs === 'number' && batch.tsUs > 0 ? batch.tsUs : batch.ts
}

function trimToWindow(newestTs: number) {
  const cutoff = newestTs - WINDOW_MS
  let start = 0
  while (start < ring.length && ring[start].ts < cutoff) start++
  if (ring.length - start > CAP) start = ring.length - CAP
  if (start > 0) ring.splice(0, start)
}

/** Append one aligned tick. Phasor diagrams are told on the next frame. */
export function pushAligned(batch: AlignedBatch) {
  const last = ring[ring.length - 1]
  if (last && tickKey(last) === tickKey(batch)) return
  ring.push(batch)
  trimToWindow(batch.ts)
  schedule()
}

export function resetAligned() {
  ring = []
  schedule()
}

/** Used when the live stream is down and the 1s poll still has the window. */
export function replaceAligned(batches: AlignedBatch[] | undefined) {
  const src = batches ?? []
  const newest = src.length ? src[src.length - 1].ts : undefined
  ring = []
  if (newest != null) {
    const cutoff = newest - WINDOW_MS
    for (const batch of src) {
      if (batch.ts >= cutoff) ring.push(batch)
    }
    if (ring.length > CAP) ring.splice(0, ring.length - CAP)
  }
  schedule()
}

export function subscribeAligned(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getAlignedSnapshot() {
  return snapshot
}
