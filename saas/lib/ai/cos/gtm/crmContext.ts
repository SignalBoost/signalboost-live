import { productKeyOf } from '@/lib/outreach/recipientHistory'
import { getCosCrmConnector } from './crmRegistry'

export interface CosCrmSalesContext {
  provider: string
  knownProspect: boolean
  alreadyContactedForProduct: boolean
  productKey: string
  priorProductTouches: Array<{
    productKey: string
    stage: string
    lastTouchedAt?: string | null
  }>
}

/**
 * Grounded CRM context for the GTM strategist.
 *
 * This is intentionally facts-only. It does not provide email templates or sales copy.
 * COS uses it to decide whether this product may be pitched and how the relationship
 * should be framed for a known prospect.
 */
export async function getCosCrmSalesContext(input: {
  email: string
  productIdOrOffer: string
}): Promise<CosCrmSalesContext> {
  const productKey = productKeyOf(input.productIdOrOffer)
  if (!productKey) throw new Error('A product ID or product name is required for CRM context.')

  const crm = getCosCrmConnector()
  const prospect = await crm.getProspectByEmail(input.email)
  const touches = prospect?.touches || []

  return {
    provider: crm.provider,
    knownProspect: Boolean(prospect),
    alreadyContactedForProduct: touches.some(touch => productKeyOf(touch.productKey) === productKey && ['SENT', 'REPLIED', 'MEETING', 'OPPORTUNITY', 'WON'].includes(touch.stage)),
    productKey,
    priorProductTouches: touches.map(touch => ({
      productKey: touch.productKey,
      stage: touch.stage,
      lastTouchedAt: touch.lastTouchedAt || null,
    })),
  }
}
