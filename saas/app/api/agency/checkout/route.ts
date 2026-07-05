import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const selectedBudget = Number(body?.selectedBudget)

  if (!Number.isFinite(selectedBudget) || selectedBudget <= 0) {
    return NextResponse.json({ error: 'selectedBudget must be greater than zero' }, { status: 400 })
  }

  const processingFee = selectedBudget * 0.15
  const totalCharged = selectedBudget + processingFee

  return NextResponse.json({
    selectedBudget,
    processingFee,
    totalCharged,
    currency: 'USD',
    status: 'CHECKOUT_READY',
  })
}
