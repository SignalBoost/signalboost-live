import { analyzePublicUrl } from '@/lib/enterprise/url-intelligence'
import type { EnterpriseApprovalPackage, EnterpriseIntelligenceRequest, EnterpriseWorkspace } from './types'

function schemaLanguage(value?: string) {
  const code = (value || '').toLowerCase().split(/[-_]/)[0]
  return ({ en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian' } as Record<string, string>)[code] || 'English'
}

function creativeSuggestions(workspace: EnterpriseWorkspace): EnterpriseApprovalPackage['creativeSuggestions'] {
  const common = {
    authority: { id: 'authority', title: 'Authority and proof', description: 'Lead with credibility, evidence, and measurable value.', metadata: ['Trust', 'Proof', 'Value'] },
    education: { id: 'education', title: 'Educational narrative', description: 'Teach the problem and solution before presenting the next step.', metadata: ['Education', 'Clarity', 'CTA'] },
    demonstration: { id: 'demonstration', title: 'Workflow demonstration', description: 'Show the product, service, or creator workflow in action.', metadata: ['Demo', 'Process', 'Outcome'] },
    story: { id: 'story', title: 'Story-led direction', description: 'Use a clear narrative to create relevance and emotional connection.', metadata: ['Story', 'Identity', 'Retention'] },
    commerce: { id: 'commerce', title: 'Offer and conversion', description: 'Connect product benefits to a bounded offer and purchase action.', metadata: ['Offer', 'Benefits', 'Conversion'] },
  }
  if (workspace === 'creator' || workspace === 'podcast') return [common.education, common.story, common.demonstration]
  if (workspace === 'store') return [common.commerce, common.demonstration, common.authority]
  return [common.authority, common.demonstration, common.education]
}

export async function buildEnterpriseIntelligence(request: EnterpriseIntelligenceRequest): Promise<EnterpriseApprovalPackage> {
  const intelligence = await analyzePublicUrl(request.sourceUrl)
  const audienceConfidence = intelligence.detected.audiences.length
    ? Math.min(...intelligence.detected.audiences.map((item) => item.confidence))
    : 0

  return {
    workspace: request.workspace,
    sourceUrl: intelligence.finalUrl || intelligence.sourceUrl,
    organization: intelligence.organization || intelligence.title || '',
    description: intelligence.description || '',
    sourceType: intelligence.sourceType,
    classification: {
      industry: intelligence.detected.industry.value,
      audiences: intelligence.detected.audiences.map((item) => item.value),
      region: intelligence.detected.region.value,
      language: schemaLanguage(intelligence.metadata.language),
    },
    campaignPlan: {
      goal: intelligence.detected.goal.value,
      tone: intelligence.detected.tone.value,
      platforms: intelligence.detected.platforms.map((item) => item.value),
      format: intelligence.detected.format.value,
      offerType: intelligence.detected.offerType.value,
      ctaStrategy: intelligence.detected.ctaStrategy.value,
    },
    creativeSuggestions: creativeSuggestions(request.workspace),
    confidence: {
      industry: intelligence.detected.industry.confidence,
      audience: audienceConfidence,
      region: intelligence.detected.region.confidence,
      goal: intelligence.detected.goal.confidence,
      tone: intelligence.detected.tone.confidence,
      format: intelligence.detected.format.confidence,
      offerType: intelligence.detected.offerType.confidence,
      ctaStrategy: intelligence.detected.ctaStrategy.confidence,
    },
    requiresConfirmation: intelligence.requiresConfirmation,
    intelligence,
    approvalRequired: true,
  }
}
