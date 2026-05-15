import { createSignal } from 'solid-js'

const [toast, setToast] = createSignal<string | null>(null)
let _t: ReturnType<typeof setTimeout> | null = null

export { toast }

export function showToast(msg: string, ms = 2500) {
  if (_t) clearTimeout(_t)
  setToast(msg)
  _t = setTimeout(() => setToast(null), ms)
}
