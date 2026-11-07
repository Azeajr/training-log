import { Router, Route, useNavigate, useLocation } from '@solidjs/router'
import { lazy, Suspense, Show, createEffect, createSignal, on, onMount, onCleanup, type ParentProps } from 'solid-js'
import { createConfirmation, ConfirmationContext } from './hooks/use-confirmation'
import BottomNav from './components/layout/BottomNav'
import LayoutCapture from './components/layout/LayoutCapture'
import Toast from './components/layout/Toast'
import ConfirmationDialog from './components/modals/ConfirmationDialog'
import { db } from './db/index'
import { hasTrainingMaxes, refreshTrainingMaxPresence } from './lib/training-max'

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
const PT = lazy(() => import('./screens/PT'))
const PtRoutineEdit = lazy(() => import('./screens/PtRoutineEdit'))
const PtRun = lazy(() => import('./screens/PtRun'))

function AppShell(props: ParentProps) {
  const navigate = useNavigate()
  const location = useLocation()

  // If the user lands anywhere with no training maxes — e.g. bailed out of
  // onboarding via IMPORT INSTEAD without finishing — bounce them back to the
  // setup wizard.
  //
  // The check still re-runs after that first landing, but on a signal rather
  // than a fresh `db.trainingMaxes.count()` per navigation: the answer only
  // changes where a TM is written or an import wipes the table, and those places
  // now say so. `null` is "not yet determined" — hold, don't redirect, or a slow
  // OPFS boot would throw a set-up user into onboarding.
  void refreshTrainingMaxPresence(db)
  createEffect(() => {
    if (location.pathname === '/setup') return
    if (hasTrainingMaxes() === false) navigate('/setup', { replace: true })
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

  // The screen scrolls inside <main>; the document never does. iOS 27 was
  // caught reporting a zero-height visual viewport (visualViewport.height 0,
  // innerHeight 812), and WebKit only drags the layout viewport — the box
  // every `fixed` bar is placed in — once the visual viewport crosses its edge.
  // A zero-height one can travel a whole screen first, so with the document as
  // the scroller the nav and session bar rode up the page and off the top.
  // A root with nothing to scroll gives the viewport nowhere to go, whatever
  // state WebKit is in. COMMON_MISTAKES #13.
  //
  // The router still resets scroll on navigation, but it resets the window's,
  // which is now always 0. Do it for <main> instead.
  // eslint-disable-next-line no-unassigned-vars -- Solid `ref={mainEl}` reassigns at runtime
  let mainEl: HTMLElement | undefined
  createEffect(on(() => location.pathname, () => {
    if (mainEl) mainEl.scrollTop = 0
  }, { defer: true }))

  return (
    // No `user-select: none` and no contextmenu block here: both used to be set
    // on this root and applied to the whole app, including notes, weights, and
    // exercise names. Selection suppression now lives in index.css scoped to
    // buttons/nav/labels, and long-press on a control is handled by the
    // `-webkit-touch-callout: none` in that same rule — so copy/paste and the
    // native context menu work on the user's own data again.
    <div
      class="fixed inset-0 bg-bg font-mono text-text flex flex-col"
      style={{ 'padding-top': 'env(safe-area-inset-top, 0px)' }}
    >
      <main
        ref={mainEl}
        data-layout-anchor="main"
        class="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        style={{ 'padding-bottom': 'var(--nav-h)' }}
      >
        <Suspense fallback={<ScreenFallback />}>
          {props.children}
        </Suspense>
      </main>
      <LayoutCapture />
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
        {/* `/pt/new` before the dynamic sibling: it is the routine builder with
            no routine yet, and must not be read as a routine id. */}
        <Route path="/pt" component={PT} />
        <Route path="/pt/new" component={PtRoutineEdit} />
        <Route path="/pt/run" component={PtRun} />
        <Route path="/pt/:routineId/edit" component={PtRoutineEdit} />
        <Route path="/pt/:routineId/run" component={PtRun} />
        <Route path="/settings" component={Settings} />
        <Route path="/setup" component={Setup} />
      </Router>
      <ConfirmationDialog />
    </ConfirmationContext.Provider>
  )
}
