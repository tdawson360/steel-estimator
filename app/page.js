'use client'

import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Suspense } from 'react'
import SteelEstimator from '../components/SteelEstimator'
import AppHeader from '../components/AppHeader'

function EstimatorWithParams() {
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const projectId = searchParams.get('projectId')
  // ?takeoffSet=S&takeoffJob=J: arriving from the Drawings page with a takeoff
  // to import; the estimator opens its import preview once the project loads
  const takeoffSet = parseInt(searchParams.get('takeoffSet') || '', 10)
  const takeoffJob = parseInt(searchParams.get('takeoffJob') || '', 10)
  const takeoffSource = takeoffSet > 0 && takeoffJob > 0 ? { setId: takeoffSet, jobId: takeoffJob } : null

  if (!projectId) {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard'
    }
    return null
  }

  const userRole = session?.user?.role || 'PM'
  const userName = `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim()
  const userId = session?.user?.id ?? null

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <AppHeader />
      <SteelEstimator
        projectId={parseInt(projectId)}
        userRole={userRole}
        userName={userName}
        userId={userId}
        takeoffSource={takeoffSource}
      />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400">Loading...</div>}>
      <EstimatorWithParams />
    </Suspense>
  )
}
