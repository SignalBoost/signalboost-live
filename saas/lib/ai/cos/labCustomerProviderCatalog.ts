// Customer LAB provider catalog. Provider identity is data; capabilities say what LAB can actually do with it today.
// Adding a provider = adding a row here (and, for a new protocol, a transport adapter). Nothing else is hard-wired.
import type { LabCredentialKind } from './labCustomerCredentialVault.ts'

export type LabProviderCapability = 'teacher.generate' | 'training.execute'
export type LabProviderEntry = Readonly<{
  kind: LabCredentialKind
  name: string
  teacherTransport: 'openai_responses' | 'openai_compatible' | 'anthropic_messages' | 'gemini_generate_content'
  defaultEndpoint: string | null
  supports: Readonly<Record<LabProviderCapability, boolean>>
  unsupported: Readonly<Partial<Record<LabProviderCapability, string>>>
  keyHelp: string
}>

export const LAB_PROVIDER_CATALOG: readonly LabProviderEntry[] = Object.freeze([
  {
    kind: 'huggingface', name: 'Hugging Face', teacherTransport: 'openai_compatible',
    defaultEndpoint: 'https://router.huggingface.co/v1/chat/completions',
    supports: { 'teacher.generate': true, 'training.execute': true }, unsupported: {},
    keyHelp: 'huggingface.co → Settings → Access Tokens. Needs write access and Jobs permission (training runs on your account).',
  },
  {
    kind: 'openai', name: 'OpenAI', teacherTransport: 'openai_responses',
    defaultEndpoint: 'https://api.openai.com/v1/responses',
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'LAB does not run training on OpenAI yet. Use it as the teacher; training runs on Hugging Face.' },
    keyHelp: 'platform.openai.com → API keys.',
  },
  {
    kind: 'anthropic', name: 'Anthropic', teacherTransport: 'anthropic_messages',
    defaultEndpoint: 'https://api.anthropic.com/v1/messages',
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'Anthropic does not offer customer training. Use it as the teacher only.' },
    keyHelp: 'console.anthropic.com → API Keys.',
  },
  {
    kind: 'gemini', name: 'Google Gemini', teacherTransport: 'gemini_generate_content',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'LAB does not run training on Google yet. Use it as the teacher only.' },
    keyHelp: 'aistudio.google.com → Get API key.',
  },
  {
    kind: 'openai_compatible', name: 'Other (OpenAI-compatible)', teacherTransport: 'openai_compatible',
    defaultEndpoint: null,
    supports: { 'teacher.generate': true, 'training.execute': false },
    unsupported: { 'training.execute': 'Training on custom endpoints is not supported. Use it as the teacher only.' },
    keyHelp: 'Your provider\'s API key plus its https chat-completions URL.',
  },
] as const)

export function providerEntry(kind: string): LabProviderEntry | null {
  return LAB_PROVIDER_CATALOG.find(entry => entry.kind === kind) ?? null
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
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(selection.baseModel)) problems.push('Base model must be a Hugging Face model id like "Qwen/Qwen2.5-0.5B-Instruct".')
  if (selection.promptCount < 20 || selection.promptCount > 128) problems.push('Provide between 20 and 128 training prompts (one per line).')
  return problems
}
