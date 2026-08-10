export type CommunicationCapability =
  | 'email_send'
  | 'email_draft'
  | 'email_reply'
  | 'email_forward'
  | 'email_search'
  | 'email_read'
  | 'email_watch_replies'

export type CommunicationPolicy = {
  mode: 'draft_only' | 'approval_required' | 'automatic'
  maxRecipientsPerMessage?: number
  maxMessagesPerRun?: number
  allowedFromAddresses?: string[]
}

export type CommunicationContext = {
  orgId: string
  accessToken?: string
  apiKey?: string
  accountRef?: string
  metadata?: Record<string, unknown>
  secrets?: Record<string, string | undefined>
  policy?: CommunicationPolicy
}

export type EmailAddress = { email: string; name?: string }

export type EmailMessageInput = {
  from?: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  bcc?: EmailAddress[]
  subject: string
  text?: string
  html?: string
  replyToMessageId?: string
  threadId?: string
  attachments?: Array<{ filename: string; contentType?: string; contentBase64: string }>
  metadata?: Record<string, unknown>
}

export type CommunicationResult<T = unknown> = {
  ok: boolean
  data?: T
  mode?: string
  errorCode?: string
  retrievedAt: string
}

export interface CommunicationAdapter {
  readonly providerId: string
  readonly displayName: string
  readonly capabilities: readonly CommunicationCapability[]
  execute<TOutput = unknown>(capability: CommunicationCapability, input: Record<string, unknown>, context: CommunicationContext): Promise<CommunicationResult<TOutput>>
}
