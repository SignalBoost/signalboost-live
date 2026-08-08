export type CrmStage =
  | 'DISCOVERED'
  | 'DRAFTED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'REPLIED'
  | 'MEETING'
  | 'OPPORTUNITY'
  | 'WON'
  | 'LOST'
  | 'SUPPRESSED'

export interface CrmProspectIdentity {
  prospectId?: string | null
  companyName: string
  companyDomain?: string | null
  contactName?: string | null
  email: string
}

export interface CrmProductTouch {
  productKey: string
  stage: CrmStage
  firstTouchedAt?: string | null
  lastTouchedAt?: string | null
  sourceId?: string | null
  notes?: string | null
}

export interface CrmProspectRecord extends CrmProspectIdentity {
  provider: string
  externalId?: string | null
  touches: CrmProductTouch[]
  updatedAt: string
}

export interface CrmUpsertInput extends CrmProspectIdentity {
  productKey: string
  stage: CrmStage
  sourceId?: string | null
  notes?: string | null
}

export interface CrmSyncResult {
  ok: boolean
  provider: string
  externalId?: string | null
  error?: string
}

/**
 * Provider-neutral CRM boundary used by COS GTM missions.
 *
 * COS reasons in terms of prospects, product touches and stages. It never embeds
 * HubSpot, Salesforce or SignalBoost-specific APIs in the sales strategist. A
 * connector owns provider translation and credentials.
 */
export interface ICosCrmConnector {
  readonly provider: string
  isConfigured(): boolean
  getProspectByEmail(email: string): Promise<CrmProspectRecord | null>
  upsertProspect(input: CrmUpsertInput): Promise<CrmSyncResult>
  markProductStage(input: CrmUpsertInput): Promise<CrmSyncResult>
}
