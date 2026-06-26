// saas/lib/audit/providerTemplateSnapshot.ts
//
// Audit adapter over the existing Console Hub provider-template infrastructure.
// This keeps Audit from acting like a separate provider system: it uses the
// existing collector snapshot, then tags provider rows with the Hub template
// tunnel used by Console Hub, COS, and Infrastructure PRs.

import { collectSnapshot, type CollectOptions } from '@/lib/audit/collectors'
import { providerConnectionTag } from '@/lib/hub/provider-evidence'
import type { AuditSnapshot, NormalizedProvider } from '@/lib/audit/findingsEngine'

function tagProvider(provider: NormalizedProvider): NormalizedProvider {
  return {
    ...provider,
    connectedBy: provider.connectedBy || providerConnectionTag(provider.id),
  }
}

export function attachProviderTemplateEvidence(snapshot: AuditSnapshot): AuditSnapshot {
  return {
    ...snapshot,
    providers: Array.isArray(snapshot.providers) ? snapshot.providers.map(tagProvider) : [],
  }
}

export async function collectProviderTemplateSnapshot(opts: CollectOptions = {}): Promise<AuditSnapshot> {
  const snapshot = await collectSnapshot(opts)
  return attachProviderTemplateEvidence(snapshot)
}
