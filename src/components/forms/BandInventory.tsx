import { createSignal, Index, Show } from 'solid-js'
import { db } from '../../db'
import { bandNameError, removeBand, renameBand } from '../../lib/band-loading'
import { settings, loadSettings, updateSettings } from '../../store/settings-store'
import { useConfirmation } from '../../hooks/use-confirmation'
import SectionLabel from '../layout/SectionLabel'
import Stepper from './Stepper'

/**
 * The bands you own, and how many of each — equipment, beside the plates.
 *
 * This is the one place band names are made, changed and removed. Each
 * movement's band settings only measure what these assist it by, so a rename or
 * a removal here reaches every movement at once (`renameBand`, `removeBand`).
 * Counts write straight through, the way plate counts do above; a name waits
 * for SAVE, because it is typed.
 */
export default function BandInventory(props: {
  /** Movements' profiles are rewritten by a rename or removal; reload them. */
  onChanged?: () => void
}) {
  const { confirm } = useConfirmation()
  const [renaming, setRenaming] = createSignal<{ from: string; to: string } | null>(null)
  const [adding, setAdding] = createSignal<string | null>(null)
  const [error, setError] = createSignal('')

  const setCount = (name: string, count: number) => void updateSettings({
    bands: settings.bands.map(b => ({ name: b.name, count: b.name === name ? count : b.count })),
  })

  const draftError = (): string | null => {
    const r = renaming()
    if (r) return bandNameError(settings.bands, r.to, r.from)
    const a = adding()
    return a == null ? null : bandNameError(settings.bands, a)
  }

  const afterChange = async () => {
    await loadSettings()
    props.onChanged?.()
  }

  const saveRename = async () => {
    const r = renaming()
    if (!r || draftError()) return
    try {
      await renameBand(db, r.from, r.to)
      setRenaming(null)
      setError('')
      await afterChange()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not rename that band.') }
  }

  const saveAdd = async () => {
    const name = adding()?.trim()
    if (name == null || draftError()) return
    await updateSettings({ bands: [...settings.bands.map(b => ({ ...b })), { name, count: 1 }] })
    setAdding(null)
  }

  const remove = async (name: string) => {
    if (!await confirm(
      `Remove ${name}? Its measured load goes from every movement's band settings. Sets already logged keep it. To put a band aside and keep its measurements, set its count to 0.`,
      { destructive: true, confirmLabel: 'REMOVE' },
    )) return
    try {
      await removeBand(db, name)
      await afterChange()
    } catch { setError('Could not remove that band.') }
  }

  const nameInput = (value: string, onInput: (v: string) => void, label: string) => (
    <input
      type="text"
      value={value}
      autofocus
      onInput={e => onInput(e.currentTarget.value)}
      aria-label={label}
      class="bg-surface border border-border text-text px-2 py-1 text-sm w-40 focus:outline-none focus:border-accent"
    />
  )

  return (
    <div class="mb-6">
      <SectionLabel class="mb-2">BANDS</SectionLabel>
      {/* `Index`: a count press rebuilds `settings.bands`, and `For` would
          remount the row — and the stepper being held — on every step. */}
      <Index each={settings.bands}>{band => (
        <div class="flex items-center gap-3 py-1 border-b border-border-dim flex-wrap">
          <Show when={renaming()?.from === band().name} fallback={<>
            <span class="text-muted w-24 uppercase tracking-widest text-xs break-words">{band().name}</span>
            <Stepper value={band().count} onChange={v => setCount(band().name, v)} step={1} min={0} fieldLabel={`${band().name} count`} />
            <button type="button" onClick={() => { setAdding(null); setRenaming({ from: band().name, to: band().name }) }}
              aria-label={`Rename ${band().name}`} class="text-muted text-xs hover:text-accent">rename</button>
            <button type="button" onClick={() => void remove(band().name)}
              aria-label={`Remove ${band().name}`} class="text-muted text-xs hover:text-danger">remove</button>
          </>}>
            {nameInput(renaming()!.to, to => setRenaming(r => r && { ...r, to }), `new name for ${band().name}`)}
            <button type="button" disabled={draftError() != null} onClick={() => void saveRename()}
              class="text-accent text-xs disabled:opacity-40">SAVE</button>
            <button type="button" onClick={() => setRenaming(null)} class="text-muted text-xs">CANCEL</button>
          </Show>
        </div>
      )}</Index>
      <Show when={adding() != null} fallback={
        <button type="button" onClick={() => { setRenaming(null); setAdding('') }} class="text-accent text-xs py-2">+ ADD BAND</button>
      }>
        <div class="flex items-center gap-3 py-1 flex-wrap">
          {nameInput(adding()!, setAdding, 'new band name')}
          <button type="button" disabled={draftError() != null} onClick={() => void saveAdd()}
            class="text-accent text-xs disabled:opacity-40">ADD</button>
          <button type="button" onClick={() => setAdding(null)} class="text-muted text-xs">CANCEL</button>
        </div>
      </Show>
      {/* Said while typing, not at SAVE. An untouched add is not an error yet. */}
      <Show when={draftError() && (renaming() || adding())}><p role="alert" class="text-warn text-xs">{draftError()}</p></Show>
      <Show when={error()}><p role="alert" class="text-warn text-xs">{error()}</p></Show>
      <p class="text-muted text-xs mt-2">Bands stack, so a stack can use as many of a band as you own. Each movement measures what each band assists it by under its own band settings.</p>
    </div>
  )
}
