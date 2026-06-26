// saas/lib/hub/provider-evidence.ts
//
// Thin shared helper over the EXISTING Console Hub provider-template system.
// This is not a new infrastructure layer. It lets Audit, Cybersecurity, COS,
// and Infrastructure PRs speak the same provider/template language:
//   - read/evidence templates are used to understand current provider state
//   - write/fix templates are staged through the existing Infrastructure PR flow
//
// The provider templates remain the tunnel. This file only describes that tunnel
// in a normalized way for audit/cyber consumers.

import { PROVIDER_TEMPLATES, type ProviderTemplate } from '@/lib/hub/provider-templates'

export type ProviderEvidenceTemplate = {
  id: string
  label: string
  description: string
  service: string
  method: string
  endpoint: string
  policyActionId?: string
}

export type ProviderEvidenceProfile = {
  providerId: string
  connectedBy: 'console-hub-provider-templates'
  hasTemplates: boolean
  evidenceTemplateIds: string[]
  fixTemplateIds: string[]
  evidenceTemplates: ProviderEvidenceTemplate[]
  fixTemplates: ProviderEvidenceTemplate[]
  lastMappedAt: string
}

function normalizeProviderId(providerId: string) {
  return String(providerId || '').toLowerCase().trim()
}

function actionName(template: ProviderTemplate) {
  return String(template.id || '').split('.').slice(1).join('.').toLowerCase()
}

function isEvidenceTemplate(template: ProviderTemplate) {
  const action = actionName(template)
  return template.api?.method === 'GET' || /^(list|view|get|read|scan|fetch|check|status)/i.test(action)
}

function isFixTemplate(template: ProviderTemplate) {
  return !isEvidenceTemplate(template)
}

function toEvidenceTemplate(template: ProviderTemplate): ProviderEvidenceTemplate {
  return {
    id: template.id,
    label: template.label,
    description: template.description,
    service: template.api?.service || template.id.split('.')[0],
    method: template.api?.method || 'POST',
    endpoint: template.api?.endpoint || '',
    policyActionId: template.policyActionId,
  }
}

export function getProviderEvidenceProfile(providerId: string): ProviderEvidenceProfile {
  const provider = normalizeProviderId(providerId)
  const prefix = `${provider}.`
  const templates = Object.values(PROVIDER_TEMPLATES).filter(template => template.id.toLowerCase().startsWith(prefix))
  const evidenceTemplates = templates.filter(isEvidenceTemplate).map(toEvidenceTemplate)
  const fixTemplates = templates.filter(isFixTemplate).map(toEvidenceTemplate)

  return {
    providerId: provider,
    connectedBy: 'console-hub-provider-templates',
    hasTemplates: templates.length > 0,
    evidenceTemplateIds: evidenceTemplates.map(template => template.id),
    fixTemplateIds: fixTemplates.map(template => template.id),
    evidenceTemplates,
    fixTemplates,
    lastMappedAt: new Date().toISOString(),
  }
}

export function providerConnectionTag(providerId: string) {
  const profile = getProviderEvidenceProfile(providerId)
  if (!profile.hasTemplates) return undefined
  const evidence = profile.evidenceTemplateIds.length ? profile.evidenceTemplateIds.join(',') : 'no-read-template'
  const fixes = profile.fixTemplateIds.length ? profile.fixTemplateIds.join(',') : 'no-fix-template'
  return `console-hub-provider-templates:evidence=[${evidence}];fix=[${fixes}]`
}

export function listProviderEvidenceProfiles(providerIds: string[]) {
  return providerIds.map(getProviderEvidenceProfile)
}

export function getProviderFixTemplateIds(providerId: string) {
  return getProviderEvidenceProfile(providerId).fixTemplateIds
}
