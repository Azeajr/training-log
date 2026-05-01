import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { seedDatabase } from './db/seed'
import { db } from './db/db'
import { useSettingsStore } from './store/settingsStore'
import { useWorkoutStore } from './store/workoutStore'
import BottomNav from './components/BottomNav'
import Setup from './screens/Setup'
import Today from './screens/Today'
import Workout from './screens/Workout'
import History from './screens/History'
import Settings from './screens/Settings'

export default function App() {
  const loadSettings = useSettingsStore((s) => s.load)
  const activeSession = useWorkoutStore((s) => s.activeSession)
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
      <div className="bg-zinc-950 min-h-screen font-mono text-zinc-100">
        <Setup onComplete={() => setSetupComplete(true)} />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div className="bg-zinc-950 min-h-screen font-mono text-zinc-100 flex flex-col">
        <main className="flex-1 overflow-y-auto pb-16">
          <Routes>
            <Route path="/" element={<Navigate to={activeSession ? '/workout' : '/today'} replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/workout" element={<Workout />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <BottomNav />
      </div>
    </BrowserRouter>
  )
}
