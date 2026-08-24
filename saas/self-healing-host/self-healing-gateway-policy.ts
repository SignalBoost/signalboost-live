import type { GovernancePolicy } from '@/agent-gateway/index'
import { createConsequenceClassifier } from '@/agent-gateway/classifier'
import { GATEWAY_ALLOWLIST } from '@/agent-gateway-host/gateway-policy'
import { OBSERVATION_POLICY_RECONCILE_ALLOWLIST_ENTRY, OBSERVATION_POLICY_RECONCILE_TARGET } from '@/agent-gateway-host/observation-policy-recovery'
import { COS_QUALITY_RECOVERY_ALLOWLIST_ENTRY, COS_QUALITY_RECOVERY_TARGET } from '@/agent-gateway-host/cos-quality-recovery'

export const SELF_HEALING_GATEWAY_POLICY: GovernancePolicy = Object.freeze({
  classifier: createConsequenceClassifier({
    rules: [
      {
        id: 'signalboost.self_healing.reversible.observation_policy_reconcile',
        consequenceClass: 'reversible_internal',
        targets: [OBSERVATION_POLICY_RECONCILE_TARGET],
      },
      {
        id: 'signalboost.self_healing.reversible.cos_quality_recovery',
        consequenceClass: 'reversible_internal',
        targets: [COS_QUALITY_RECOVERY_TARGET],
      },
    ],
  }),
  allowlist: Object.freeze([
    ...GATEWAY_ALLOWLIST,
    OBSERVATION_POLICY_RECONCILE_ALLOWLIST_ENTRY,
    COS_QUALITY_RECOVERY_ALLOWLIST_ENTRY,
  ]),
})
