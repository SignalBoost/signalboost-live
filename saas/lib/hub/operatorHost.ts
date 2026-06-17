// saas/lib/hub/operatorHost.ts
//
// The bridge between the portable governed operator (console-core/operator) and
// the live SignalBoost console. It implements Module 7's ExecutorHost using the
// real executor registry, the existing action-policy, and the capability matrix.
// Nothing is invented: templates are DERIVED from the registered executor's own
// schema + its policy + the capability matrix.

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

export function createOperatorHost(): ExecutorHost {
  return {
    resolveTemplate(providerId: string, actionId: string): GovernedTemplate | null {
      const ex = resolveExecutor(providerId, actionId)
      if (!ex) return null
      const policy = getHubActionPolicy(ex.policyActionId)
      const cap = getCapability(providerId).cap
      const fields = ex.schema.fields || []
      return {
        provider: providerId,
        action: actionId,
        version: '1.0.0',
        requiredFields: fields.filter(f => f.required).map(mapField),
        optionalFields: fields.filter(f => !f.required).map(mapField),
        riskLevel: policy.risk,
        permissionPolicy: mapApproval(policy.approval),
        idempotency: cap.idempotent,
        rollbackPossible: cap.rollbackPossible,
        rollbackNotes: cap.notes || 'See provider capability matrix.',
        executor: { endpoint: `${providerId}.${actionId}`, method: 'POST' },
      }
    },

    async injectSecrets(_providerId: string): Promise<Record<string, string> | null> {
      return {}
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

    async audit(entry: AuditEntry): Promise<void> {
      console.log('[operator.audit]', JSON.stringify(entry))
    },
  }
}
