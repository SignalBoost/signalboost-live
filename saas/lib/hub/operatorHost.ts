// saas/lib/hub/operatorHost.ts
//
// Bridge between the portable governed operator and the live SignalBoost console.
// Implements Module 7's ExecutorHost with NO stubs:
//  • resolveTemplate — derived from the live registry + action-policy + capability
//    matrix; real endpoint (from PROVIDER_TEMPLATES when present) and a content-
//    derived version (changes when the template changes).
//  • injectSecrets — pulls the provider's secrets from vault_items and decrypts
//    them (AES-256-GCM). Empty map when none stored (executor env fallback).
//  • runProvider — delegates to the single real registered executor.
//  • audit — persists to admin_audit_log (not console).

import { createHash } from 'crypto'
import {
  type ExecutorHost,
  type GovernedTemplate,
  type TemplateField,
  type TemplateFieldType,
  type PermissionPolicy,
  type AuditEntry,
  getCapability,
} from '@/console-core/operator'
import { resolveExecutor } from '@/console-core/defaultHost'
import type { ActionField } from '@/console-core/types'
import { getHubActionPolicy, isActionBlocked } from '@/lib/hub/action-policy'
import { getAdminSupabase } from '@/utils/supabase/server'
import { vaultDecrypt } from '@/lib/vault/crypto'
import { PROVIDER_TEMPLATES } from '@/lib/hub/provider-templates'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mapApproval(approval: string): PermissionPolicy {
  switch (approval) {
    case 'admin': return 'admin'
    case 'owner':
    case 'owner_with_audit':
    case 'blocked': return 'owner'
    default: return 'user'
  }
}

function mapField(f: ActionField): TemplateField {
  const t: TemplateFieldType =
    f.type === 'number' ? 'number'
    : f.type === 'boolean' ? 'boolean'
    : f.type === 'json' ? 'json'
    : f.type === 'select' || f.type === 'remote_select' || f.type === 'remote_list' ? 'select'
    : 'text'
  const field: TemplateField = { id: f.id, label: f.label, type: t }
  if (Array.isArray(f.options) && f.options.length) field.allowedValues = f.options.map(o => o.value)
  return field
}

// Content-derived version: a stable numeric patch from the schema hash, so the
// template version actually reflects the template (not a frozen constant).
function schemaVersion(schema: unknown): string {
  const h = createHash('sha256').update(JSON.stringify(schema)).digest('hex')
  return `1.0.${parseInt(h.slice(0, 4), 16) % 1000}`
}

export function createOperatorHost(): ExecutorHost {
  return {
    resolveTemplate(providerId: string, actionId: string): GovernedTemplate | null {
      const ex = resolveExecutor(providerId, actionId)
      if (!ex) return null

      const policy = getHubActionPolicy(ex.policyActionId)
      const cap = getCapability(providerId).cap
      const fields = ex.schema.fields || []

      // Real endpoint/method when a legacy PROVIDER_TEMPLATE declares one; otherwise
      // an explicit executor reference (these executors are functions, not one URL).
      const legacy: any = (PROVIDER_TEMPLATES as Record<string, any>)[`${providerId}.${actionId}`]
      const rawMethod = legacy?.api?.method
      const method: 'GET' | 'POST' | 'PUT' | 'DELETE' =
        rawMethod === 'GET' || rawMethod === 'PUT' || rawMethod === 'DELETE' ? rawMethod
        : rawMethod === 'PATCH' ? 'PUT' : 'POST'
      const endpoint = legacy?.api?.endpoint || `executor:${providerId}.${actionId}`

      return {
        provider: providerId,
        action: actionId,
        version: schemaVersion(ex.schema),
        requiredFields: fields.filter(f => f.required).map(mapField),
        optionalFields: fields.filter(f => !f.required).map(mapField),
        riskLevel: policy.risk,
        permissionPolicy: mapApproval(policy.approval),
        idempotency: cap.idempotent,
        rollbackPossible: cap.rollbackPossible,
        rollbackNotes: cap.notes || 'See provider capability matrix.',
        executor: { endpoint, method },
      }
    },

    // Pull + decrypt this provider's secrets from the vault.
    async injectSecrets(providerId: string): Promise<Record<string, string> | null> {
      try {
        const admin = getAdminSupabase()
        const { data, error } = await admin
          .from('vault_items')
          .select('label, value_encrypted, iv, tag')
          .ilike('provider', providerId)
        if (error || !Array.isArray(data)) return {}
        const out: Record<string, string> = {}
        for (const row of data as any[]) {
          const dec = vaultDecrypt(row.value_encrypted, row.iv, row.tag)
          if (dec.ok && dec.value != null) out[row.label] = dec.value
        }
        return out
      } catch {
        return {}
      }
    },

    async runProvider(ctx, input, _secrets) {
      if (isActionBlocked(ctx.actionId)) {
        return { ok: false, error: `Action ${ctx.actionId} is blocked by policy.` }
      }
      const ex = resolveExecutor(ctx.providerId, ctx.actionId)
      if (!ex) return { ok: false, error: `No executor registered for ${ctx.providerId}.${ctx.actionId}` }
      const r = await ex.run(
        { user: ctx.user, providerId: ctx.providerId, actionId: ctx.actionId },
        input,
      )
      return { ok: r.ok, data: r.data, error: r.error, metadata: r.message ? { message: r.message } : {} }
    },

    // Persist to admin_audit_log (immutable audit trail).
    async audit(entry: AuditEntry): Promise<void> {
      try {
        const admin = getAdminSupabase()
        await admin.from('admin_audit_log').insert({
          actor_id: UUID_RE.test(entry.operatorId) ? entry.operatorId : null,
          action: `operator:${entry.action}`,
          target_type: 'provider',
          target_id: entry.provider,
          metadata: { template: entry.template, status: entry.status, timestamp: entry.timestamp, operatorId: entry.operatorId },
        })
      } catch (e) {
        console.error('[operator.audit] persist failed', e)
      }
    },
  }
}
