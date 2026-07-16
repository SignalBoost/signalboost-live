import type { SupervisorIncident } from '../../../incident-schema.ts'
import type { RepairPlan } from '../../../repair-plan-schema.ts'

export interface VercelThinkerClock { now(): Date }
export interface VercelThinkerConfig { clock: VercelThinkerClock; schemaVersion?: string }
export interface VercelThinkerRule { id: string; matches(incident: SupervisorIncident): boolean; buildPlan(input: { incident: SupervisorIncident; now: Date; schemaVersion: string }): RepairPlan }
export type VercelThinkerPlan = RepairPlan
