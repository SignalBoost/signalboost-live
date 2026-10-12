// saas/lib/ai/cos/labCustomerProviderCatalog.ts
// Customer LAB provider catalog. Provider identity is data; capabilities say what LAB can actually do with it today.
// Adding a provider = adding a row here (and, for a new protocol, a transport adapter). Nothing else is hard-wired.
//
// training.execute is true ONLY where a training connector exists in this repository:
//   huggingface -> Hugging Face Jobs on the customer's account (labCustomerTraining.ts)
//   together    -> Together AI fine-tuning API (labCustomerProviderTraining.ts)
//   fireworks   -> Fireworks AI supervised fine-tuning API (labCustomerProviderTraining.ts)
// Every other row explains, from that provider's own documentation (checked 2026-10-12), why it cannot train here.
import type { LabCredentialKind } from './labCustomerCredentialVault.ts'

export type LabProviderCapability = 'teacher.generate' | 'training.execute'
export type LabTrainingTransport = 'hf_jobs' | 'together_fine_tunes' | 'fireworks_sft'
export type LabProviderEntry = Readonly<{
  kind: LabCredentialKind
  name: string
  teacherTransport: 'openai_responses' | 'openai_compatible' | 'anthropic_messages' | 'gemini_generate_content'
  defaultEndpoint: string | null
  trainingTransport: LabTrainingTransport | null
  supports: Readonly<Record<LabProviderCapability, boolean>>
  unsupported: Readonly<Partial<Record<LabProviderCapability, string>>>
  keyHelp: string
}>

const TEACHER_ONLY = 'This provider has no customer fine-tuning API. Use it as the teacher; train on Hugging Face, Together AI or Fireworks AI.'

export const LAB_PROVIDER_CATALOG: readonly LabProviderEntry[] = Object.freeze([
  {
    kind: 'huggingface', name: 'Hugging Face', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://router.huggingface.co/v1/chat/completions', trainingTransport: 'hf_jobs',
    supports: { 'teacher.generate': true, 'training.execute': true }, unsupported: {},
    keyHelp: 'huggingface.co → Settings → Access Tokens. Needs write access and Jobs permission (training runs on your account).',
  },
  {
    kind: 'openai', name: 'OpenAI', teacherTransport: 'openai_responses',
    defaultEndpoint: 'https://api.openai.com/v1/responses', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'OpenAI is winding down its fine-tuning platform and no longer accepts new users. Use it as the teacher.' },
    keyHelp: 'platform.openai.com → API keys.',
  },
  {
    kind: 'anthropic', name: 'Anthropic', teacherTransport: 'anthropic_messages',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'The Anthropic API does not train customer models (Claude fine-tuning is offered only through Amazon Bedrock). Use it as the teacher.' },
    keyHelp: 'console.anthropic.com → API Keys.',
  },
  {
    kind: 'gemini', name: 'Google Gemini', teacherTransport: 'gemini_generate_content',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'Google states no Gemini API model supports tuning since May 2025. Use it as the teacher.' },
    keyHelp: 'aistudio.google.com → Get API key.',
  },
  {
    kind: 'xai', name: 'Grok (xAI)', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.x.ai/v1/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': TEACHER_ONLY },
    keyHelp: 'Get a key from the xAI developer console.',
  },
  {
    kind: 'deepseek', name: 'DeepSeek', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.deepseek.com/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': TEACHER_ONLY },
    keyHelp: 'Get a key from DeepSeek API platform.',
  },
  {
    kind: 'qwen', name: 'Qwen (Alibaba Cloud)', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'Alibaba Cloud fine-tuning needs a Model Studio workspace endpoint and has no published per-token API price LAB can reserve against yet. Use it as the teacher.' },
    keyHelp: 'Get a DashScope API key; this preset uses the international endpoint.',
  },
  {
    kind: 'mistral', name: 'Mistral AI', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.mistral.ai/v1/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'Mistral marks its fine-tuning API as deprecated and no longer supported. Use it as the teacher.' },
    keyHelp: 'Get a key from the Mistral AI console.',
  },
  {
    kind: 'groq', name: 'GroqCloud', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.groq.com/openai/v1/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'GroqCloud only hosts LoRA adapters trained elsewhere. Use it as the teacher.' },
    keyHelp: 'Get a key from GroqCloud.',
  },
  {
    kind: 'openrouter', name: 'OpenRouter', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://openrouter.ai/api/v1/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': TEACHER_ONLY },
    keyHelp: 'Get an OpenRouter API key.',
  },
  {
    kind: 'together', name: 'Together AI', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.together.xyz/v1/chat/completions', trainingTransport: 'together_fine_tunes',
    supports: { 'teacher.generate': true, 'training.execute': true }, unsupported: {},
    keyHelp: 'Get a Together AI key. Training runs as a LoRA fine-tuning job on your Together account.',
  },
  {
    kind: 'fireworks', name: 'Fireworks AI', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.fireworks.ai/inference/v1/chat/completions', trainingTransport: 'fireworks_sft',
    supports: { 'teacher.generate': true, 'training.execute': true }, unsupported: {},
    keyHelp: 'Get a Fireworks AI key. Training runs as a LoRA supervised fine-tuning job on your Fireworks account.',
  },
  {
    kind: 'deepinfra', name: 'DeepInfra', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://api.deepinfra.com/v1/openai/chat/completions', trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'DeepInfra only hosts LoRA adapters trained elsewhere. Use it as the teacher.' },
    keyHelp: 'Get a DeepInfra API key.',
  },
  {
    kind: 'openai_compatible', name: 'Other (OpenAI-compatible)', teacherTransport: 'openai_compatible',
    defaultEndpoint: null, trainingTransport: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'Training on custom endpoints is not supported. Use it as the teacher only.' },
    keyHelp: 'Your provider\'s API key plus its https chat-completions URL.',
  },
] as const)

