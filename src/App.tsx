import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { seedDatabase } from './db/seed'
import { db, dbReady } from './db/db-v2'
import { importFromRawData, retryPendingExport } from './lib/exportImport'
import { useSettingsStore } from './store/settingsStore'
import { useWorkoutStore } from './store/workoutStore'
import { useSwipeNav } from './hooks/useSwipeNav'
import BottomNav from './components/BottomNav'
import Setup from './screens/Setup'

const Today = lazy(() => import('./screens/Today'))
const Workout = lazy(() => import('./screens/Workout'))
const History = lazy(() => import('./screens/History'))
const HistoryEdit = lazy(() => import('./screens/HistoryEdit'))
const Settings = lazy(() => import('./screens/Settings'))

const ScreenFallback = () => (
  <div className="flex items-center justify-center h-full min-h-[50vh] text-text/40 text-sm">
    Loading…
  </div>
)

function AppShell() {
  const activeSession = useWorkoutStore((s) => s.activeSession)
  const { onTouchStart, onTouchEnd } = useSwipeNav()

  return (
    <div
      className="bg-bg min-h-screen font-mono text-text flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <main
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 3.5rem)' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Routes>
          <Route path="/" element={<Navigate to={activeSession ? '/workout' : '/today'} replace />} />
          <Route path="/today" element={<Suspense fallback={<ScreenFallback />}><Today /></Suspense>} />
          <Route path="/workout" element={<Suspense fallback={<ScreenFallback />}><Workout /></Suspense>} />
          <Route path="/history" element={<Suspense fallback={<ScreenFallback />}><History /></Suspense>} />
          <Route path="/history/:sessionId/edit" element={<Suspense fallback={<ScreenFallback />}><HistoryEdit /></Suspense>} />
          <Route path="/settings" element={<Suspense fallback={<ScreenFallback />}><Settings /></Suspense>} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

async function migrateFromDexieIfNeeded() {
  if (localStorage.getItem('sqlite-migrated')) return
  try {
    // Dynamically import old Dexie DB — avoid bundling it if migration already done
    const { TrainingDB } = await import('./db/db')
    const oldDb = new TrainingDB()
    const liftCount = await oldDb.lifts.count()
    if (liftCount > 0) {
      const data = {
        lifts: await oldDb.lifts.toArray(),
        trainingMaxes: await oldDb.trainingMaxes.toArray(),
        accessoryTrainingMaxes: await oldDb.accessoryTrainingMaxes.toArray(),
        cycles: await oldDb.cycles.toArray(),
        sessions: await oldDb.sessions.toArray(),
        sets: await oldDb.sets.toArray(),
        exercises: await oldDb.exercises.toArray(),
        liftAccessories: await oldDb.liftAccessories.toArray(),
        accessorySets: await oldDb.accessorySets.toArray(),
        settings: await oldDb.settings.toArray(),
      }
      await importFromRawData(data)
    }
  } catch {
    // If old Dexie DB unavailable or empty, skip migration
  }
  localStorage.setItem('sqlite-migrated', '1')
}

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    const init = async () => {
      await dbReady
      await migrateFromDexieIfNeeded()

      if (import.meta.env.VITE_DEMO) {
        const isEmpty = (await db.trainingMaxes.count()) === 0
        if (isEmpty) {
          const res = await fetch('/demo-seed.json')
          await importFromRawData(await res.json())
        }
      }
      await seedDatabase()
      void retryPendingExport()
      await loadSettings()
      const tmCount = await db.trainingMaxes.count()
      setSetupComplete(tmCount > 0)
    }
    init()
  }, [])

  if (setupComplete === null) return null

  if (!setupComplete) {
    return (
      <div className="bg-bg min-h-screen font-mono text-text">
        <Setup onComplete={() => setSetupComplete(true)} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
