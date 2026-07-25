// saas/agent-gateway-host/gateway-policy.ts
//
// Node-safe production governance policy. Keep this module free of Next.js aliases and
// runtime service imports so the exact pre-authorized envelope can be regression-tested by
// the repository's plain node:test runner.

import type { GovernancePolicy } from '../agent-gateway/index.ts'
import { defaultConsequenceClassifier } from '../agent-gateway/index.ts'
import { RETRY_DEPLOYMENT_ALLOWLIST_ENTRY } from './deployment-recovery.ts'

// The production envelope grows only through an explicit reviewed policy change.
export const GATEWAY_ALLOWLIST: GovernancePolicy['allowlist'] = Object.freeze([
  RETRY_DEPLOYMENT_ALLOWLIST_ENTRY,
])

export const GATEWAY_POLICY: GovernancePolicy = Object.freeze({
  classifier: defaultConsequenceClassifier,
  allowlist: GATEWAY_ALLOWLIST,
})
