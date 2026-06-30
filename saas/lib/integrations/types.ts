// saas/lib/integrations/types.ts
// The plug-and-play substrate for EVERY provider SignalBoost integrates — sales,
// marketing, audit, cybersecurity, compliance. One uniform adapter shape; one
// registry; one capability dispatcher. Each capability is also a TASK TEMPLATE
// (label + inputs) so every provider action is runnable from the console hub with
// no per-provider UI work.

export type IntegrationCategory =
  | 'crm' | 'email_marketing' | 'messaging' | 'cdp' | 'enrichment' | 'scheduling' | 'payments'
  | 'audit' | 'cybersecurity' | 'compliance'

export type AuthKind = 'oauth2' | 'api_key'

export type Capability =
  // sales + marketing
  | 'contact_sync' | 'deal_sync' | 'activity_log' | 'webhooks'
  | 'list_sync' | 'campaign_create' | 'automation_trigger' | 'email_analytics'
  | 'chat_widget' | 'lead_qualification' | 'conversation_sync'
  | 'event_track' | 'identity_resolve' | 'destination_sync' | 'reverse_etl'
  | 'lead_enrich' | 'company_intel' | 'contact_discovery'
  | 'booking_link' | 'calendar_sync' | 'meeting_reminder'
  | 'payment_link' | 'subscription' | 'invoice'
  // audit / patch
  | 'code_scan' | 'dependency_scan' | 'secret_scan' | 'dast_scan' | 'auto_fix'
  // cybersecurity / compliance
  | 'waf_events' | 'edr_status' | 'identity_manage' | 'vuln_scan' | 'siem_query' | 'cloud_posture'

export interface IntegrationContext {
  orgId: string
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  accountRef?: string
  metadata?: Record<string, any>
}

export interface IntegrationResult<T = any> { ok: boolean; data?: T; error?: string; mode?: string }

// A console task template: how a capability is presented + what inputs it collects.
export interface TaskInput { key: string; label: string; type: 'text' | 'number' | 'boolean'; required?: boolean; placeholder?: string }
export interface TaskTemplate { capability: Capability; label: string; description: string; inputs: TaskInput[] }

export interface IntegrationProvider {
  id: string
  label: string
  category: IntegrationCategory
  auth: AuthKind
  authUrl?: string
  tokenUrl?: string
  scopes?: string[]
  docsUrl?: string
  capabilities: Capability[]

  // sales / marketing
  upsertContact?: (ctx: IntegrationContext, contact: Record<string, any>) => Promise<IntegrationResult>
  upsertDeal?: (ctx: IntegrationContext, deal: Record<string, any>) => Promise<IntegrationResult>
  logActivity?: (ctx: IntegrationContext, activity: Record<string, any>) => Promise<IntegrationResult>
  addToList?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  createCampaign?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  syncConversation?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  trackEvent?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  enrichLead?: (ctx: IntegrationContext, query: Record<string, any>) => Promise<IntegrationResult>
  bookingLink?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  paymentLink?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>

  // audit / patch
  scanCode?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  scanDependencies?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  scanSecrets?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  scanDast?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  autoFix?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>

  // cybersecurity / compliance
  wafEvents?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  edrStatus?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  manageIdentity?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  vulnScan?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  siemQuery?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
  cloudPosture?: (ctx: IntegrationContext, args: Record<string, any>) => Promise<IntegrationResult>
}

export const CAPABILITY_METHOD: Partial<Record<Capability, keyof IntegrationProvider>> = {
  contact_sync: 'upsertContact', deal_sync: 'upsertDeal', activity_log: 'logActivity',
  list_sync: 'addToList', campaign_create: 'createCampaign', conversation_sync: 'syncConversation',
  event_track: 'trackEvent', lead_enrich: 'enrichLead', booking_link: 'bookingLink', payment_link: 'paymentLink',
  code_scan: 'scanCode', dependency_scan: 'scanDependencies', secret_scan: 'scanSecrets', dast_scan: 'scanDast', auto_fix: 'autoFix',
  waf_events: 'wafEvents', edr_status: 'edrStatus', identity_manage: 'manageIdentity', vuln_scan: 'vulnScan', siem_query: 'siemQuery', cloud_posture: 'cloudPosture',
}

