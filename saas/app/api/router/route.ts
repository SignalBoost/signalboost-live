import { NextRequest, NextResponse } from 'next/server'
import { routeUserAction } from '@/lib/action-router'
import { orchestrate } from '@/lib/orchestration'

export async function POST(req: NextRequest) {
  try {
    const { input, language, tone, brand, projectContext, userId } = await req.json()

    if (!input || typeof input !== 'string') {
      return NextResponse.json(
        { error: 'Input is required.' },
        { status: 400 }
      )
    }

    const route = routeUserAction(input)
    const orchestration = await orchestrate({ input, language, tone, brand, projectContext, userId })

    return NextResponse.json({
      route,
      orchestration,
    })
  } catch (error) {
    console.error('Action router API error:', error)

    return NextResponse.json(
      {
        error: 'Could not route action.',
        fallback: {
          required: true,
          summary: 'The router could not complete automated orchestration.',
          recommendedNextSteps: ['Open the closest matching dashboard module.', 'Retry with a more specific goal.', 'Ask the operator to review the request.'],
        },
      },
      { status: 500 }
    )
  }
}
