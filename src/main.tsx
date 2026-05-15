import { render } from 'solid-js/web'
import './index.css'
import App from './App'
import { dbReady } from './db/index'
import { seedDatabase } from './db/seed'
import { loadSettings } from './store/settings-store'

dbReady
  .then(seedDatabase)
  .then(loadSettings)
  .then(() => {
    const root = document.getElementById('root')!
    root.innerHTML = ''
    render(() => <App />, root)
  })
