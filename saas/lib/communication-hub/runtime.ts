import { communicationContext, type BuyerEmailConnection } from './config'
import type { CommunicationPolicy } from './contracts'

function value(name: string): string | undefined {
  const current = process.env[name]
  return current && current.trim() ? current.trim() : undefined
}

function policyMode(): CommunicationPolicy['mode'] {
  const mode = value('COMMUNICATION_EMAIL_POLICY')
  return mode === 'draft_only' || mode === 'automatic' || mode === 'approval_required'
    ? mode
    : 'approval_required'
}

export function resolveBuyerEmailConnection(orgId: string): BuyerEmailConnection | null {
  const providerId = value('COMMUNICATION_EMAIL_PROVIDER')
  if (!providerId) return null

  const common: BuyerEmailConnection = {
    providerId,
    orgId,
    accountRef: value('COMMUNICATION_EMAIL_ACCOUNT_REF'),
    accessToken: value('COMMUNICATION_EMAIL_ACCESS_TOKEN'),
    apiKey: value('COMMUNICATION_EMAIL_API_KEY'),
    policy: {
      mode: policyMode(),
      maxRecipientsPerMessage: Number(value('COMMUNICATION_EMAIL_MAX_RECIPIENTS') || 25),
    },
    metadata: {},
    secrets: {},
  }

  if (providerId === 'smtp') {
    common.metadata = {
      host: value('SMTP_HOST'),
      port: Number(value('SMTP_PORT') || 587),
      secure: value('SMTP_SECURE') === 'true',
      from: value('SMTP_FROM'),
    }
    common.secrets = {
      SMTP_USERNAME: value('SMTP_USERNAME'),
      SMTP_PASSWORD: value('SMTP_PASSWORD'),
    }
  } else if (providerId === 'universal-email-adapter') {
    common.secrets = {
      COMMUNICATION_UNIVERSAL_CONFIG_JSON: value('COMMUNICATION_UNIVERSAL_CONFIG_JSON'),
      COMMUNICATION_API_TOKEN: value('COMMUNICATION_API_TOKEN'),
      COMMUNICATION_API_KEY: value('COMMUNICATION_API_KEY'),
    }
  }

  return common
}

export function resolveBuyerEmailDelivery(orgId: string) {
  const connection = resolveBuyerEmailConnection(orgId)
  if (!connection) return null
  return { providerId: connection.providerId, context: communicationContext(connection) }
}
