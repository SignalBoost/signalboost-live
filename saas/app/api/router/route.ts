import { NextRequest, NextResponse } from 'next/server'
import { routeUserAction } from '@/lib/action-router'

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json()

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Input is required.' },
        { status: 400 }
      )
    }

    const route = routeUserAction(input)

    return NextResponse.json({
      route,
    })
  } catch (error) {
    console.error('Action router API error:', error)

    return NextResponse.json(
      { error: 'Could not route action.' },
      { status: 500 }
    )
  }
}
