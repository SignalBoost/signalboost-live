import { ingestExternalSignals, starterExternalSignals } from '../external-signals'
import { buildMarketingDecision } from '../marketing-decision'
import type { CosReasoningBridgeInput, CosReasoningBridgeOutput } from './types'

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function inferGoal(text: string): CosReasoningBridgeInput['campaign_goal'] {
  const lower = text.toLowerCase()
  if (lower.includes('monetiz') || lower.includes('traffic')) return 'monetization'
  if (lower.includes('demo') || lower.includes('tour')) return 'product_demo'
  if (lower.includes('lead')) return 'lead_generation'
  if (lower.includes('platform')) return 'platform_promo'
  return 'traffic'
}

function inferProduct(text: string) {
  const lower = text.toLowerCase()
  if (lower.includes('audit')) return 'SignalBoost audit and readiness console'
  if (lower.includes('provider') || lower.includes('vercel')) return 'SignalBoost provider visibility console'
  if (lower.includes('review')) return 'SignalBoost review and content generator'
  if (lower.includes('video')) return 'SignalBoost video and creative engine'
  return 'SignalBoost SaaS console'
}

export function buildCosReasoningBridge(input: CosReasoningBridgeInput = {}): CosReasoningBridgeOutput {
  const userText = String(input.user_text || '')
  const surface = input.surface || 'cos'
  const signalInputs = input.external_signals?.length ? input.external_signals : starterExternalSignals()
  const signalIngestion = ingestExternalSignals(signalInputs)
  const campaignGoal = input.campaign_goal || inferGoal(userText)
  const product = input.product_or_service || inferProduct(userText)
  const audience = input.audience || 'small business owners and operators'
  const region = input.region || 'global'

  const marketingDecision = buildMarketingDecision({
    campaign_goal: campaignGoal,
    product_or_service: product,
    audience,
    region,
    signals: signalIngestion.marketing_signals,
  })

  const analogicalPrompt = [
    'Use cross-domain marketing reasoning: compare this request to platform tours, niche shorts, explainer ads, product demos, and conversion funnels.',
    'Do not ask the owner to choose the creative direction unless a policy, budget, or release approval is required.',
    'Treat the statistical decision as the current scoring layer; use the LLM to explain, adapt, and create the strategic story around it.',
  ].join(' ')

  const validationSummary = [
    `Decision confidence: ${marketingDecision.confidence_score}%.`,
    `Recommended hero: ${marketingDecision.recommended_hero}.`,
    `Recommended format: ${marketingDecision.recommended_format}.`,
    `Signals used: ${signalIngestion.marketing_signals.length}.`,
  ].join(' ')

  const formattedContext = [
    'COS REASONING CONTEXT — USE BEFORE ANSWERING',
    `Surface: ${surface}`,
    `Campaign goal: ${campaignGoal}`,
    `Product/service: ${product}`,
    `Audience: ${audience}`,
    `Region: ${region}`,
    '',
    'MINED / INGESTED SIGNALS',
    ...signalIngestion.summary.map(line => `- ${line}`),
    '',
    'MARKETING DECISION',
    `- Hero: ${marketingDecision.recommended_hero}`,
    `- Format: ${marketingDecision.recommended_format}`,
    `- Scene designs: ${marketingDecision.recommended_scene_designs.join(', ')}`,
    `- Confidence: ${marketingDecision.confidence_score}%`,
    `- Prediction: ${marketingDecision.prediction_summary}`,
    '',
    'CREATIVE BRIEF',
    marketingDecision.creative_brief,
    '',
    'TRAFFIC PLAN',
    ...marketingDecision.traffic_plan.map(line => `- ${line}`),
    '',
    'MONETIZATION PLAN',
    ...marketingDecision.monetization_plan.map(line => `- ${line}`),
    '',
    'APPROVAL RULE',
    'COSA may recommend and draft. Human approval is required before final release, external posting, paid distribution, or spending.',
  ].join('\n')

  return {
    id: id('cos_reasoning'),
    surface,
    user_text: userText,
    signal_ingestion: signalIngestion,
    marketing_decision: marketingDecision,
    analogical_reasoning_prompt: analogicalPrompt,
    statistical_validation_summary: validationSummary,
    formatted_context: formattedContext,
    created_at: new Date().toISOString(),
  }
}
