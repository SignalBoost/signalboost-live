import { communicationContext, type BuyerEmailConnection } from './config'

function value(name: string): string | undefined {
  const current = process.env[name]
  return current && current.trim() ? current.trim() : undefined
}

export function resolveBuyerEmailConnection(orgId: string): BuyerEmailConnection | null {
  const providerId = value('COMMUNICATION_EMAIL_PROVIDER')
  if (!providerId) return null

  const policyMode = value('COMMUNICATION_EMAIL_POLICY') as BuyerEmailConnection['policy'] extends infer P
    ? P extends { mode: infer M } ? M : never
    : never

  const common: BuyerEmailConnection = {
    providerId,
    orgId,
    accountRef: value('COMMUNICATION_EMAIL_ACCOUNT_REF'),
    accessToken: value('COMMUNICATION_EMAIL_ACCESS_TOKEN'),
    apiKey: value('COMMUNICATION_EMAIL_API_KEY'),
    policy: {
      mode: policyMode || 'approval_required',
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
