import { For, Show } from 'solid-js'

interface BulletLine { depth: number; text: string }
type Block = { kind: 'list'; items: BulletLine[] } | { kind: 'text'; lines: string[] }
interface BulletNode { text: string; children: BulletNode[] }

const BULLET_RE = /^( *)- (.*)$/

// Groups consecutive "- "-prefixed lines (any depth, 2 spaces per level) into
// a list block and renders the rest as plain lines — the read-side
// counterpart to NotesField's list mode + Tab/Shift+Tab nesting.
function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.split('\n')) {
    const m = raw.match(BULLET_RE)
    const last = blocks[blocks.length - 1]
    if (m) {
      const item = { depth: Math.floor(m[1].length / 2), text: m[2] }
      if (last?.kind === 'list') last.items.push(item)
      else blocks.push({ kind: 'list', items: [item] })
    } else if (last?.kind === 'text') {
      last.lines.push(raw)
    } else {
      blocks.push({ kind: 'text', lines: [raw] })
    }
  }
  return blocks
}

// Flat depth-tagged lines -> a tree, so nested bullets render as real nested
// <ul> elements rather than just visually-indented siblings.
function buildTree(items: BulletLine[]): BulletNode[] {
  const root: BulletNode[] = []
  const stack: { depth: number; node: BulletNode }[] = []
  for (const item of items) {
    const node: BulletNode = { text: item.text, children: [] }
    while (stack.length && stack[stack.length - 1].depth >= item.depth) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.node.children.push(node)
    else root.push(node)
    stack.push({ depth: item.depth, node })
  }
  return root
}

function BulletList(props: { nodes: BulletNode[] }) {
  return (
    <ul class="list-disc pl-4">
      <For each={props.nodes}>
        {n => (
          <li>
            {n.text}
            <Show when={n.children.length > 0}>
              <BulletList nodes={n.children} />
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

export default function NotesText(props: { text: string; class?: string }) {
  return (
    <div class={props.class}>
      <For each={toBlocks(props.text)}>
        {block => block.kind === 'list' ? (
          <BulletList nodes={buildTree(block.items)} />
        ) : (
          // nbsp, not a plain space: whitespace-only text collapses to a
          // 0-height div and blank lines between paragraphs would vanish
          <For each={block.lines}>{l => <div>{l || '\u00A0'}</div>}</For>
        )}
      </For>
    </div>
  )
}
