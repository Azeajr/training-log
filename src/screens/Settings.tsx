import { useEffect, useRef, useState } from 'react'
import { db } from '../db/db'
import type { Lift, Exercise } from '../db/db'
import { useSettingsStore, THEMES, DEFAULT_PLATES } from '../store/settingsStore'
import { exportJson, importJson, exportCsv } from '../lib/exportImport'
import { calcMainSets } from '../lib/calc'
import Rule from '../components/Rule'
import Stepper from '../components/Stepper'

export default function Settings() {
  const { restTimer1, restTimer2, restTimerFail, theme, barWeight, plates, update } = useSettingsStore()
  const [lifts, setLifts] = useState<Lift[]>([])
  const [tms, setTms] = useState<Record<number, number>>({})
  const [editingTm, setEditingTm] = useState<number | null>(null)
  const [tmInput, setTmInput] = useState(0)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [newExName, setNewExName] = useState('')
  const [newExType, setNewExType] = useState<'reps' | 'timed' | 'distance'>('reps')
  const [showAddEx, setShowAddEx] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [importConfirm, setImportConfirm] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const allLifts = (await db.lifts.toArray()).sort((a, b) => a.order - b.order)
    setLifts(allLifts)
    const tmMap: Record<number, number> = {}
    for (const l of allLifts) {
      const tmsArr = await db.trainingMaxes.where('liftId').equals(l.id!).sortBy('setAt')
      const latest = tmsArr[tmsArr.length - 1]
      if (latest) tmMap[l.id!] = latest.weight
    }
    setTms(tmMap)
    const allEx = await db.exercises.toArray()
    setExercises(allEx)
  }

  const handleSaveTm = async (liftId: number) => {
    if (tmInput <= 0) return
    await db.trainingMaxes.add({ liftId, weight: tmInput, setAt: new Date() })
    setEditingTm(null)
    setTmInput(0)
    load()
  }

  const handleAddExercise = async () => {
    if (!newExName.trim()) return
    await db.exercises.add({ name: newExName.trim(), type: newExType })
    setNewExName('')
    setShowAddEx(false)
    load()
  }

  const handleDeleteExercise = async (id: number) => {
    const used = await db.accessorySets.where('exerciseId').equals(id).count()
    if (used > 0) return
    await db.exercises.delete(id)
    setDeleteConfirm(null)
    load()
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    setImportConfirm(true)
    setImportError(null)
    e.target.value = ''
  }

  const handleImportConfirmed = async () => {
    if (!pendingFile) return
    try {
      await importJson(pendingFile)
      setImportConfirm(false)
      setPendingFile(null)
      load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    }
  }

  const timerStep = (field: 'restTimer1' | 'restTimer2' | 'restTimerFail', delta: number) => {
    const current = { restTimer1, restTimer2, restTimerFail }[field]
    const next = Math.max(30, current + delta)
    update({ [field]: next })
  }

  const fmtTimer = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="p-4 font-mono text-sm">

      {/* Training Maxes */}
      <div className="mb-6">
        <Rule label="TRAINING MAXES" className="text-muted mb-2" />
        {lifts.map(l => (
          <div key={l.id} className="py-1 border-b border-border-dim">
            <div className="flex items-center gap-3">
              <span className="text-muted w-20 uppercase tracking-widest text-xs">{l.name}</span>
              {editingTm === l.id ? (
                <>
                  <Stepper value={tmInput} onChange={setTmInput} step={5} min={0} />
                  <span className="text-muted text-xs">lb</span>
                  <button onClick={() => handleSaveTm(l.id!)} className="text-accent text-xs">SAVE</button>
                  <button onClick={() => setEditingTm(null)} className="text-muted text-xs">cancel</button>
                </>
              ) : (
                <>
                  <span className="text-text">{tms[l.id!] ?? '—'} lb</span>
                  <button
                    onClick={() => { setEditingTm(l.id!); setTmInput(tms[l.id!] ?? 0) }}
                    className="text-muted text-xs hover:text-accent"
                  >
                    edit
                  </button>
                </>
              )}
            </div>
            {editingTm === l.id && tmInput > 0 && (
              <div className="text-faint text-xs font-mono mt-1 ml-24">
                {'W1: ' + calcMainSets(tmInput, 1).map(s => s.weight).join(' · ') + ' lb'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Rest Timers */}
      <div className="mb-6">
        <Rule label="REST TIMERS" className="text-muted mb-2" />
        {(
          [
            { label: 'First', field: 'restTimer1' as const, value: restTimer1 },
            { label: 'Second', field: 'restTimer2' as const, value: restTimer2 },
            { label: 'Failed', field: 'restTimerFail' as const, value: restTimerFail },
          ]
        ).map(({ label, field, value }) => (
          <div key={field} className="flex items-center gap-3 py-1 border-b border-border-dim">
            <span className="text-muted w-16 text-xs uppercase tracking-widest">{label}</span>
            <button onClick={() => timerStep(field, -30)} className="border border-border px-2 py-0.5 text-muted hover:text-text">-</button>
            <span className="text-text w-12 text-center">{fmtTimer(value)}</span>
            <button onClick={() => timerStep(field, 30)} className="border border-border px-2 py-0.5 text-muted hover:text-text">+</button>
          </div>
        ))}
      </div>

      {/* Theme */}
      <div className="mb-6">
        <Rule label="THEME" className="text-muted mb-3" />
        <div className="flex gap-4">
          {(Object.entries(THEMES) as [string, typeof THEMES[keyof typeof THEMES]][]).map(([key, t]) => (
            <button
              key={key}
              onClick={() => update({ theme: key })}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className="w-14 h-10 p-1 rounded-sm border-2 flex flex-col gap-1 transition-all"
                style={{
                  backgroundColor: t.vars['--color-bg'],
                  borderColor: theme === key ? t.vars['--color-accent'] : 'transparent',
                }}
              >
                <div className="flex-1 rounded-sm" style={{ backgroundColor: t.vars['--color-surface'] }} />
                <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: t.vars['--color-accent'] }} />
              </div>
              <span
                className="text-xs uppercase tracking-widest"
                style={{ color: theme === key ? 'var(--color-accent)' : 'var(--color-muted)' }}
              >
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Exercises */}
      <div className="mb-6">
        <Rule label="EXERCISES" className="text-muted mb-2" />
        {exercises.map(ex => (
          <div key={ex.id} className="flex items-center justify-between py-1 border-b border-border-dim">
            <span className="text-text">{ex.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-muted text-xs border border-border-dim px-1">{ex.type}</span>
              {deleteConfirm === ex.id ? (
                <>
                  <button onClick={() => handleDeleteExercise(ex.id!)} className="text-danger text-xs">DELETE</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-muted text-xs">cancel</button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(ex.id!)} className="text-faint text-xs hover:text-danger">✕</button>
              )}
            </div>
          </div>
        ))}
        {showAddEx ? (
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={newExName}
              onChange={e => setNewExName(e.target.value)}
              placeholder="Exercise name"
              className="bg-surface border border-border text-text px-2 py-1 flex-1 focus:outline-none focus:border-accent"
            />
            <select
              value={newExType}
              onChange={e => setNewExType(e.target.value as any)}
              className="bg-surface border border-border text-text px-2 py-1 focus:outline-none"
            >
              <option value="reps">reps</option>
              <option value="timed">timed</option>
              <option value="distance">distance</option>
            </select>
            <button onClick={handleAddExercise} className="border border-accent text-accent px-2 py-1 text-xs">ADD</button>
            <button onClick={() => setShowAddEx(false)} className="text-muted text-xs">cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddEx(true)}
            className="mt-2 border border-border text-muted px-3 py-1 text-xs hover:border-accent hover:text-accent"
          >
            + ADD EXERCISE
          </button>
        )}
      </div>

      {/* Plates */}
      <div className="mb-6">
        <Rule label="PLATES" className="text-muted mb-2" />
        <div className="flex items-center gap-3 py-1 border-b border-border-dim">
          <span className="text-muted w-20 uppercase tracking-widest text-xs">Bar</span>
          <Stepper value={barWeight} onChange={v => update({ barWeight: v })} step={2.5} min={10} max={100} />
          <span className="text-muted text-xs">lb</span>
        </div>
        {DEFAULT_PLATES.map(({ weight }) => {
          const plate = plates.find(p => p.weight === weight) ?? { weight, count: 0 }
          return (
            <div key={weight} className="flex items-center gap-3 py-1 border-b border-border-dim">
              <span className="text-muted w-20 text-right font-mono text-xs">{weight} lb</span>
              <Stepper
                value={plate.count}
                onChange={v => {
                  const next = plates.some(p => p.weight === weight)
                    ? plates.map(p => p.weight === weight ? { ...p, count: v } : p)
                    : [...plates, { weight, count: v }]
                  update({ plates: next })
                }}
                step={1}
                min={0}
              />
            </div>
          )
        })}
      </div>

      {/* Data */}
      <div>
        <Rule label="DATA" className="text-muted mb-3" />
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={exportJson}
            className="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent"
          >
            EXPORT JSON
          </button>
          <button
            onClick={exportCsv}
            className="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-accent hover:text-accent"
          >
            EXPORT CSV
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border border-border px-4 py-2 text-muted text-xs uppercase tracking-widest hover:border-warn hover:text-warn"
          >
            IMPORT JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>

        {importConfirm && (
          <div className="border border-warn p-4 mb-4">
            <div className="text-warn text-xs uppercase tracking-widest mb-2">
              OVERWRITE ALL DATA?
            </div>
            <div className="text-text-dim text-xs mb-3">
              This will replace all training history with the contents of <span className="text-text">{pendingFile?.name}</span>. This cannot be undone.
            </div>
            {importError && (
              <div className="text-danger text-xs mb-3">{importError}</div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleImportConfirmed}
                className="border border-warn text-warn px-4 py-2 text-xs uppercase tracking-widest hover:bg-warn hover:text-zinc-900"
              >
                CONFIRM IMPORT
              </button>
              <button
                onClick={() => { setImportConfirm(false); setPendingFile(null); setImportError(null) }}
                className="text-muted text-xs hover:text-text"
              >
                cancel
              </button>
            </div>
          </div>
        )}

        <div className="text-faint text-xs leading-relaxed">
          JSON backup restores all history. CSV exports completed sessions for spreadsheets.
        </div>
      </div>
    </div>
  )
}
