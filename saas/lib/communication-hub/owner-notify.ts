import type { CommunicationResult } from './contracts'
import type { CosEmailDelivery } from './cos-email'
import { sendCosOwnerNotification } from './cos-email'

export async function notifyOwnerOfCampaignDelivery(
  delivery: CosEmailDelivery,
  ownerEmail: string,
  campaignTitle: string,
  summary: string,
  approved = false,
): Promise<CommunicationResult> {
  return sendCosOwnerNotification(
    delivery,
    ownerEmail,
    `SignalBoost campaign update: ${campaignTitle}`,
    summary,
    approved,
  )
}
