import { render } from 'solid-js/web'
import '../src/index.css'
import App from './App'
import { dbReady } from '../src/db/db-v2'
import { seedDatabase } from '../src/db/seed'

dbReady.then(seedDatabase).then(() => {
  render(() => <App />, document.getElementById('root')!)
})
