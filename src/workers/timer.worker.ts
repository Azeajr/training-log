let intervalId: ReturnType<typeof setInterval> | null = null
let restStartedAt: number | null = null
let paused = false

function startTicking() {
  if (intervalId) clearInterval(intervalId)
  intervalId = setInterval(() => {
    if (restStartedAt != null && !paused) {
      self.postMessage({ elapsed: Math.floor((Date.now() - restStartedAt) / 1000) })
    }
  }, 1000)
}

self.onmessage = (e: MessageEvent<{ type: 'start'; restStartedAt: number } | { type: 'stop' } | { type: 'pause' } | { type: 'resume' }>) => {
  const msg = e.data
  switch (msg.type) {
    case 'start':
      restStartedAt = msg.restStartedAt
      paused = false
      startTicking()
      break
    case 'stop':
      if (intervalId) { clearInterval(intervalId); intervalId = null }
      restStartedAt = null
      break
    case 'pause':
      paused = true
      break
    case 'resume':
      paused = false
      break
  }
}
