import type { RepairPlan, RepairStep } from '../../repair-plan-schema.ts'
import { BrowserRuntimeAdapterError } from './browser-runtime-adapter-errors.ts'

const supported = new Set<RepairStep['action']>(['navigate','click','fill','select','read','screenshot','request_approval','verify','stop'])
const interaction = new Set<RepairStep['action']>(['click','fill','select','read'])
const secretKey = /^(password|token|apiKey|api_key|accessToken|privateKey|secret|cookie|authorization)$/i
const safeRef = /^(secretRef|tokenRef|credentialRef|valueRef)$/
const executable = /(javascript:|data:|file:|blob:|chrome:|<script|eval\s*\(|function\s*\(|=>|\b(shell|bash|sh|node|powershell|command)\b)/i

export function normalizeApprovedOrigin(origin: string, environment: string): string {
  let url: URL
  try { url = new URL(origin) } catch { throw new BrowserRuntimeAdapterError('invalid_origin', 'targetOrigin must be a valid HTTPS origin') }
  if (url.protocol !== 'https:' && !(environment === 'sandbox' && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'))) throw new BrowserRuntimeAdapterError('non_https_origin', 'targetOrigin must use HTTPS except for the configured local sandbox origin')
  if (url.username || url.password) throw new BrowserRuntimeAdapterError('origin_credentials', 'targetOrigin must not include credentials')
  if (url.search || url.hash) throw new BrowserRuntimeAdapterError('origin_scope', 'targetOrigin must not include query or fragment')
  if (url.pathname !== '/' && url.pathname !== '') throw new BrowserRuntimeAdapterError('origin_scope', 'targetOrigin must be an origin without path')
  if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && environment !== 'sandbox') throw new BrowserRuntimeAdapterError('localhost_origin', 'localhost targetOrigin is only allowed for sandbox plans')
  return url.origin
}
function sameOrigin(value: string, origin: string): boolean {
  try { const url = new URL(value); return url.origin === origin && !url.username && !url.password && !url.href.includes('{') && !url.href.includes('}') && !/[?&](next|redirect|returnUrl|url)=/i.test(url.search) } catch { return false }
}
function walk(value: unknown, path: string): void {
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`))
  else if (value && typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new BrowserRuntimeAdapterError('non_plain_parameters', `${path} must be plain data`)
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (secretKey.test(k) && !safeRef.test(k)) throw new BrowserRuntimeAdapterError('plaintext_secret', `${path}.${k} must use a reference`)
      if (/(javascript|script|eval|shell|command|code)/i.test(k)) throw new BrowserRuntimeAdapterError('executable_content', `${path}.${k} is executable content`)
      walk(v, `${path}.${k}`)
    }
  } else if (typeof value === 'string' && executable.test(value)) throw new BrowserRuntimeAdapterError('executable_content', `${path} contains executable content`)
}
function selector(step: RepairStep): void {
  const p = step.parameters as Record<string, unknown>
  const target = p.target
  if (!target || typeof target !== 'object' || Array.isArray(target) || Object.getPrototypeOf(target) !== Object.prototype) throw new BrowserRuntimeAdapterError('unstructured_target', `${step.stepId} requires a structured target`)
  const t = target as Record<string, unknown>
  const ok = (t.role && t.name) || t.label || t.testId || t.text || t.css
  if (!ok) throw new BrowserRuntimeAdapterError('unstructured_target', `${step.stepId} target is not supported`)
  if (typeof t.css === 'string' && (t.css.includes('*') || /^xpath=/i.test(t.css) || /password-manager|chrome|extension/i.test(t.css))) throw new BrowserRuntimeAdapterError('unsafe_selector', `${step.stepId} selector is unsafe`)
  if (Array.isArray(t.fallbacks)) throw new BrowserRuntimeAdapterError('selector_fallbacks', `${step.stepId} selector fallback chains are not allowed`)
}
export function validateBrowserRuntimeCompatibility(plan: RepairPlan, approvedStepIds: string[]): { targetOrigin: string; approvedSteps: RepairStep[] } {
  if (!plan.requiresBrowser) throw new BrowserRuntimeAdapterError('requires_browser_false', 'repairPlan.requiresBrowser must be true')
  if (!plan.targetOrigin) throw new BrowserRuntimeAdapterError('missing_target_origin', 'repairPlan.targetOrigin is required')
  const targetOrigin = normalizeApprovedOrigin(plan.targetOrigin, plan.targetEnvironment)
  if (new Set(approvedStepIds).size !== approvedStepIds.length) throw new BrowserRuntimeAdapterError('duplicate_step_ids', 'approvedStepIds must be unique')
  if (plan.steps.some(s => s.action === 'api_request') && plan.steps.some(s => supported.has(s.action) && s.action !== 'verify' && s.action !== 'stop')) throw new BrowserRuntimeAdapterError('mixed_scope', 'Mixed API/browser scope is not accepted')
  const byId = new Map(plan.steps.map(s => [s.stepId, s])); const approvedSteps = approvedStepIds.map(id => { const s = byId.get(id); if (!s) throw new BrowserRuntimeAdapterError('unknown_step_id', 'Every approvedStepId must exist in the plan'); return s })
  const ordered = plan.steps.filter(s => approvedStepIds.includes(s.stepId)).map(s => s.stepId)
  if (JSON.stringify(ordered) !== JSON.stringify(approvedStepIds)) throw new BrowserRuntimeAdapterError('step_reordered', 'approvedStepIds must preserve plan order')
  for (const step of approvedSteps) {
    if (!supported.has(step.action)) throw new BrowserRuntimeAdapterError('unsupported_action', `${step.action} is not browser-compatible`)
    walk(step.parameters, `step.${step.stepId}.parameters`)
    if (interaction.has(step.action)) selector(step)
    if (step.action === 'navigate') {
      const url = step.parameters.url
      if (typeof url !== 'string' || !sameOrigin(url, targetOrigin)) throw new BrowserRuntimeAdapterError('navigation_origin', `${step.stepId} navigation must stay on targetOrigin`)
    }
    if (step.action === 'fill') {
      const p = step.parameters as Record<string, unknown>
      if (p.value === undefined && p.secretRef === undefined && p.tokenRef === undefined && p.credentialRef === undefined && p.valueRef === undefined) throw new BrowserRuntimeAdapterError('missing_fill_value', `${step.stepId} fill requires a literal value or reference`)
    }
  }
  return { targetOrigin, approvedSteps }
}
