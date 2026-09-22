import type { HarnessManifest, HarnessRunRequest } from './types.ts'

export type HarnessPolicyDecision = { allowed:true } | { allowed:false; reason:string }

export function validateHarnessManifest(manifest: HarnessManifest): HarnessPolicyDecision {
  if (!manifest.authorityManifestRef.trim()) return { allowed:false, reason:'authority_manifest_missing' }
  if (!manifest.environmentId.trim()) return { allowed:false, reason:'environment_missing' }
  if (manifest.capabilities.length === 0) return { allowed:false, reason:'capabilities_missing' }
  if (manifest.limits.maxCostUsd != null && manifest.limits.maxCostUsd < 0) return { allowed:false, reason:'invalid_cost_limit' }
  if (manifest.limits.maxToolCalls != null && manifest.limits.maxToolCalls < 1) return { allowed:false, reason:'invalid_tool_limit' }
  if (manifest.limits.deadlineMs != null && manifest.limits.deadlineMs < 1) return { allowed:false, reason:'invalid_deadline' }
  if ((manifest.profile === 'residency' || manifest.profile === 'sandbox' || manifest.profile === 'security_lab' || manifest.profile === 'evaluation_runtime') && manifest.production) {
    return { allowed:false, reason:'profile_production_environment_forbidden' }
  }
  return { allowed:true }
}

export function validateHarnessRun(request: HarnessRunRequest): HarnessPolicyDecision {
  if (!request.runId.trim()) return { allowed:false, reason:'run_id_missing' }
  if (!request.objective.trim()) return { allowed:false, reason:'objective_missing' }
  if (!request.identity.agentId.trim() || !request.identity.role.trim()) return { allowed:false, reason:'identity_missing' }
  return validateHarnessManifest(request.manifest)
}
