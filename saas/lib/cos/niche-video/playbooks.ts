import type { CosSignal } from '../recommendation/types'
import type { NicheVideoStrategyInput, VideoDistributionChannel } from './types'

export type ProductWalkthroughVideoPlaybook = {
  id: string
  title: string
  company_name: string
  product_or_service: string
  niche: string
  target_audience: string
  predicted_need: string
  primary_pain: string
  desired_action: string
  proof_evidence: string[]
  preferred_channels: VideoDistributionChannel[]
}

const preferredChannels: VideoDistributionChannel[] = [
  'long_form_video',
  'short_vertical_video',
  'professional_feed',
  'website_embed',
]

export const PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS: ProductWalkthroughVideoPlaybook[] = [
  {
    id: 'audit-readiness-walkthrough',
    title: 'Show how easy it is to run an audit readiness check',
    company_name: 'SignalBoost',
    product_or_service: 'Audit Cockpit and readiness reports',
    niche: 'small companies that need audit readiness without a full compliance team',
    target_audience: 'owners, managers, consultants, and operators preparing for vendor, client, or internal reviews',
    predicted_need: 'The audience needs a simple way to collect evidence, understand gaps, and produce a clear readiness report.',
    primary_pain: 'audit preparation feels scattered across spreadsheets, screenshots, provider portals, and manual notes',
    desired_action: 'open the Audit Cockpit and run a readiness review from one console',
    proof_evidence: [
      'The console can group readiness checks, evidence, inventory, and reports in one workflow.',
      'A walkthrough video can show the user moving from confusion to a finished report in minutes.',
      'This use case is easy to explain visually because the value appears step by step on screen.',
    ],
    preferred_channels: preferredChannels,
  },
  {
    id: 'cybersecurity-center-walkthrough',
    title: 'Show how a company can check security issues without being technical',
    company_name: 'SignalBoost',
    product_or_service: 'Cybersecurity Center',
    niche: 'businesses that want practical security visibility without hiring a full security team',
    target_audience: 'business owners, startup operators, agencies, and non-technical managers responsible for risk',
    predicted_need: 'The audience needs a simple view of alerts, identity risks, secrets, dependency issues, and remediation steps.',
    primary_pain: 'security feels too technical, fragmented, and hard to prioritize',
    desired_action: 'open the Cybersecurity Center and review the highest-priority findings first',
    proof_evidence: [
      'The console can turn technical findings into a readable alert inbox and remediation plan.',
      'A product walkthrough can show that the business owner does not need to understand every technical detail to make a safer decision.',
      'The strongest message is confidence: know what matters, approve fixes, and track progress.',
    ],
    preferred_channels: preferredChannels,
  },
  {
    id: 'provider-template-setup-walkthrough',
    title: 'Show how provider setup templates save time from one console',
    company_name: 'SignalBoost',
    product_or_service: 'Provider setup templates and console guidance',
    niche: 'companies managing SaaS providers, deployments, billing tools, and data services',
    target_audience: 'small business operators, founders, and teams who need to configure provider settings correctly',
    predicted_need: 'The audience needs a repeatable template-driven way to set provider settings without jumping between dashboards blindly.',
    primary_pain: 'provider setup is repetitive, confusing, and easy to misconfigure when each tool has its own dashboard',
    desired_action: 'use the SignalBoost console template to guide provider setup step by step',
    proof_evidence: [
      'Templates can reduce repeated setup work and make provider pages easier to complete.',
      'A walkthrough can show the console guiding a user through settings instead of leaving them alone inside each provider dashboard.',
      'This is a strong educational video because it shows a before-and-after workflow.',
    ],
    preferred_channels: preferredChannels,
  },
]

export function playbookToNicheVideoInput(playbookId: string): NicheVideoStrategyInput | null {
  const playbook = PRODUCT_WALKTHROUGH_VIDEO_PLAYBOOKS.find((item) => item.id === playbookId)
  if (!playbook) return null

  const observedAt = new Date().toISOString()
  const signal: CosSignal = {
    source: 'cosa_product_video_playbook',
    metric: playbook.id,
    value: playbook.title,
    confidence: 82,
    evidence: playbook.proof_evidence,
    observed_at: observedAt,
  }

  return {
    company_name: playbook.company_name,
    product_or_service: playbook.product_or_service,
    niche: playbook.niche,
    target_audience: playbook.target_audience,
    objective: 'education',
    predicted_need: playbook.predicted_need,
    primary_pain: playbook.primary_pain,
    desired_action: playbook.desired_action,
    languages: ['en', 'es', 'pt'],
    preferred_channels: playbook.preferred_channels,
    signals: [signal],
  }
}
