import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router'

/**
 * Shared frame for the screens next to the side rail: the rail stays put, only the content changes.
 * Each screen's sections fade in one after another.
 */
export default function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="flex min-h-dvh flex-col [&>main]:stagger">
      <Suspense fallback={null}>
        {/* A fresh screen per path, so moving between screens fades in too */}
        <Outlet key={pathname} />
      </Suspense>
    </div>
  )
}
