import type {
  calcWarmup,
  calcPlatesPerSide,
  calcAmrapTargets,
  estimated1RM,
} from '../lib/calc'
import type { PlateConfig } from '../types/domain'

let worker: Worker | null = null
const pending = new Map<number, (v: unknown) => void>()
let nextId = 0

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/calc.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      const cb = pending.get(e.data.id)
      if (cb) { cb(e.data.result); pending.delete(e.data.id) }
    }
  }
  return worker
}

function call<T>(fn: string, args: unknown[]): Promise<T> {
  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, resolve as (v: unknown) => void)
    getWorker().postMessage({ id, fn, args })
  })
}

export function useCalcWorker() {
  return {
    calcWarmup: (...args: Parameters<typeof calcWarmup>) =>
      call<ReturnType<typeof calcWarmup>>('calcWarmup', args as unknown[]),
    calcPlatesPerSide: (target: number, bar: number, plates: PlateConfig[]) =>
      call<ReturnType<typeof calcPlatesPerSide>>('calcPlatesPerSide', [target, bar, plates]),
    calcAmrapTargets: (...args: Parameters<typeof calcAmrapTargets>) =>
      call<ReturnType<typeof calcAmrapTargets>>('calcAmrapTargets', args as unknown[]),
    estimated1RM: (...args: Parameters<typeof estimated1RM>) =>
      call<ReturnType<typeof estimated1RM>>('estimated1RM', args as unknown[]),
  }
}
