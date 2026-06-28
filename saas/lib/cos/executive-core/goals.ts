import type { CompanyGoal } from './types'

const now = () => new Date().toISOString()

export function getSignalBoostGoals(): CompanyGoal[] {
  const timestamp = now()

  return [
    {
      id: 'goal_affiliate_growth',
      title: 'Grow qualified affiliate and business leads',
      description: 'Use COS-driven marketing and sales campaigns to generate measurable qualified business opportunities for SignalBoost every week.',
      category: 'growth',
      priority: 'critical',
      status: 'active',
      kpi: 'qualified_opportunities_per_week',
      target: 10,
      current: 0,
      unit: 'opportunities',
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'goal_video_cadence',
      title: 'Operate a recurring AI video marketing cadence',
      description: 'Allow COS to recommend, script, and queue short educational videos that advertise SignalBoost products and services with owner approval.',
      category: 'marketing',
      priority: 'high',
      status: 'active',
      kpi: 'approved_video_campaigns_per_week',
      target: 2,
      current: 0,
      unit: 'videos',
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: 'goal_owner_governance',
      title: 'Keep humans in governance, not repetitive execution',
      description: 'COSA should prepare recommendations, campaigns, scripts, and outreach drafts while keeping publishing, sending, and spending behind approval guardrails.',
      category: 'operations',
      priority: 'high',
      status: 'active',
      kpi: 'pending_items_ready_for_approval',
      target: 5,
      current: 0,
      unit: 'items',
      created_at: timestamp,
      updated_at: timestamp,
    },
  ]
}
