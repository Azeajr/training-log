import { useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const TABS = ['/today', '/workout', '/history', '/settings']
const MIN_DISTANCE = 50

export function useSwipeNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const start = useRef<{ x: number; y: number } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!start.current) return
    const dx = e.changedTouches[0].clientX - start.current.x
    const dy = e.changedTouches[0].clientY - start.current.y
    start.current = null

    if (Math.abs(dx) < MIN_DISTANCE) return
    // reject if more vertical than horizontal
    if (Math.abs(dy) > Math.abs(dx)) return

    const current = TABS.findIndex(t => location.pathname.startsWith(t))
    if (current === -1) return

    if (dx < 0 && current < TABS.length - 1) navigate(TABS[current + 1])
    else if (dx > 0 && current > 0) navigate(TABS[current - 1])
  }

  return { onTouchStart, onTouchEnd }
}
