// Module-scoped rest-timer worker. Cheap to keep alive across remounts and
// avoids the cost of spinning a new Worker every time the RestTimer mounts.
let timerWorker: Worker | null = null

export function getTimerWorker(): Worker {
  if (!timerWorker) {
    timerWorker = new Worker(
      new URL('../workers/timer.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return timerWorker
}
