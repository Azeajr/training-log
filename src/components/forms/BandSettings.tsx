import { createSignal, Index, Show } from 'solid-js'
import type { BandProfile, Exercise, Lift } from '../../types/domain'
import { BAND_NAMES, defaultBandProfile, validBandProfile } from '../../lib/band-loading'
import { db } from '../../db'
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
      enabled: false, rawLoad: 0, maxAddedWeight: null, bands: BAND_NAMES.map(name => ({ name, assistance: 0 })),
    }
    // A measured calibration prefills the numbers; it never answers the
    // question this dialog exists to ask. `defaultBandProfile` is `enabled:
    // true` because that is the shape a user who opts in ends up with, and
    // handing it straight to the draft re-created the name-matching that
    // `bandProfileFor` was fixed to stop doing — open the dialog on anything
    // spelled like a chin-up, save any unrelated field, and the weight stepper
    // was gone. Only a SAVED profile decides whether the box starts ticked.
    const initial = saved ?? { ...template, enabled: false }
    setDraft({ ...initial, bands: initial.bands.map(b => ({ ...b })) })
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
  const renameBand = (index: number, name: string) =>
    setDraft(p => ({ ...p!, bands: p!.bands.map((b, n) => n === index ? { ...b, name } : b) }))

  const removeBand = (index: number) =>
    setDraft(p => ({ ...p!, bands: p!.bands.filter((_, n) => n !== index) }))

  const addBand = () =>
    setDraft(p => ({ ...p!, bands: [...p!.bands, { name: '', assistance: 0 }] }))

  /**
   * Said in the form rather than at save.
   *
   * A name is the selection key — `BandLoadControls` resolves a recorded set's
   * band by it — so `validBandProfile` already refuses a blank or a duplicate.
   * Refusing at save means typing the whole calibration first and being told
   * afterwards.
   */
  const nameError = (): string | null => {
    const names = draft()?.bands.map(b => b.name.trim()) ?? []
    if (names.some(n => n === '')) return 'Every band needs a name.'
    if (new Set(names).size !== names.length) return 'Two bands cannot share a name.'
    return null
  }

  const save = async () => {
    const profile = draft()
    if (!profile || busy() || nameError()) return
    if (!validBandProfile(profile) || props.entity.id == null) {
      setError('These band settings are incomplete. Check the raw load and each band.')
      return
    }
    setBusy(true)
    try {
      const table = props.kind === 'lift' ? db.lifts : db.exercises
      // Stamped here and nowhere else: this is the one path a person
      // saves through, and it is what keeps the boot-time seed undo off it.
      // Trimmed on the way out: a trailing space is invisible in the input and
      // would make an otherwise-identical name a different selection key.
      const saved: BandProfile = { ...profile, accepted: true, bands: profile.bands.map(b => ({ ...b, name: b.name.trim() })) }
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
          {/* `Index`, not `For`. A row's identity here is its POSITION, not its
              name: `For` keys on the item, so rebuilding the array on every
              keystroke of a rename replaced the row, which remounts the input
              and takes the caret with it mid-word. The model has always allowed
              any name — `BandCalibration.name` is a free string and
              `BandLoadControls` resolves by it — only this form did not. */}
          <Index each={draft()!.bands}>{(band, i) => (
            <div class="flex items-center flex-wrap gap-2">
              <input
                type="text"
                value={band().name}
                onInput={e => renameBand(i, e.currentTarget.value)}
                aria-label={`band ${i + 1} name`}
                class="bg-surface border border-border text-text px-2 py-1 text-sm w-28 focus:outline-none focus:border-accent"
              />
              <span>measured lb</span>
              <Stepper value={Math.max(0, draft()!.rawLoad - band().assistance)} min={0} max={draft()!.rawLoad} fieldLabel={`${band().name.trim() || `band ${i + 1}`} measured load`} emphasized
                onChange={measured => setDraft(p => ({ ...p!, bands: p!.bands.map((b, n) => n === i ? { ...b, assistance: p!.rawLoad - measured } : b) }))} />
              <button type="button" aria-label={`Remove band ${i + 1}`} onClick={() => removeBand(i)} class="text-muted text-xs">remove</button>
            </div>
          )}</Index>
          <button type="button" onClick={addBand} class="text-accent text-xs text-left">+ ADD BAND</button>
          <Show when={nameError()}>{msg => <p role="alert" class="text-warn text-xs">{msg()}</p>}</Show>
          <label><input type="checkbox" checked={draft()!.maxAddedWeight != null} onChange={e => setDraft(p => ({ ...p!, maxAddedWeight: e.currentTarget.checked ? 0 : null }))} /> Limit suggested added weight</label>
          <Show when={draft()!.maxAddedWeight != null}>
            <Stepper value={draft()!.maxAddedWeight!} onChange={maxAddedWeight => setDraft(p => ({ ...p!, maxAddedWeight }))} step={2.5} min={0} fieldLabel="maximum added weight" emphasized />
          </Show>
          <Show when={error()}><p role="alert">{error()}</p></Show>
          <button type="button" disabled={busy() || nameError() != null} onClick={() => void save()} class="border border-accent text-accent p-3 disabled:opacity-40">SAVE BAND SETTINGS</button>
        </div>
      </Modal>
    </Show>
  </>
}
