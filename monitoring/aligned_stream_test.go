package monitoring

import "testing"

func TestPublishAlignedDropsWhenFull(t *testing.T) {
	ch := make(chan alignedStreamEvent, 1)
	conversationBus.mu.Lock()
	conversationBus.alignedSubs[ch] = struct{}{}
	publishAlignedLocked(alignedStreamEvent{batch: AlignedBatch{TS: 1}})
	publishAlignedLocked(alignedStreamEvent{batch: AlignedBatch{TS: 2}})
	delete(conversationBus.alignedSubs, ch)
	conversationBus.mu.Unlock()

	got := <-ch
	if got.batch.TS != 1 {
		t.Fatalf("first tick = %d, want 1", got.batch.TS)
	}
	select {
	case extra := <-ch:
		t.Fatalf("full channel should drop the second tick, got ts=%d", extra.batch.TS)
	default:
	}
}
