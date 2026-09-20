import { createSignal, For, Show } from 'solid-js'
import type { BandProfile, Exercise, Lift } from '../../types/domain'
import { BAND_NAMES, defaultBandProfile, validBandProfile } from '../../lib/band-loading'
import { db } from '../../db'
import Modal from '../modals/Modal'
import Stepper from './Stepper'

export default function BandSettings(props: {
  entity: Lift | Exercise
  kind: 'lift' | 'exercise'
  onSaved?: (profile: BandProfile) => void
  label?: string
}) {
  const [draft, setDraft] = createSignal<BandProfile | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const open = () => {
    const initial = props.entity.bandProfile ?? defaultBandProfile(props.entity.name) ?? {
      enabled: true, rawLoad: 0, maxAddedWeight: null, bands: BAND_NAMES.map(name => ({ name, assistance: 0 })),
    }
    setDraft({ ...initial, bands: initial.bands.map(b => ({ ...b })) })
    setError('')
  }
  const save = async () => {
    const profile = draft()
    if (!profile || !validBandProfile(profile) || props.entity.id == null || busy()) return
    setBusy(true)
    try {
      const table = props.kind === 'lift' ? db.lifts : db.exercises
      await table.update(props.entity.id, { bandProfile: profile })
      props.onSaved?.(profile)
      setDraft(null)
    } catch { setError('Could not save band settings. Try again.') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" onClick={open} class="text-accent text-xs py-2" aria-label={`Band settings for ${props.entity.name}`}>{props.label ?? 'BAND / RAW LOAD'}</button>
    <Show when={draft()}>
      <Modal title={`${props.entity.name} bands`} onClose={() => { if (!busy()) setDraft(null) }} busy={busy()} variant="sheet">
        <div class="p-4 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
          <label><input type="checkbox" checked={draft()!.enabled} onChange={e => setDraft(p => ({ ...p!, enabled: e.currentTarget.checked }))} /> Use raw load and bands</label>
          <div class="flex flex-wrap items-center gap-2">Raw load (lb)
            <Stepper value={draft()!.rawLoad} onChange={rawLoad => setDraft(p => ({ ...p!, rawLoad }))} min={0} fieldLabel="raw load" />
          </div>
          <p class="text-muted text-xs">Changing raw load keeps each band's assistance fixed. To recalibrate, enter its measured effective load below at the current raw load. Logged sets stay unchanged.</p>
          <For each={draft()!.bands.map(b => b.name)}>{name => {
            const band = () => draft()!.bands.find(b => b.name === name)!
            return <div class="flex items-center flex-wrap gap-2">
              <span>{name} measured lb</span>
              <Stepper value={Math.max(0, draft()!.rawLoad - band().assistance)} min={0} max={draft()!.rawLoad} fieldLabel={`${name} measured load`}
                onChange={measured => setDraft(p => ({ ...p!, bands: p!.bands.map(b => b.name === name ? { ...b, assistance: p!.rawLoad - measured } : b) }))} />
            </div>
          }}</For>
          <label><input type="checkbox" checked={draft()!.maxAddedWeight != null} onChange={e => setDraft(p => ({ ...p!, maxAddedWeight: e.currentTarget.checked ? 0 : null }))} /> Limit suggested added weight</label>
          <Show when={draft()!.maxAddedWeight != null}>
            <Stepper value={draft()!.maxAddedWeight!} onChange={maxAddedWeight => setDraft(p => ({ ...p!, maxAddedWeight }))} step={2.5} min={0} fieldLabel="maximum added weight" />
          </Show>
          <Show when={error()}><p role="alert">{error()}</p></Show>
          <button type="button" disabled={busy()} onClick={() => void save()} class="border border-accent text-accent p-3">SAVE BAND SETTINGS</button>
        </div>
      </Modal>
    </Show>
  </>
}
