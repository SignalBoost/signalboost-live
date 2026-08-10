import type { CommunicationContext, CommunicationResult, EmailMessageInput } from './contracts'
import { executeCommunication } from './hub'

export type CosEmailDelivery = {
  providerId: string
  context: CommunicationContext
}

export async function sendCosOutreachEmail(
  delivery: CosEmailDelivery,
  message: EmailMessageInput,
  approved = false,
): Promise<CommunicationResult> {
  return executeCommunication(delivery.providerId, 'email_send', { ...message, approved }, delivery.context)
}

export async function saveCosOutreachDraft(
  delivery: CosEmailDelivery,
  message: EmailMessageInput,
): Promise<CommunicationResult> {
  return executeCommunication(delivery.providerId, 'email_draft', message as unknown as Record<string, unknown>, delivery.context)
}

export async function sendCosOwnerNotification(
  delivery: CosEmailDelivery,
  ownerEmail: string,
  subject: string,
  text: string,
  approved = false,
): Promise<CommunicationResult> {
  return executeCommunication(delivery.providerId, 'email_send', {
    to: [{ email: ownerEmail }], subject, text, approved,
  }, delivery.context)
}
