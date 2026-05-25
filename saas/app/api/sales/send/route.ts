
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error:
        'Sales email sending is not enabled yet. Draft emails must be reviewed and sent manually.',
    },
    { status: 501 }
  )
}
