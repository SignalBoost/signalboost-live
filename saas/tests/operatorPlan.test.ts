import { describe, it, expect } from 'vitest'
import { buildPlan } from '@/lib/operator/planner'

describe('operator plan', () => {
  it('returns plain-English summary', async () => {
    const plan = await buildPlan('Make homepage cleaner with stronger CTA button')
    expect(plan.summary.length).toBeGreaterThan(10)
    expect(plan.requiresApproval).toBe(true)
  })
})
