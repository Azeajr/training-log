import { render } from 'solid-js/web'
import '../src/index.css'
import App from './App'
import { dbReady } from '../src/db/db-v2'
import { seedDatabase } from '../src/db/seed'
import { loadSettings } from './store/settingsStore'

dbReady
  .then(seedDatabase)
  .then(loadSettings)
  .then(() => {
    const root = document.getElementById('root')!
    root.innerHTML = ''
    render(() => <App />, root)
  })
