import { render } from 'solid-js/web'
import './index.css'
import App from './App'
import { dbReady } from './db/index'
import { seedDatabase } from './db/seed'
import { loadSettings, applyTheme } from './store/settings-store'
import { settings } from './store/settings-store'
import { persistWorkoutToStorage } from './store/workout-store'

dbReady
  .then(seedDatabase)
  .then(loadSettings)
  .then(() => {
    applyTheme(settings.theme)
    const root = document.getElementById('root')!
    root.innerHTML = ''
    render(() => {
      persistWorkoutToStorage()
      return <App />
    }, root)
  })
