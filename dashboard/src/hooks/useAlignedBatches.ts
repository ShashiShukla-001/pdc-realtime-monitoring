import { useEffect, useState, useSyncExternalStore } from 'react'
import { getAlignedSnapshot, subscribeAligned } from '../utils/alignedStore'
import type { AlignedBatch } from '../types/dashboard'

/** Latest aligned ticks. Updates on the next animation frame after new samples arrive. */
export function useAlignedBatches() {
  return useSyncExternalStore(subscribeAligned, getAlignedSnapshot, getAlignedSnapshot)
}

/**
 * The same ticks, copied once a second.
 * Line charts use this so they redraw with every sample from that second.
 */
export function useAlignedBatchesEachSecond(): AlignedBatch[] {
  const [batches, setBatches] = useState<AlignedBatch[]>(() => getAlignedSnapshot())

  useEffect(() => {
    setBatches(getAlignedSnapshot())
    const id = window.setInterval(() => {
      setBatches(getAlignedSnapshot())
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  return batches
}
