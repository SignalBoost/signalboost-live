// saas/lib/ai/modelConfigurationPort.ts
import type { ModelProfileUse, PlatformModelProfile } from './modelCapabilityRegistry.ts'
import type { PlatformModelTransportBinding } from './modelTransportConfig.ts'

export type AssignableModelUse = Extract<ModelProfileUse, 'cos_reasoner' | 'builder' | 'specialist'>

export type ModelAssignmentRecord = Readonly<{
  assignmentId: string
  use: AssignableModelUse
  profileKey: string
  previousAssignmentId: string | null
  certificationEventId: string
  status: 'active' | 'superseded' | 'rolled_back' | 'released'
  createdBy: string
  createdAt: string
}>

export type ModelRegistrationRecord = Readonly<{
  profile: PlatformModelProfile
  binding: PlatformModelTransportBinding
  credentialConfigured: boolean
  enabled: boolean
  createdAt: string
  updatedAt: string
}>

export interface ModelCredentialVaultPort {
  store(input: {
    profileKey: string
    secretName: string
    secretValue: string
    actorId: string
  }): Promise<{ credentialRef: string; last4: string }>
  resolve(credentialRef: string): Promise<string | null>
  remove(credentialRef: string, actorId: string): Promise<void>
}

export interface ModelConfigurationPort {
  listRegistrations(): Promise<readonly ModelRegistrationRecord[]>
  getRegistration(profileKey: string): Promise<ModelRegistrationRecord | null>
  register(input: {
    profile: PlatformModelProfile
    binding: PlatformModelTransportBinding
    secretValue?: string | null
    secretName?: string | null
    actorId: string
  }): Promise<ModelRegistrationRecord>
  disable(profileKey: string, actorId: string): Promise<void>
  currentAssignment(use: AssignableModelUse): Promise<ModelAssignmentRecord | null>
  assignmentHistory(use: AssignableModelUse, limit?: number): Promise<readonly ModelAssignmentRecord[]>
  assign(input: {
    use: AssignableModelUse
    profileKey: string
    certificationEventId: string
    actorId: string
    expectedCurrentAssignmentId?: string | null
  }): Promise<ModelAssignmentRecord>
  rollback(input: {
    use: AssignableModelUse
    actorId: string
    expectedCurrentAssignmentId: string
  }): Promise<ModelAssignmentRecord>
  /**
   * Ends the active durable assignment for a role without activating another model, returning that role to
   * the host's ordinary platform routing. This is the only way to undo a role's FIRST assignment, which has
   * no rollback target. Optimistic concurrency: the caller must name the assignment it believes is active.
   */
  release(input: {
    use: AssignableModelUse
    actorId: string
    expectedCurrentAssignmentId: string
  }): Promise<ModelAssignmentRecord>
  vault: ModelCredentialVaultPort
}