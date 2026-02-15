'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import SteelEstimator from '../components/SteelEstimator'

function EstimatorWithParams() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId')

  if (!projectId) {
    if (typeof window !== 'undefined') {
      window.location.href = '/projects'
    }
    return null
  }

  return <SteelEstimator projectId={parseInt(projectId)} />
}

export default function Home() {
  return (
    <main>
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen text-gray-500">Loading...</div>}>
        <EstimatorWithParams />
      </Suspense>
    </main>
  )
}
