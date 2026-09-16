import { Switch, Match, type JSX } from 'solid-js'

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
type State = 'error' | 'loading' | 'empty' | 'list'

// One derived state, rendered as one branch. The ladder used to be three
// independent predicates over a `list()` that collapsed error and loading onto
// the same value — `null` whenever `error` was set OR the query was in flight —
// so an errored sheet rendered the error message AND a permanent "Loading..."
// underneath it, telling the user both that it had failed and that it had not
// finished (F46). A single `State` cannot say two things at once.
const stateOf = (props: Props): State =>
  props.error ? 'error'
    : props.entries === null ? 'loading'
    : props.entries.length === 0 ? 'empty'
    : 'list'

export default function ModalAsyncStates(props: Props) {
  const state = () => stateOf(props)
  return (
    <Switch>
      <Match when={state() === 'error'}>
        <div role="alert" class="text-danger font-mono text-sm p-4">{props.error}</div>
      </Match>
      <Match when={state() === 'loading'}>
        <div class="text-faint text-xs font-mono py-2">Loading...</div>
      </Match>
      <Match when={state() === 'empty'}>
        <div class="text-faint text-xs font-mono py-2">{props.emptyText}</div>
      </Match>
      <Match when={state() === 'list'}>
        {props.children}
      </Match>
    </Switch>
  )
}