// One template per capability — the console renders these as runnable forms. Adding a
// capability = add one entry here; every provider that declares it inherits the task.
export const TASK_TEMPLATES: Partial<Record<Capability, Omit<TaskTemplate, 'capability'>>> = {
  contact_sync: { label: 'Sync contact', description: 'Create or update a contact in the CRM.', inputs: [{ key: 'email', label: 'Email', type: 'text', required: true }, { key: 'firstName', label: 'First name', type: 'text' }, { key: 'lastName', label: 'Last name', type: 'text' }, { key: 'company', label: 'Company', type: 'text' }] },
  deal_sync: { label: 'Sync deal', description: 'Create or update a deal/opportunity.', inputs: [{ key: 'name', label: 'Deal name', type: 'text', required: true }, { key: 'amount', label: 'Amount', type: 'number' }, { key: 'stage', label: 'Stage', type: 'text' }] },
  activity_log: { label: 'Log activity', description: 'Record a note/activity against a record.', inputs: [{ key: 'note', label: 'Note', type: 'text', required: true }] },
  list_sync: { label: 'Add to list', description: 'Add a contact to a marketing list/audience.', inputs: [{ key: 'email', label: 'Email', type: 'text', required: true }, { key: 'listId', label: 'List ID', type: 'text' }] },
  campaign_create: { label: 'Create campaign', description: 'Create a marketing campaign draft.', inputs: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'subject', label: 'Subject', type: 'text' }] },
  event_track: { label: 'Track event', description: 'Send an analytics/CDP event.', inputs: [{ key: 'event', label: 'Event name', type: 'text', required: true }, { key: 'userId', label: 'User ID', type: 'text' }] },
  lead_enrich: { label: 'Enrich lead', description: 'Look up a person/company by email or domain.', inputs: [{ key: 'email', label: 'Email', type: 'text' }, { key: 'domain', label: 'Company domain', type: 'text' }] },
  booking_link: { label: 'Get booking link', description: 'Return a scheduling link for a sales call.', inputs: [] },
  payment_link: { label: 'Create payment link', description: 'Generate a payment/checkout link.', inputs: [{ key: 'amount', label: 'Amount', type: 'number', required: true }, { key: 'currency', label: 'Currency', type: 'text' }] },
  code_scan: { label: 'Code scan', description: 'Static analysis / code-scanning alerts.', inputs: [{ key: 'repo', label: 'Repository (owner/repo)', type: 'text' }] },
  dependency_scan: { label: 'Dependency scan', description: 'Find vulnerable dependencies.', inputs: [{ key: 'repo', label: 'Repository (owner/repo)', type: 'text' }] },
  secret_scan: { label: 'Secret scan', description: 'Detect exposed secrets/keys.', inputs: [{ key: 'repo', label: 'Repository (owner/repo)', type: 'text' }] },
  dast_scan: { label: 'DAST scan', description: 'Dynamic web-app penetration scan.', inputs: [{ key: 'targetUrl', label: 'Target URL', type: 'text', required: true }] },
  auto_fix: { label: 'Auto-fix', description: 'Open automated remediation/update PRs.', inputs: [{ key: 'repo', label: 'Repository (owner/repo)', type: 'text' }] },
  waf_events: { label: 'WAF events', description: 'Recent firewall/WAF security events.', inputs: [{ key: 'since', label: 'Since (ISO)', type: 'text' }] },
  edr_status: { label: 'EDR status', description: 'Endpoint detection & response status.', inputs: [] },
  identity_manage: { label: 'Manage identity', description: 'Provision/manage a user (SSO/MFA).', inputs: [{ key: 'email', label: 'User email', type: 'text', required: true }, { key: 'action', label: 'Action (create/suspend)', type: 'text' }] },
  vuln_scan: { label: 'Vulnerability scan', description: 'Network/infra vulnerability scan.', inputs: [{ key: 'target', label: 'Target host/range', type: 'text' }] },
  siem_query: { label: 'SIEM query', description: 'Query logs / threat intelligence.', inputs: [{ key: 'query', label: 'Query', type: 'text', required: true }] },
  cloud_posture: { label: 'Cloud posture scan', description: 'Detect cloud misconfigurations (CSPM).', inputs: [{ key: 'account', label: 'Cloud account', type: 'text' }] },
}
