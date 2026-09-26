import { createSignal, Index, Show } from 'solid-js'
import type { BandProfile, Exercise, Lift } from '../../types/domain'
import { defaultBandProfile, validBandProfile } from '../../lib/band-loading'
import { db } from '../../db'
import { settings } from '../../store/settings-store'
import Modal from '../modals/Modal'
import Stepper from './Stepper'

/**
 * One dialog, one name for it.
 *
 * The label used to be passed in, and the five call sites spelled it three
 * different ways — `bands`, `EDIT RAW LOAD / BANDS`, and a component default of
 * `BAND / RAW LOAD` that nothing ever reached. "EDIT" was also wrong on a
 * movement with no profile: there is nothing there to edit yet. Deriving it here
 * is what stops the three from drifting apart again, and the only thing the
 * wording still depends on is whether a profile exists.
 */
const entryLabel = (entity: Lift | Exercise): string =>
  entity.bandProfile ? 'BANDS' : 'SET UP BANDS'

export default function BandSettings(props: {
  entity: Lift | Exercise
  kind: 'lift' | 'exercise'
  onSaved?: (profile: BandProfile) => void
}) {
  const [draft, setDraft] = createSignal<BandProfile | null>(null)
  const [busy, setBusy] = createSignal(false)
  const [error, setError] = createSignal('')
  const open = () => {
    const saved = props.entity.bandProfile
    const template = defaultBandProfile(props.entity.name) ?? {
      enabled: false, rawLoad: 0, maxAddedWeight: null, bands: [],
    }
    // A measured calibration prefills the numbers; it never answers the
    // question this dialog exists to ask. `defaultBandProfile` is `enabled:
    // true` because that is the shape a user who opts in ends up with, and
    // handing it straight to the draft re-created the name-matching that
    // `bandProfileFor` was fixed to stop doing — open the dialog on anything
    // spelled like a chin-up, save any unrelated field, and the weight stepper
    // was gone. Only a SAVED profile decides whether the box starts ticked.
    const initial = saved ?? { ...template, enabled: false }
    // One row per band in the equipment, in its order: the inventory says
    // which bands exist and this dialog measures them. A band added there since
    // the last save has no measurement here yet, and starts at none.
    const measured = (name: string) => initial.bands.find(b => b.name === name)?.assistance ?? 0
    setDraft({ ...initial, bands: settings.bands.map(({ name }) => ({ name, assistance: measured(name) })) })
    setError('')
  }
  // Assistance stays fixed as raw load moves, but it can never exceed it: a band
  // that assists more than the movement weighs is a negative load. The measured
  // stepper below already clamps what it DISPLAYS to that bound, and leaving the
  // stored value unclamped meant the two disagreed silently — at raw load 100
  // with 105 of assistance the stepper read 0 while the profile still held 105,
  // so one press of + wrote 99 and moved the real value by six.
  const setRawLoad = (rawLoad: number) => setDraft(p => ({
    ...p!, rawLoad, bands: p!.bands.map(b => ({ ...b, assistance: Math.min(b.assistance, rawLoad) })),
  }))
  const save = async () => {
    const profile = draft()
    if (!profile || busy()) return
    if (!validBandProfile(profile) || props.entity.id == null) {
      setError('These band settings are incomplete. Check the raw load and each band.')
      return
    }
    setBusy(true)
    try {
      const table = props.kind === 'lift' ? db.lifts : db.exercises
      // Stamped here and nowhere else: this is the one path a person
      // saves through, and it is what keeps the boot-time seed undo off it.
      const saved: BandProfile = { ...profile, accepted: true }
      await table.update(props.entity.id, { bandProfile: saved })
      props.onSaved?.(saved)
      setDraft(null)
    } catch { setError('Could not save band settings. Try again.') }
    finally { setBusy(false) }
  }
  return <>
    <button type="button" onClick={open} class="text-accent text-xs py-2" aria-label={`Band settings for ${props.entity.name}`}>{entryLabel(props.entity)}</button>
    <Show when={draft()}>
      <Modal title={`${props.entity.name} bands`} onClose={() => { if (!busy()) setDraft(null) }} busy={busy()} variant="sheet">
        <div class="p-4 flex flex-col gap-4 overflow-y-auto max-h-[80vh]">
          <label><input type="checkbox" checked={draft()!.enabled} onChange={e => setDraft(p => ({ ...p!, enabled: e.currentTarget.checked }))} /> Use raw load and bands</label>
          {/* `emphasized` throughout: this is the largest-jump form in the app.
              Every field starts at 0 for a movement with no template and wants
              a value in the 70–191 range, which is 191 taps or a long press.
              Tapping the value has always opened a numeric keypad; it just
              rendered as a plain readout nobody thought to press. The steps and
              bounds are unchanged — these are measurements, and a 1lb
              correction has to stay one tap. */}
          <div class="flex flex-wrap items-center gap-2">Raw load (lb)
            <Stepper value={draft()!.rawLoad} onChange={setRawLoad} min={0} fieldLabel="raw load" emphasized />
          </div>
          <p class="text-muted text-xs">Raw load is what this movement weighs with no band on — the load you are actually lifting unassisted, not your bodyweight. Each band's measured load below is what it weighs with that band on, at this raw load.</p>
          <p class="text-muted text-xs">Changing raw load keeps each band's assistance fixed. To recalibrate, enter its measured effective load below at the current raw load. Logged sets stay unchanged.</p>
          <p class="text-muted text-xs">Bands stack: put several on a set and their assistance adds up, so measure each band on its own.</p>
          <p class="text-muted text-xs">Which bands you own, and how many, is in Settings › Equipment.</p>
          {/* `Index`, not `For`: every stepper press rebuilds the array, and
              `For` keys on the item, so it would remount the row under the
              finger holding + down. A row is its position in the inventory. */}
          <Index each={draft()!.bands}>{(band, i) => (
            <div class="flex items-center flex-wrap gap-2">
              <span class="uppercase tracking-widest text-xs w-24 break-words">{band().name}</span>
              <span>measured lb</span>
              <Stepper value={Math.max(0, draft()!.rawLoad - band().assistance)} min={0} max={draft()!.rawLoad} fieldLabel={`${band().name} measured load`} emphasized
                onChange={measured => setDraft(p => ({ ...p!, bands: p!.bands.map((b, n) => n === i ? { ...b, assistance: p!.rawLoad - measured } : b) }))} />
              {/* Measured load equal to raw is no assistance: a band that has
                  not been measured on this movement, and is not offered on it. */}
              <Show when={band().assistance === 0}><span class="text-faint text-xs">not measured</span></Show>
            </div>
          )}</Index>
          <label><input type="checkbox" checked={draft()!.maxAddedWeight != null} onChange={e => setDraft(p => ({ ...p!, maxAddedWeight: e.currentTarget.checked ? 0 : null }))} /> Limit suggested added weight</label>
          <Show when={draft()!.maxAddedWeight != null}>
            <Stepper value={draft()!.maxAddedWeight!} onChange={maxAddedWeight => setDraft(p => ({ ...p!, maxAddedWeight }))} step={2.5} min={0} fieldLabel="maximum added weight" emphasized />
          </Show>
          <Show when={error()}><p role="alert">{error()}</p></Show>
          <button type="button" disabled={busy()} onClick={() => void save()} class="border border-accent text-accent p-3 disabled:opacity-40">SAVE BAND SETTINGS</button>
        </div>
      </Modal>
    </Show>
  </>
}
