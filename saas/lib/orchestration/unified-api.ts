import { callModel } from '../ai/modelRouter'
import type { AIMode, OrchestrationMemory, OrchestrationModule } from './types'

export type UnifiedAIRequest = {
  module: OrchestrationModule
  mode: AIMode
  input: string
  memory: OrchestrationMemory
}

function deterministicOutput(req: UnifiedAIRequest) {
  return {
    headline: `${req.module.replace(/_/g, ' ')} plan`,
    mode: req.mode,
    language: req.memory.language,
    tone: req.memory.tone,
    summary: `AI-guided ${req.mode.replace(/_/g, ' ')} workflow prepared for: ${req.input}`,
    recommendations: [
      'Confirm the target audience and primary goal.',
      'Generate the first draft with brand and language preferences applied.',
      'Validate quality, compliance, and publish readiness before continuing.',
    ],
  }
}

export async function runUnifiedAI(req: UnifiedAIRequest) {
  const prompt = [
    `Module: ${req.module}`,
    `Mode: ${req.mode}`,
    `Language: ${req.memory.language}`,
    `Tone: ${req.memory.tone}`,
    req.memory.brand ? `Brand: ${req.memory.brand}` : '',
    `User request: ${req.input}`,
    'Return concise JSON with summary, recommendations, and nextStep.',
  ].filter(Boolean).join('\n')

  const text = await callModel({
    modelPreference: 'openai',
    prompt,
    maxTokens: 700,
    systemPrompt: 'You are SignalBoost Orchestrator. Return only JSON for the requested module.',
  })

  if (!text) return deterministicOutput(req)

  try {
    return JSON.parse(text)
  } catch {
    return { ...deterministicOutput(req), modelText: text }
  }
}

export async function processAudio(req: UnifiedAIRequest) { return runUnifiedAI({ ...req, mode: 'audio_enhancement' }) }
export async function processVideo(req: UnifiedAIRequest) { return runUnifiedAI({ ...req, mode: 'video_clipping' }) }
export async function analyzeWebsite(req: UnifiedAIRequest) { return runUnifiedAI({ ...req, mode: 'website_audit' }) }
export async function scoreSEO(req: UnifiedAIRequest) { return runUnifiedAI({ ...req, mode: 'seo' }) }
export async function generateOutreach(req: UnifiedAIRequest) { return runUnifiedAI({ ...req, mode: 'outreach_generation' }) }
export async function generateText(req: UnifiedAIRequest) { return runUnifiedAI(req) }
