import type { CommunicationAdapter, CommunicationCapability, CommunicationContext, CommunicationResult } from './contracts'
import { GmailCommunicationAdapter, MicrosoftGraphCommunicationAdapter } from './native'
import { SmtpCommunicationAdapter } from './smtp'
import { UniversalEmailAdapter } from './universal'

const adapters = new Map<string, CommunicationAdapter>()
for (const adapter of [
  new GmailCommunicationAdapter(),
  new MicrosoftGraphCommunicationAdapter(),
  new SmtpCommunicationAdapter(),
  new UniversalEmailAdapter(),
]) adapters.set(adapter.providerId, adapter)

export function registerCommunicationAdapter(adapter: CommunicationAdapter) {
  adapters.set(adapter.providerId, adapter)
}

export function listCommunicationAdapters() {
  return Array.from(adapters.values()).map((adapter) => ({ providerId: adapter.providerId, displayName: adapter.displayName, capabilities: adapter.capabilities }))
}

function enforcePolicy(capability: CommunicationCapability, input: Record<string, unknown>, context: CommunicationContext): CommunicationResult | null {
  const policy = context.policy
  if (!policy || !['email_send','email_reply','email_forward'].includes(capability)) return null
  const recipients = ['to','cc','bcc'].flatMap((key) => Array.isArray(input[key]) ? input[key] as unknown[] : [])
  if (policy.maxRecipientsPerMessage && recipients.length > policy.maxRecipientsPerMessage) {
    return { ok: false, errorCode: 'EMAIL_POLICY_RECIPIENT_LIMIT', retrievedAt: new Date().toISOString() }
  }
  if (policy.mode === 'draft_only') return { ok: false, errorCode: 'EMAIL_POLICY_DRAFT_ONLY', retrievedAt: new Date().toISOString() }
  if (policy.mode === 'approval_required' && input.approved !== true) {
    return { ok: false, errorCode: 'EMAIL_APPROVAL_REQUIRED', retrievedAt: new Date().toISOString() }
  }
  return null
}

export async function executeCommunication<TOutput = unknown>(
  providerId: string,
  capability: CommunicationCapability,
  input: Record<string, unknown>,
  context: CommunicationContext,
): Promise<CommunicationResult<TOutput>> {
  const adapter = adapters.get(providerId)
  if (!adapter) return { ok: false, errorCode: 'COMMUNICATION_PROVIDER_UNKNOWN', retrievedAt: new Date().toISOString() }
  if (!adapter.capabilities.includes(capability)) return { ok: false, errorCode: 'COMMUNICATION_CAPABILITY_UNSUPPORTED', retrievedAt: new Date().toISOString() }
  const denied = enforcePolicy(capability, input, context)
  if (denied) return denied as CommunicationResult<TOutput>
  return adapter.execute<TOutput>(capability, input, context)
}
