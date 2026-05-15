import { createSignal, createContext, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'

export interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export interface ConfirmationRequest {
  message: string
  opts: ConfirmOptions
  resolve: (ok: boolean) => void
}

export interface ConfirmationAPI {
  confirm(message: string, opts?: ConfirmOptions): Promise<boolean>
  pending: Accessor<ConfirmationRequest | null>
  respond(ok: boolean): void
}

export function createConfirmation(): ConfirmationAPI {
  const [pending, setPending] = createSignal<ConfirmationRequest | null>(null)

  const confirm = (message: string, opts?: ConfirmOptions): Promise<boolean> =>
    new Promise(resolve => setPending({ message, opts: opts ?? {}, resolve }))

  const respond = (ok: boolean) => {
    pending()?.resolve(ok)
    setPending(null)
  }

  return { pending, confirm, respond }
}

export const ConfirmationContext = createContext<ConfirmationAPI>()

export function useConfirmation(): ConfirmationAPI {
  const ctx = useContext(ConfirmationContext)
  if (!ctx) throw new Error('useConfirmation must be used within ConfirmationContext.Provider')
  return ctx
}
