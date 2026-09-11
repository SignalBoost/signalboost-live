import { NextResponse } from 'next/server'
import { getStagingModules, stagingDeployment } from '@/lib/deployment/staging'

export const dynamic = 'force-dynamic'

export function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  return NextResponse.json(
    {
      status: 'ready',
      ...stagingDeployment,
      modules: getStagingModules(),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
