import type { EnterpriseRole, EnterpriseRoleId } from './types.ts'

const ROLES: readonly EnterpriseRole[] = [
  { roleId: 'ai_sdr', title: 'AI SDR', goalPatterns: ['sql', 'lead', 'meeting', 'prospect'], skillIds: ['find_decision_makers', 'generate_outreach', 'send_approved_outreach', 'book_meeting', 'create_opportunity'], hubIds: ['prospect', 'communication', 'crm'] },
  { roleId: 'ai_marketing_director', title: 'AI Marketing Director', goalPatterns: ['campaign', 'audience', 'conversion', 'roi', 'market'], skillIds: ['generate_outreach', 'optimize_revenue', 'forecast_revenue'], hubIds: ['communication', 'revenue', 'prospect'] },
  { roleId: 'ai_revenue_operations', title: 'AI Revenue Operations', goalPatterns: ['pipeline', 'forecast', 'revenue', 'roi', 'sales cycle'], skillIds: ['forecast_revenue', 'manage_pipeline', 'optimize_revenue'], hubIds: ['revenue', 'crm'] },
  { roleId: 'ai_customer_success', title: 'AI Customer Success', goalPatterns: ['renewal', 'retention', 'customer', 'churn'], skillIds: ['retain_customer', 'forecast_revenue'], hubIds: ['revenue', 'crm', 'communication'] },
  { roleId: 'ai_sales_manager', title: 'AI Sales Manager', goalPatterns: ['sales', 'win rate', 'meeting', 'opportunity', 'quota'], skillIds: ['manage_pipeline', 'forecast_revenue', 'optimize_revenue', 'create_opportunity'], hubIds: ['crm', 'revenue', 'communication'] },
] as const

export function listEnterpriseRoles(): readonly EnterpriseRole[] { return ROLES }
export function getEnterpriseRole(roleId: EnterpriseRoleId): EnterpriseRole { const role=ROLES.find(item=>item.roleId===roleId); if(!role) throw new Error('unknown_enterprise_role'); return role }

export function recommendEnterpriseRoles(text: string): readonly EnterpriseRoleId[] {
  const normalized = text.toLowerCase()
  const scored = ROLES.map(role => ({ roleId: role.roleId, score: role.goalPatterns.reduce((sum, pattern) => sum + (normalized.includes(pattern) ? 1 : 0), 0) }))
    .filter(item => item.score > 0)
    .sort((a,b) => b.score-a.score || a.roleId.localeCompare(b.roleId))
  return scored.length ? scored.map(item=>item.roleId) : ['ai_revenue_operations']
}
