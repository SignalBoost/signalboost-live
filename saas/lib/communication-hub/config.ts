import type { CommunicationContext, CommunicationPolicy } from './contracts'

export type BuyerEmailConnection = {
  providerId: 'gmail' | 'microsoft-365' | 'smtp' | 'universal-email-adapter' | string
  orgId: string
  accessToken?: string
  apiKey?: string
  accountRef?: string
  metadata?: Record<string, unknown>
  secrets?: Record<string, string | undefined>
  policy?: CommunicationPolicy
}

export function communicationContext(connection: BuyerEmailConnection): CommunicationContext {
  return {
    orgId: connection.orgId,
    accessToken: connection.accessToken,
    apiKey: connection.apiKey,
    accountRef: connection.accountRef,
    metadata: connection.metadata,
    secrets: connection.secrets,
    policy: connection.policy || { mode: 'approval_required', maxRecipientsPerMessage: 25 },
  }
}
