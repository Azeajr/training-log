import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { seedDatabase } from './db/seed'
import { db } from './db/db'
import { useSettingsStore } from './store/settingsStore'
import { useWorkoutStore } from './store/workoutStore'
import { useSwipeNav } from './hooks/useSwipeNav'
import BottomNav from './components/BottomNav'
import Setup from './screens/Setup'
import Today from './screens/Today'
import Workout from './screens/Workout'
import History from './screens/History'
import HistoryEdit from './screens/HistoryEdit'
import Settings from './screens/Settings'

function AppShell() {
  const activeSession = useWorkoutStore((s) => s.activeSession)
  const { onTouchStart, onTouchEnd } = useSwipeNav()

  return (
    <div className="bg-bg min-h-screen font-mono text-text flex flex-col">
      <main
        className="flex-1 overflow-y-auto pb-20"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Routes>
          <Route path="/" element={<Navigate to={activeSession ? '/workout' : '/today'} replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:sessionId/edit" element={<HistoryEdit />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
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
