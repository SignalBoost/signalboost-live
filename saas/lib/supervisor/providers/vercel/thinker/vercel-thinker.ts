import { incidentSchema, type SupervisorIncident } from '../../../incident-schema.ts'
import type { Thinker } from '../../../execution-contracts.ts'
import { vercelThinkerRules, unsupportedVercelIncidentPlan } from './rules.ts'
import type { VercelThinkerConfig } from './types.ts'

export class VercelThinker implements Thinker {
  private readonly config: VercelThinkerConfig
  constructor(config: VercelThinkerConfig) { this.config = config }
  proposeRepairPlan(rawIncident: SupervisorIncident): unknown {
    const incident = incidentSchema.parse(rawIncident)
    const now = this.config.clock.now()
    const schemaVersion = this.config.schemaVersion || 'vercel-thinker-plan-v1'
    const rule = vercelThinkerRules.find(candidate => candidate.matches(incident))
    return rule ? rule.buildPlan({ incident, now, schemaVersion }) : unsupportedVercelIncidentPlan(incident, now, schemaVersion)
  }
}
