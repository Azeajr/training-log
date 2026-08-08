import { Show, type JSX } from 'solid-js'

interface Props {
  error: string | null
  /** null while the query is in flight. */
  entries: unknown[] | null
  emptyText: string
  children: JSX.Element
}

// The sheet-modal state ladder: error → loading → empty → list. Both history
// modals rendered these three <Show> blocks by hand with identical classes.
// Empty-state wording idiom: "No <thing> yet." — match the History screen's
// "No completed sessions yet." rather than inventing a new sentence.
export default function ModalAsyncStates(props: Props) {
  const list = () => (!props.error && props.entries !== null ? props.entries : null)
  return (
    <>
      <Show when={props.error}>
        <div class="text-danger font-mono text-sm p-4">{props.error}</div>
      </Show>
      <Show when={list() === null}>
        <div class="text-faint text-xs font-mono py-2">Loading...</div>
      </Show>
      <Show when={list() !== null && list()!.length === 0}>
        <div class="text-faint text-xs font-mono py-2">{props.emptyText}</div>
      </Show>
      <Show when={list() !== null && list()!.length > 0}>
        {props.children}
      </Show>
    </>
  )
}
