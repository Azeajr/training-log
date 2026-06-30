import { Show, For } from 'solid-js'
import Stepper from './Stepper'
import type { ExerciseCategory, PlateMode } from '../../types/domain'
import { EXERCISE_CATEGORIES, CATEGORY_LABEL } from '../../lib/assistance'
import { PLATE_MODE_LABEL, PLATE_MODES } from '../../lib/plate-loading'

interface Props {
  name: string
  onNameChange: (v: string) => void
  increment: number | null
  onIncrementChange: (v: number) => void
  category?: ExerciseCategory
  onCategoryChange?: (v: ExerciseCategory) => void
  plateMode?: PlateMode
  onPlateModeChange?: (v: PlateMode) => void
  implementBase?: number
  onImplementBaseChange?: (v: number) => void
  onSave: () => void
  onCancel: () => void
  fullWidth?: boolean
}

export default function ExerciseEditor(props: Props) {
  return (
    <div class={`flex flex-col gap-2${props.fullWidth ? ' flex-1' : ''}`}>
      <input
        type="text"
        value={props.name}
        onInput={e => props.onNameChange(e.currentTarget.value)}
        onKeyDown={e => { if (e.key === 'Enter') props.onSave(); if (e.key === 'Escape') props.onCancel() }}
        class="bg-surface border border-accent text-text px-2 py-0.5 w-full focus:outline-none text-base font-mono"
        autofocus
      />
      <Show when={props.onCategoryChange}>
        <div class="flex items-center gap-2">
          <span class="text-muted text-xs uppercase tracking-widest w-20">Category</span>
          <select
            value={props.category ?? 'push'}
            onChange={e => props.onCategoryChange!(e.currentTarget.value as ExerciseCategory)}
            class="bg-surface border border-border text-text px-2 py-0.5 text-xs focus:outline-none"
          >
            <For each={EXERCISE_CATEGORIES}>{(c) => (
              <option value={c}>{CATEGORY_LABEL[c]}</option>
            )}</For>
          </select>
        </div>
      </Show>
      <Show when={props.onPlateModeChange}>
        <div class="flex items-center gap-2">
          <span class="text-muted text-xs uppercase tracking-widest w-20">Plates</span>
          <div class="flex gap-1">
            <For each={PLATE_MODES}>
              {m => (
                <button
                  onClick={() => props.onPlateModeChange!(m)}
                  class={`px-2 py-0.5 text-xs border ${(props.plateMode ?? 'none') === m ? 'border-accent text-accent' : 'border-border text-muted'}`}
                >
                  {PLATE_MODE_LABEL[m]}
                </button>
              )}
            </For>
          </div>
        </div>
        <Show when={(props.plateMode ?? 'none') !== 'none' && props.onImplementBaseChange}>
          <div class="flex items-center gap-2">
            <span class="text-muted text-xs uppercase tracking-widest w-20">Base lb</span>
            <Stepper value={props.implementBase ?? 0} onChange={props.onImplementBaseChange!} step={5} min={0} max={200} />
          </div>
        </Show>
      </Show>
      <Show when={props.increment !== null}>
        <div class="flex items-center gap-2">
          <span class="text-muted text-xs uppercase tracking-widest w-20">Increment</span>
          <Stepper value={props.increment!} onChange={props.onIncrementChange} step={2.5} min={0} />
          <span class="text-muted text-xs">lb</span>
        </div>
      </Show>
      <div class="flex gap-3">
        <button onClick={props.onSave} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl font-mono">SAVE</button>
        <button onClick={props.onCancel} class="text-muted text-lg sm:text-xl">cancel</button>
      </div>
    </div>
  )
}
