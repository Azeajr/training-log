import { Router, Route, useNavigate, useLocation } from '@solidjs/router'
import { lazy, Suspense, Show, onMount, type ParentProps } from 'solid-js'
import BottomNav from './components/BottomNav'
import { db } from '../src/db/db-v2'

const ScreenFallback = () => (
  <div class="flex items-center justify-center h-full min-h-[50vh] text-text/40 text-sm">
    Loading…
  </div>
)

const Today = lazy(() => import('./screens/Today'))
const Workout = lazy(() => import('./screens/Workout'))
const History = lazy(() => import('./screens/History'))
const HistoryEdit = lazy(() => import('./screens/HistoryEdit'))
const Settings = lazy(() => import('./screens/Settings'))
const Setup = lazy(() => import('./screens/Setup'))

function AppShell(props: ParentProps) {
  const navigate = useNavigate()
  const location = useLocation()

  onMount(async () => {
    if (location.pathname !== '/setup') {
      const count = await db.trainingMaxes.count()
      if (count === 0) navigate('/setup', { replace: true })
    }
  })

  return (
    <div
      class="bg-bg min-h-screen font-mono text-text flex flex-col"
      style={{ 'padding-top': 'env(safe-area-inset-top, 0px)' }}
    >
      <main
        class="flex-1 overflow-y-auto"
        style={{ 'padding-bottom': 'calc(env(safe-area-inset-bottom, 0px) + 3.5rem)' }}
      >
        <Suspense fallback={<ScreenFallback />}>
          {props.children}
        </Suspense>
      </main>
      <Show when={location.pathname !== '/setup'}>
        <BottomNav />
      </Show>
    </div>
  )
}

export default function App() {
  return (
    <Router root={AppShell}>
      <Route path="/" component={Today} />
      <Route path="/today" component={Today} />
      <Route path="/workout" component={Workout} />
      <Route path="/history" component={History} />
      <Route path="/history/:sessionId/edit" component={HistoryEdit} />
      <Route path="/settings" component={Settings} />
      <Route path="/setup" component={Setup} />
    </Router>
  )
}
