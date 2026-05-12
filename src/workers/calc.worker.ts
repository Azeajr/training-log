import {
  calcWarmup,
  calcPlatesPerSide,
  calcAmrapTargets,
  estimated1RM,
} from '../lib/calc'
import type { PlateConfig } from '../types/domain'

type CalcMessage =
  | { id: number; fn: 'calcWarmup'; args: Parameters<typeof calcWarmup> }
  | { id: number; fn: 'calcPlatesPerSide'; args: [number, number, PlateConfig[]] }
  | { id: number; fn: 'calcAmrapTargets'; args: Parameters<typeof calcAmrapTargets> }
  | { id: number; fn: 'estimated1RM'; args: Parameters<typeof estimated1RM> }

self.onmessage = (e: MessageEvent<CalcMessage>) => {
  const { id, fn, args } = e.data
  let result: unknown
  switch (fn) {
    case 'calcWarmup':
      result = calcWarmup(...args)
      break
    case 'calcPlatesPerSide':
      result = calcPlatesPerSide(...(args as [number, number, PlateConfig[]]))
      break
    case 'calcAmrapTargets':
      result = calcAmrapTargets(...args)
      break
    case 'estimated1RM':
      result = estimated1RM(...args)
      break
  }
  self.postMessage({ id, result })
}
