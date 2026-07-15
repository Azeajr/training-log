import { Router, Route, useNavigate, useLocation } from '@solidjs/router'
import { lazy, Suspense, Show, createEffect, createSignal, onMount, onCleanup, type ParentProps } from 'solid-js'
import { createConfirmation, ConfirmationContext } from './hooks/use-confirmation'
import BottomNav from './components/layout/BottomNav'
import Toast from './components/layout/Toast'
import ConfirmationDialog from './components/modals/ConfirmationDialog'
import { db } from './db/index'

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
const Stats = lazy(() => import('./screens/Stats'))

function AppShell(props: ParentProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // Re-checked on every navigation, not just first mount: if the user lands
  // anywhere with no training maxes — e.g. bailed out of onboarding via IMPORT
  // INSTEAD without finishing — bounce them back to the setup wizard.
  createEffect(() => {
    if (location.pathname === '/setup') return
    void (async () => {
      const count = await db.trainingMaxes.count()
      if (count === 0) navigate('/setup', { replace: true })
    })()
  })

  // Restoring a tab from the browser's back/forward cache repaints the whole
  // page in one visible blip (default background before the theme reasserts
  // itself). `pageshow`'s `persisted` flag is the precise signal for that
  // restore — unlike `visibilitychange`, which also fires on ordinary
  // app-switches where there's no repaint to mask. Hold an opaque veil for
  // one restored frame to cover the blip.
  const [restoring, setRestoring] = createSignal(false)
  onMount(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      setRestoring(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setRestoring(false)))
    }
    window.addEventListener('pageshow', onPageShow)
    onCleanup(() => window.removeEventListener('pageshow', onPageShow))
  })

  return (
    <div
      class="bg-bg min-h-screen font-mono text-text flex flex-col"
      style={{ 'padding-top': 'env(safe-area-inset-top, 0px)', 'user-select': 'none', '-webkit-user-select': 'none' }}
      onContextMenu={e => e.preventDefault()}
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
        <Toast />
        <BottomNav />
      </Show>
      <Show when={restoring()}>
        <div class="fixed inset-0 z-[100] bg-bg" />
      </Show>
    </div>
  )
}

export default function App() {
  const confirmation = createConfirmation()

  return (
    <ConfirmationContext.Provider value={confirmation}>
      <Router root={AppShell}>
        <Route path="/" component={Today} />
        <Route path="/today" component={Today} />
        <Route path="/workout" component={Workout} />
        <Route path="/history" component={History} />
        <Route path="/stats" component={Stats} />
        <Route path="/history/:sessionId/edit" component={HistoryEdit} />
        <Route path="/settings" component={Settings} />
        <Route path="/setup" component={Setup} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  )
}
