import { createRestTimer, type RestTimerMessage } from './rest-timer-protocol'

// Entry point only: the protocol lives in rest-timer-protocol.ts so the test
// stub in test-setup.ts can drive the SAME implementation instead of its own
// (F87). Everything here is the Worker plumbing around it.
const timer = createRestTimer(
  (tick) => self.postMessage(tick),
  (beat) => self.postMessage(beat),
)

self.onmessage = (e: MessageEvent<RestTimerMessage>) => timer.handle(e.data)
