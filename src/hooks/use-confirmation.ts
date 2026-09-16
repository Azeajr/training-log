import { createSignal, createContext, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'

// Tri-state outcome. Binary callers (the vast majority) only ever see
// 'confirm'/'cancel'; 'secondary' is reachable only when a secondaryLabel is set.
export type ConfirmResult = 'confirm' | 'secondary' | 'cancel'

export interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  // When set, a third (danger-styled) button is shown that resolves 'secondary'.
  secondaryLabel?: string
  destructive?: boolean
}

export interface ConfirmationRequest {
  message: string
  opts: ConfirmOptions
  resolve: (result: ConfirmResult) => void
}

export interface ConfirmationAPI {
  confirm(message: string, opts?: ConfirmOptions): Promise<boolean>
  confirmWithChoice(message: string, opts: ConfirmOptions): Promise<ConfirmResult>
  pending: Accessor<ConfirmationRequest | null>
  respond(result: ConfirmResult): void
}

export function createConfirmation(): ConfirmationAPI {
  const [pending, setPending] = createSignal<ConfirmationRequest | null>(null)

  const confirmWithChoice = (message: string, opts: ConfirmOptions): Promise<ConfirmResult> =>
    new Promise(resolve => {
      // Settle whatever this displaces. There is one slot and no queue, so a
      // second confirm() while one was pending simply wrote over the first
      // request's `resolve` — leaving that promise **permanently unsettled**.
      // Every caller awaits it, so everything after the await never ran: a
      // Settings handler stopped mid-way, an abandon or a skip silently did
      // nothing. Nothing surfaced, because an unsettled promise is not an
      // error (F48).
      //
      // 'cancel' rather than a rejection, and rather than a queue: it is what
      // Escape already means, and it is the honest reading — a confirmation the
      // user never saw has not been agreed to, so every `if (!await confirm)`
      // bails exactly as it would have.
      setPending(prev => {
        prev?.resolve('cancel')
        return { message, opts, resolve }
      })
    })

  // Binary helper: 'confirm' → true, 'cancel' → false. Keeps every existing
  // call site and the two-button dialog path unchanged.
  const confirm = (message: string, opts?: ConfirmOptions): Promise<boolean> =>
    confirmWithChoice(message, opts ?? {}).then(r => r === 'confirm')

  const respond = (result: ConfirmResult) => {
    pending()?.resolve(result)
    setPending(null)
  }

  return { pending, confirm, confirmWithChoice, respond }
}

export const ConfirmationContext = createContext<ConfirmationAPI>()

export function useConfirmation(): ConfirmationAPI {
  const ctx = useContext(ConfirmationContext)
  if (!ctx) throw new Error('useConfirmation must be used within ConfirmationContext.Provider')
  return ctx
}