export function providerEntry(kind: string): LabProviderEntry | null {
  return LAB_PROVIDER_CATALOG.find(entry => entry.kind === kind) ?? null
}

/** Base model id shapes each training transport accepts. Hugging Face and Together use org/name; Fireworks uses its resource name. */
const BASE_MODEL_ID: Readonly<Record<LabTrainingTransport, RegExp>> = Object.freeze({
  hf_jobs: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  together_fine_tunes: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  fireworks_sft: /^accounts\/[a-z0-9-]+\/models\/[A-Za-z0-9_.-]+$/,
})
export function isValidBaseModelId(computeKind: string, baseModel: string): boolean {
  const transport = providerEntry(computeKind)?.trainingTransport
  return Boolean(transport && BASE_MODEL_ID[transport].test(String(baseModel ?? '')))
}

/** A custom provider's model list lives next to its chat-completions URL (OpenAI-compatible convention). */
export function customModelsUrl(endpoint: unknown): string | null {
  const match = /^(https:\/\/[^/@\s]+(?:\/[^\s#?]*)?)\/chat\/completions\/?$/.exec(String(endpoint ?? ''))
  return match ? `${match[1]}/models` : null
}

/** A teacher definition shaped for the existing provider-neutral adapters (cosUniversityTeacherAdapters). */
export const CUSTOMER_TEACHER_CREDENTIAL_ENV = 'LAB_CUSTOMER_TEACHER_CREDENTIAL'
export function customerTeacherDefinition(input: { kind: string; model: string; endpoint: string | null }) {
  const entry = providerEntry(input.kind)
  if (!entry || !entry.supports['teacher.generate']) throw new Error('lab_teacher_provider_unsupported')
  const endpoint = input.kind === 'openai_compatible' ? input.endpoint : entry.defaultEndpoint
  if (!endpoint) throw new Error('lab_teacher_endpoint_required')
  const model = String(input.model ?? '').trim()
  if (!model || model.length > 240) throw new Error('lab_teacher_model_required')
  return Object.freeze({
    id: `customer-${entry.kind}`,
    provider: entry.kind,
    transport: entry.teacherTransport,
    model,
    modelEnv: null,
    endpointEnv: null,
    defaultEndpoint: endpoint,
    credentialEnv: CUSTOMER_TEACHER_CREDENTIAL_ENV,
  })
}

export type RunSelection = Readonly<{ teacherKind: string; computeKind: string; baseModel: string; promptCount: number }>
/** Lists everything the requested run cannot do, in plain words. Empty list = supported. */
export function unsupportedSelection(selection: RunSelection): string[] {
  const problems: string[] = []
  const teacher = providerEntry(selection.teacherKind)
  const compute = providerEntry(selection.computeKind)
  if (!teacher) problems.push('Unknown teacher provider.')
  else if (!teacher.supports['teacher.generate']) problems.push(`${teacher.name} cannot be used as a teacher.`)
  if (!compute) problems.push('Unknown training provider.')
  else if (!compute.supports['training.execute']) problems.push(compute.unsupported['training.execute'] ?? `${compute.name} cannot run training.`)
  else if (!isValidBaseModelId(compute.kind, selection.baseModel)) {
    problems.push(compute.trainingTransport === 'fireworks_sft'
      ? 'Base model must be a Fireworks model resource like "accounts/fireworks/models/qwen3-8b".'
      : 'Base model must be a model id like "Qwen/Qwen2.5-0.5B-Instruct".')
  }
  if (selection.promptCount < 20 || selection.promptCount > 128) problems.push('Provide between 20 and 128 training prompts (one per line).')
  return problems
}
