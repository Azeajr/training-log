import { render } from 'solid-js/web'
import './index.css'
import App from './App'
import { dbReady } from './db/index'
import { seedDatabase } from './db/seed'
import { loadSettings, applyTheme } from './store/settings-store'
import { settings } from './store/settings-store'
import { setupWorkoutPersistence } from './store/workout-store'
import { setupPtRunPersistence } from './store/pt-store'
import { prepareApp } from './startup'
import { StartupError, StorageUnavailable } from './components/StartupScreen'

const root = document.getElementById('root')!
const mount = (ui: () => unknown) => {
  root.innerHTML = ''
  render(ui as never, root)
}

const startApp = () => {
  applyTheme(settings.theme)
  mount(() => {
    setupWorkoutPersistence()
    setupPtRunPersistence()
    return <App />
  })
}

void prepareApp({ dbReady, seed: seedDatabase, loadSettings }).then((result) => {
  if (result.status === 'failed') {
    // Without this the page keeps showing index.html's LOADING forever (F04).
    mount(() => <StartupError error={result.error} onRetry={() => location.reload()} />)
    return
  }
  if (!result.persistent) {
    // In-memory fallback: starting straight into the app would look identical
    // to a healthy launch right up until the data vanished (F02).
    applyTheme(settings.theme)
    mount(() => (
      <StorageUnavailable onRetry={() => location.reload()} onContinue={startApp} />
    ))
    return
  }
  startApp()
})
