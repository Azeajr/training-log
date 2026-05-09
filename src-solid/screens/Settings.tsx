import { createSignal, onMount, For, Show } from 'solid-js'
import { db } from '../../src/db/db-v2'
import type { Lift, Exercise, LiftAccessory } from '../../src/db/db-v2'
import { settings, updateSettings, THEMES, DEFAULT_PLATES } from '../store/settingsStore'
import { exportJson, importJson, exportCsv } from '../../src/lib/exportImport'
import { calcMainSets } from '../../src/lib/calc'
import Rule from '../components/Rule'
import Stepper from '../components/Stepper'

export default function Settings() {
  const [lifts, setLifts] = createSignal<Lift[]>([])
  const [tms, setTms] = createSignal<Record<number, number>>({})
  const [editingTm, setEditingTm] = createSignal<number | null>(null)
  const [tmInput, setTmInput] = createSignal(0)
  const [exercises, setExercises] = createSignal<Exercise[]>([])
  const [liftAccessories, setLiftAccessories] = createSignal<LiftAccessory[]>([])
  const [newExName, setNewExName] = createSignal('')
  const [newExType, setNewExType] = createSignal<'reps' | 'timed' | 'distance'>('reps')
  const [showAddEx, setShowAddEx] = createSignal(false)
  const [archiveConfirm, setArchiveConfirm] = createSignal<number | null>(null)
  const [editingEx, setEditingEx] = createSignal<number | null>(null)
  const [editExName, setEditExName] = createSignal('')
  const [addToLift, setAddToLift] = createSignal<number | null>(null)
  const [addToLiftExId, setAddToLiftExId] = createSignal<number | null>(null)
  const [importConfirm, setImportConfirm] = createSignal(false)
  const [pendingFile, setPendingFile] = createSignal<File | null>(null)
  const [importError, setImportError] = createSignal<string | null>(null)
  let fileInputRef!: HTMLInputElement

  onMount(load)

  async function load() {
    const allLifts = (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
    setLifts(allLifts)
    const tmMap: Record<number, number> = {}
    for (const l of allLifts) {
      const tmsArr = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
      const latest = tmsArr[tmsArr.length - 1]
      if (latest) tmMap[l.id!] = latest.weight
    }
    setTms(tmMap)
    setExercises(await db.exercises.toArray())
    setLiftAccessories(await db.liftAccessories.toArray())
  }

  const handleSaveTm = async (liftId: number) => {
    if (tmInput() <= 0) return
    await db.trainingMaxes.add({ liftId, weight: tmInput(), setAt: new Date() })
    setEditingTm(null)
    setTmInput(0)
    load()
  }

  const handleAddExercise = async () => {
    if (!newExName().trim()) return
    await db.exercises.add({ name: newExName().trim(), type: newExType() })
    setNewExName('')
    setShowAddEx(false)
    load()
  }

  const handleRenameExercise = async (id: number) => {
    if (!editExName().trim()) return
    await db.exercises.update(id, { name: editExName().trim() })
    setEditingEx(null)
    setEditExName('')
    load()
  }

  const handleArchiveExercise = async (id: number) => {
    await db.exercises.update(id, { archived: true })
    await db.liftAccessories.where('exerciseId').equals(id).delete()
    setArchiveConfirm(null)
    load()
  }

  const handleUnarchiveExercise = async (id: number) => {
    await db.exercises.update(id, { archived: false })
    load()
  }

  const handleAddToLift = async (liftId: number, exerciseId: number) => {
    const nextOrder = liftAccessories().filter(la => la.liftId === liftId).length
    await db.liftAccessories.add({ liftId, exerciseId, order: nextOrder })
    setAddToLift(null)
    setAddToLiftExId(null)
    load()
  }

  const handleRemoveFromLift = async (laId: number) => {
    await db.liftAccessories.delete(laId)
    load()
  }

  const handleFileSelected = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    setPendingFile(file)
    setImportConfirm(true)
    setImportError(null)
    e.currentTarget.value = ''
  }

  const handleImportConfirmed = async () => {
    const file = pendingFile()
    if (!file) return
    try {
      await importJson(file)
      setImportConfirm(false)
      setPendingFile(null)
      load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const timerStep = (field: 'restTimer1' | 'restTimer2' | 'restTimerFail', delta: number) => {
    const next = Math.max(30, settings[field] + delta)
    updateSettings({ [field]: next })
  }

  const fmtTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div class="p-4 font-mono text-sm">

      {/* Training Maxes */}
      <div class="mb-6">
        <Rule label="TRAINING MAXES" class="text-muted mb-2" />
        <For each={lifts()}>{(l) => (
          <div class="py-1 border-b border-border-dim">
            <div class="flex items-center gap-3">
              <span class="text-muted w-20 uppercase tracking-widest text-xs">{l.name}</span>
              <Show when={editingTm() === l.id} fallback={
                <>
                  <span class="text-text">{tms()[l.id!] ?? '—'} lb</span>
                  <button
                    onClick={() => { setEditingTm(l.id!); setTmInput(tms()[l.id!] ?? 0) }}
                    class="text-muted text-xs hover:text-accent"
                  >
                    edit
                  </button>
                </>
              }>
                <div class="flex flex-col gap-2 flex-1">
                  <div class="flex items-center gap-2">
                    <Stepper value={tmInput()} onChange={setTmInput} step={5} min={0} />
                    <span class="text-muted text-xs">lb</span>
                  </div>
                  <div class="flex gap-3">
                    <button onClick={() => handleSaveTm(l.id!)} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl font-mono tracking-widest">SAVE</button>
                    <button onClick={() => setEditingTm(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                  </div>
                </div>
              </Show>
            </div>
            <Show when={editingTm() === l.id && tmInput() > 0}>
              <div class="text-faint text-xs font-mono mt-1 ml-24">
                {'W1: ' + calcMainSets(tmInput(), 1).map(s => s.weight).join(' · ') + ' lb'}
              </div>
            </Show>
          </div>
        )}</For>
      </div>

      {/* Rest Timers */}
      <div class="mb-6">
        <Rule label="REST TIMERS" class="text-muted mb-2" />
        <For each={[
          { label: 'First',  field: 'restTimer1'   as const, value: settings.restTimer1 },
          { label: 'Second', field: 'restTimer2'   as const, value: settings.restTimer2 },
          { label: 'Failed', field: 'restTimerFail' as const, value: settings.restTimerFail },
        ]}>{({ label, field, value }) => (
          <div class="flex items-center gap-3 py-1 border-b border-border-dim">
            <span class="text-muted w-16 text-xs uppercase tracking-widest">{label}</span>
            <button onClick={() => timerStep(field, -30)} class="border border-border px-2 py-0.5 text-muted hover:text-text">-</button>
            <span class="text-text w-12 text-center">{fmtTimer(value)}</span>
            <button onClick={() => timerStep(field, 30)} class="border border-border px-2 py-0.5 text-muted hover:text-text">+</button>
          </div>
        )}</For>
      </div>

      {/* Theme */}
      <div class="mb-6">
        <Rule label="THEME" class="text-muted mb-3" />
        <div class="flex gap-4">
          <For each={Object.entries(THEMES) as [string, typeof THEMES[keyof typeof THEMES]][]}>{([key, t]) => (
            <button onClick={() => updateSettings({ theme: key })} class="flex flex-col items-center gap-1.5">
              <div
                class="w-14 h-10 p-1 rounded-sm border-2 flex flex-col gap-1 transition-all"
                style={{
                  'background-color': t.vars['--color-bg'],
                  'border-color': settings.theme === key ? t.vars['--color-accent'] : 'transparent',
                }}
              >
                <div class="flex-1 rounded-sm" style={{ 'background-color': t.vars['--color-surface'] }} />
                <div class="h-1 w-1/2 rounded-full" style={{ 'background-color': t.vars['--color-accent'] }} />
              </div>
              <span
                class="text-xs uppercase tracking-widest"
                style={{ color: settings.theme === key ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >
                {t.label}
              </span>
            </button>
          )}</For>
        </div>
      </div>

      {/* Exercises */}
      <div class="mb-6">
        <Rule label="EXERCISES" class="text-muted mb-2" />

        <For each={lifts()}>{(lift) => {
          const assigned = () => liftAccessories()
            .filter(la => la.liftId === lift.id)
            .sort((a, b) => a.order - b.order)
          const assignedIds = () => new Set(assigned().map(la => la.exerciseId))
          const available = () => exercises().filter(ex => !assignedIds().has(ex.id!) && !ex.archived)
          return (
            <div class="mb-3">
              <div class="text-muted text-xs uppercase tracking-widest mb-1">{lift.name}</div>
              <Show when={assigned().length === 0}>
                <div class="text-faint text-xs pl-2 py-1">no exercises</div>
              </Show>
              <For each={assigned()}>{(la) => {
                const ex = () => exercises().find(e => e.id === la.exerciseId)
                return (
                  <Show when={ex()}>
                    <div class="flex items-center justify-between py-0.5 pl-2 border-b border-border-dim">
                      <Show when={editingEx() === ex()!.id} fallback={
                        <>
                          <span class="text-text text-xs">{ex()!.name}</span>
                          <div class="flex items-center gap-4">
                            <button onClick={() => { setEditingEx(ex()!.id!); setEditExName(ex()!.name) }} class="text-muted text-xs hover:text-accent">edit</button>
                            <button onClick={() => handleRemoveFromLift(la.id!)} class="text-muted text-xs hover:text-danger">del</button>
                          </div>
                        </>
                      }>
                        <div class="flex flex-col gap-2 flex-1">
                          <input
                            type="text"
                            value={editExName()}
                            onInput={e => setEditExName(e.currentTarget.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleRenameExercise(ex()!.id!); if (e.key === 'Escape') setEditingEx(null) }}
                            class="bg-surface border border-accent text-text px-2 py-0.5 w-full focus:outline-none text-base font-mono"
                            autofocus
                          />
                          <div class="flex gap-3">
                            <button onClick={() => handleRenameExercise(ex()!.id!)} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl font-mono">SAVE</button>
                            <button onClick={() => setEditingEx(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </Show>
                )
              }}</For>
              <Show when={addToLift() === lift.id} fallback={
                <Show when={available().length > 0}>
                  <button
                    onClick={() => { setAddToLift(lift.id!); setAddToLiftExId(null) }}
                    class="mt-1 pl-2 text-faint text-lg sm:text-xl hover:text-accent"
                  >
                    + assign
                  </button>
                </Show>
              }>
                <div class="flex flex-col gap-2 mt-1 pl-2">
                  <select
                    value={addToLiftExId() ?? ''}
                    onChange={e => setAddToLiftExId(Number(e.currentTarget.value) || null)}
                    class="bg-surface border border-border text-text px-2 py-0.5 text-xs focus:outline-none w-full"
                  >
                    <option value="">pick exercise</option>
                    <For each={available()}>{(ex) => (
                      <option value={ex.id}>{ex.name}</option>
                    )}</For>
                  </select>
                  <div class="flex gap-3">
                    <button
                      onClick={() => { const id = addToLiftExId(); if (id) handleAddToLift(lift.id!, id) }}
                      disabled={!addToLiftExId()}
                      class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl disabled:border-border disabled:text-muted"
                    >
                      ADD
                    </button>
                    <button onClick={() => { setAddToLift(null); setAddToLiftExId(null) }} class="text-muted text-lg sm:text-xl">cancel</button>
                  </div>
                </div>
              </Show>
            </div>
          )
        }}</For>

        {/* All exercises */}
        <Rule label="ALL EXERCISES" class="text-muted mt-4 mb-2" />
        <For each={exercises().filter(ex => !ex.archived)}>{(ex) => (
          <div class="py-1 border-b border-border-dim">
            <Show when={editingEx() === ex.id} fallback={
              <div class="flex items-center justify-between">
                <span class="text-text">{ex.name}</span>
                <div class="flex items-center gap-4">
                  <Show when={archiveConfirm() === ex.id} fallback={
                    <>
                      <button onClick={() => { setEditingEx(ex.id!); setEditExName(ex.name); setArchiveConfirm(null) }} class="text-muted text-xs hover:text-accent">edit</button>
                      <button onClick={() => { setArchiveConfirm(ex.id!); setEditingEx(null) }} class="text-muted text-xs hover:text-danger">archive</button>
                    </>
                  }>
                    <>
                      <button onClick={() => handleArchiveExercise(ex.id!)} class="border border-danger text-danger px-2 py-1 text-lg sm:text-xl font-mono">ARCHIVE</button>
                      <button onClick={() => setArchiveConfirm(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                    </>
                  </Show>
                </div>
              </div>
            }>
              <div class="flex flex-col gap-2">
                <input
                  type="text"
                  value={editExName()}
                  onInput={e => setEditExName(e.currentTarget.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRenameExercise(ex.id!); if (e.key === 'Escape') setEditingEx(null) }}
                  class="bg-surface border border-accent text-text px-2 py-0.5 w-full focus:outline-none text-base font-mono"
                  autofocus
                />
                <div class="flex gap-3">
                  <button onClick={() => handleRenameExercise(ex.id!)} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl font-mono">SAVE</button>
                  <button onClick={() => setEditingEx(null)} class="text-muted text-lg sm:text-xl">cancel</button>
                </div>
              </div>
            </Show>
          </div>
        )}</For>

        <Show when={exercises().some(ex => ex.archived)}>
          <>
            <Rule label="ARCHIVED" class="text-faint mt-4 mb-2" />
            <For each={exercises().filter(ex => ex.archived)}>{(ex) => (
              <div class="py-1 border-b border-border-dim flex items-center justify-between">
                <span class="text-faint text-sm">{ex.name}</span>
                <button onClick={() => handleUnarchiveExercise(ex.id!)} class="text-muted text-xs hover:text-accent">unarchive</button>
              </div>
            )}</For>
          </>
        </Show>

        <Show when={showAddEx()} fallback={
          <button
            onClick={() => setShowAddEx(true)}
            class="mt-2 border border-border text-muted px-3 py-1 text-lg sm:text-xl hover:border-accent hover:text-accent"
          >
            + ADD EXERCISE
          </button>
        }>
          <div class="flex flex-col gap-2 mt-2">
            <div class="flex gap-2">
              <input
                type="text"
                value={newExName()}
                onInput={e => setNewExName(e.currentTarget.value)}
                placeholder="Exercise name"
                class="bg-surface border border-border text-text px-2 py-1 flex-1 focus:outline-none focus:border-accent"
              />
              <select
                value={newExType()}
                onChange={e => setNewExType(e.currentTarget.value as 'reps' | 'timed' | 'distance')}
                class="bg-surface border border-border text-text px-2 py-1 focus:outline-none"
              >
                <option value="reps">reps</option>
                <option value="timed">timed</option>
                <option value="distance">distance</option>
              </select>
            </div>
            <div class="flex gap-3">
              <button onClick={handleAddExercise} class="border border-accent text-accent px-2 py-1 text-lg sm:text-xl">ADD</button>
              <button onClick={() => setShowAddEx(false)} class="text-muted text-lg sm:text-xl">cancel</button>
            </div>
          </div>
        </Show>
      </div>

      {/* Plates */}
      <div class="mb-6">
        <Rule label="PLATES" class="text-muted mb-2" />
        <div class="flex items-center gap-3 py-1 border-b border-border-dim">
          <span class="text-muted w-20 uppercase tracking-widest text-xs">Bar</span>
          <Stepper value={settings.barWeight} onChange={v => updateSettings({ barWeight: v })} step={2.5} min={10} max={100} />
          <span class="text-muted text-xs">lb</span>
        </div>
        <For each={DEFAULT_PLATES}>{({ weight }) => {
          const plate = () => settings.plates.find(p => p.weight === weight) ?? { weight, count: 0 }
          return (
            <div class="flex items-center gap-3 py-1 border-b border-border-dim">
              <span class="text-muted w-20 text-right font-mono text-xs">{weight} lb</span>
              <Stepper
                value={plate().count}
                onChange={v => {
                  const next = settings.plates.some(p => p.weight === weight)
                    ? settings.plates.map(p => p.weight === weight ? { ...p, count: v } : p)
                    : [...settings.plates, { weight, count: v }]
                  updateSettings({ plates: next })
                }}
                step={1}
                min={0}
              />
            </div>
          )
        }}</For>
      </div>

      {/* Data */}
      <div>
        <Rule label="DATA" class="text-muted mb-3" />
        <div class="flex flex-wrap gap-3 mb-4">
          <button onClick={exportJson} class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent">
            EXPORT JSON
          </button>
          <button onClick={exportCsv} class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent">
            EXPORT CSV
          </button>
          <button
            onClick={() => fileInputRef.click()}
            class="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-warn hover:text-warn"
          >
            IMPORT JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            class="hidden"
            onChange={handleFileSelected}
          />
        </div>

        <Show when={importConfirm()}>
          <div class="border border-warn p-4 mb-4">
            <div class="text-warn text-xs uppercase tracking-widest mb-2">OVERWRITE ALL DATA?</div>
            <div class="text-text-dim text-xs mb-3">
              This will replace all training history with the contents of <span class="text-text">{pendingFile()?.name}</span>. This cannot be undone.
            </div>
            <Show when={importError()}>
              <div class="text-danger text-xs mb-3">{importError()}</div>
            </Show>
            <div class="flex gap-3">
              <button
                onClick={handleImportConfirmed}
                class="border border-warn text-warn px-4 py-2 text-xs uppercase tracking-widest hover:bg-warn hover:text-zinc-900"
              >
                CONFIRM IMPORT
              </button>
              <button
                onClick={() => { setImportConfirm(false); setPendingFile(null); setImportError(null) }}
                class="text-muted text-xs hover:text-text"
              >
                cancel
              </button>
            </div>
          </div>
        </Show>

        <div class="text-faint text-xs leading-relaxed">
          JSON backup restores all history. CSV exports completed sessions for spreadsheets.
        </div>
      </div>
    </div>
  )
}
