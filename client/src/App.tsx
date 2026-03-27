import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'

// Lazy-load heavy pages
const EventList = lazy(() => import('@/pages/EventList').then(m => ({ default: m.EventList })))
const EventDetail = lazy(() => import('@/pages/EventDetail').then(m => ({ default: m.EventDetail })))
const MapView = lazy(() => import('@/pages/MapView').then(m => ({ default: m.MapView })))
const NewAnalysis = lazy(() => import('@/pages/NewAnalysis').then(m => ({ default: m.NewAnalysis })))
const Jobs = lazy(() => import('@/pages/Jobs').then(m => ({ default: m.Jobs })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<NewAnalysis />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/events" element={<EventList />} />
              <Route path="/events/:eventId" element={<EventDetail />} />
              <Route path="/map" element={<MapView />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
