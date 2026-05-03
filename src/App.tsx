import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { seedDatabase } from './db/seed'
import { db } from './db/db'
import { useSettingsStore } from './store/settingsStore'
import { useWorkoutStore } from './store/workoutStore'
import { useSwipeNav } from './hooks/useSwipeNav'
import BottomNav from './components/BottomNav'
import Setup from './screens/Setup'
import Today from './screens/Today'
import Workout from './screens/Workout'

const History = lazy(() => import('./screens/History'))
const HistoryEdit = lazy(() => import('./screens/HistoryEdit'))
const Settings = lazy(() => import('./screens/Settings'))

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
        <Suspense>
          <Routes>
            <Route path="/" element={<Navigate to={activeSession ? '/workout' : '/today'} replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/workout" element={<Workout />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:sessionId/edit" element={<HistoryEdit />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)

  useEffect(() => {
    const init = async () => {
      await seedDatabase()
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
