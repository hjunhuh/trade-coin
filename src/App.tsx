import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LiveFeed } from '@/components/LiveFeed'
import { ScrollOnNavigate } from '@/components/ScrollOnNavigate'
import { SideNavFrame } from '@/components/SideNav'
import { Toaster } from '@/components/ui/sonner'
import { useUi } from '@/lib/store'
import TradePage from '@/pages/Trade'

const AppLayout = lazy(() => import('@/pages/AppLayout'))
const AccountPage = lazy(() => import('@/pages/Account'))

/** The home screen opens the coin traded last */
function Home() {
  const sym = useUi((s) => s.sym)
  return <Navigate to={`/trade/${sym}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <LiveFeed />
      <ScrollOnNavigate />
      <SideNavFrame>
        <Suspense fallback={<div className="min-h-dvh" />}>
          <Routes>
            <Route path="/trade/:sym" element={<TradePage />} />
            <Route element={<AppLayout />}>
              <Route path="/account" element={<AccountPage />} />
            </Route>
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </SideNavFrame>
      {/* On phones, keep toasts off the equity strip at the top of the trade screen */}
      <Toaster position="top-center" duration={2500} mobileOffset={{ top: 72 }} />
    </BrowserRouter>
  )
}
