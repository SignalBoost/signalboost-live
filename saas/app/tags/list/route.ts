import { NextResponse } from 'next/server'

const tags = [
  'governed',
  'approval-aware',
  'customer-data',
  'growth-ops',
  'finance',
  'crm',
  'audit',
  'backend-only-secrets',
]

export async function GET() {
  return NextResponse.json({ tags })
}
