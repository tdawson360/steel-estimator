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

  if (!projectId) {
    if (typeof window !== 'undefined') {
      window.location.href = '/projects'
    }
    return null
  }

  const userRole = session?.user?.role || 'PM'
  const userName = `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim()

  return (
    <div className="min-h-screen bg-gray-100">
      <AppHeader />
      <SteelEstimator
        projectId={parseInt(projectId)}
        userRole={userRole}
        userName={userName}
      />
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>}>
      <EstimatorWithParams />
    </Suspense>
  )
}
