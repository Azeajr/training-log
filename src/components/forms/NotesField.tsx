import { createSignal, Show } from 'solid-js'
import ToggleChip from '../ui/ToggleChip'

const BULLET = '- '
const INDENT = '  '
const BULLET_RE = /^( *)- (.*)$/

// [indent, content] for a "- "-prefixed line, at any depth; null if not a bullet.
function bulletMatch(line: string): [string, string] | null {
  const m = line.match(BULLET_RE)
  return m ? [m[1], m[2]] : null
}

// The line containing `caret`, as a [start, end) offset pair into `value`.
function lineRange(value: string, caret: number): { start: number; end: number } {
  const start = value.lastIndexOf('\n', caret - 1) + 1
  const nl = value.indexOf('\n', caret)
  return { start, end: nl === -1 ? value.length : nl }
}

interface Props {
  value: string
  onInput: (value: string) => void
  placeholder?: string
  rows?: number
  textareaClass: string
  class?: string
}

// Freeform notes textarea with an optional bullet-list mode: while active,
// Enter continues the "- " prefix onto the next line at the same depth (like
// a normal editor's list toggle), and pressing Enter on an empty bullet
// outdents it — or exits list mode entirely once back at the top level.
// Tab/Shift+Tab indent and outdent the bullet under the caret by 2 spaces per
// level, independent of list mode, so nesting works on any existing bullet
// line. The ← → chips mirror Tab/Shift+Tab for touch keyboards, which have no
// Tab key.
export default function NotesField(props: Props) {
  // eslint-disable-next-line no-unassigned-vars -- Solid `ref={ref}` reassigns at runtime
  let ref: HTMLTextAreaElement | undefined
  const [listMode, setListMode] = createSignal(false)

  const apply = (next: string, caret: number) => {
    if (ref) {
      ref.value = next
      ref.setSelectionRange(caret, caret)
    }
    props.onInput(next)
  }

  const toggleList = () => {
    if (!ref) return
    const caret = ref.selectionStart
    const { start, end } = lineRange(props.value, caret)
    const line = props.value.slice(start, end)
    const m = bulletMatch(line)
    ref.focus()

    if (listMode()) {
      setListMode(false)
      if (m) {
        const [indent, content] = m
        apply(props.value.slice(0, start) + indent + content + props.value.slice(end), Math.max(start, caret - BULLET.length))
      }
      return
    }

    setListMode(true)
    if (!m) {
      apply(props.value.slice(0, start) + BULLET + line + props.value.slice(end), caret + BULLET.length)
    }
  }

  // dir=1 indents one level, dir=-1 outdents (dropping the bullet entirely
  // once already at the top level). No-op on a non-bullet line.
  const retab = (dir: 1 | -1) => {
    if (!ref) return
    const caret = ref.selectionStart
    const { start, end } = lineRange(props.value, caret)
    const m = bulletMatch(props.value.slice(start, end))
    ref.focus()
    if (!m) return
    const [indent, content] = m

    if (dir === 1) {
      apply(props.value.slice(0, start) + indent + INDENT + BULLET + content + props.value.slice(end), caret + INDENT.length)
      return
    }
    if (indent.length >= INDENT.length) {
      apply(props.value.slice(0, start) + indent.slice(INDENT.length) + BULLET + content + props.value.slice(end), Math.max(start, caret - INDENT.length))
    } else {
      setListMode(false)
      apply(props.value.slice(0, start) + indent + content + props.value.slice(end), Math.max(start, caret - BULLET.length))
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!ref) return
    const caret = ref.selectionStart
    const { start, end } = lineRange(props.value, caret)

    if (e.key === 'Tab') {
      if (!bulletMatch(props.value.slice(start, end))) return
      e.preventDefault()
      retab(e.shiftKey ? -1 : 1)
      return
    }

    if (e.key !== 'Enter' || !listMode()) return
    const m = bulletMatch(props.value.slice(start, end))
    e.preventDefault()

    if (m && m[1] === '') {
      // Empty bullet + Enter: outdent one level, or exit list mode at the top.
      const [indent] = m
      if (indent.length === 0) {
        setListMode(false)
        apply(props.value.slice(0, start) + props.value.slice(end), start)
      } else {
        const outdented = indent.slice(INDENT.length) + BULLET
        apply(props.value.slice(0, start) + outdented + props.value.slice(end), start + outdented.length)
      }
      return
    }

    const indent = m ? m[0] : ''
    apply(props.value.slice(0, caret) + '\n' + indent + BULLET + props.value.slice(caret), caret + 1 + indent.length + BULLET.length)
  }

  return (
    <div class={props.class}>
      <div class="flex justify-end gap-2 mb-1">
        <Show when={listMode()}>
          <ToggleChip active={false} onClick={() => retab(-1)}>←</ToggleChip>
          <ToggleChip active={false} onClick={() => retab(1)}>→</ToggleChip>
        </Show>
        <ToggleChip active={listMode()} onClick={toggleList}>• LIST</ToggleChip>
      </div>
      <textarea
        ref={ref}
        value={props.value}
        onInput={e => props.onInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder}
        rows={props.rows ?? 3}
        autocapitalize="off"
        class={props.textareaClass}
      />
    </div>
  )
}
