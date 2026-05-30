import { NextResponse } from 'next/server'
import { getStagingModules, stagingDeployment } from '@/lib/deployment/staging'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json({
    status: 'ready',
    ...stagingDeployment,
    modules: getStagingModules(),
  })
}
