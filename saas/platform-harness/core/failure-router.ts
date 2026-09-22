import type { HarnessOutcomeStatus } from './types.ts'

export type HarnessFailureDestination = 'none'|'self_healing'|'university_remediation'|'referee_guardian'|'harness_assurance'

export function routeHarnessOutcome(status: HarnessOutcomeStatus): HarnessFailureDestination {
  switch (status) {
    case 'success': return 'none'
    case 'infrastructure_failure': return 'self_healing'
    case 'agent_failure': return 'university_remediation'
    case 'authority_halt': return 'referee_guardian'
    case 'harness_failure': return 'harness_assurance'
  }
}
