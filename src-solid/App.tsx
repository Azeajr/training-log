import { Router, Route } from '@solidjs/router'
import { lazy, Suspense, type ParentProps } from 'solid-js'
import BottomNav from './components/BottomNav'

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

function AppShell(props: ParentProps) {
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
      <BottomNav />
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
    </Router>
  )
}
