// saas/lib/ai/modelConfigurationMemory.ts
// Host-neutral ephemeral reference implementation used by portability acceptance and buyer examples.
// Production hosts should persist through their own ModelConfigurationPort implementation.
import { randomUUID } from 'node:crypto'
import type {
  AssignableModelUse,
  ModelAssignmentRecord,
  ModelConfigurationPort,
  ModelRegistrationRecord,
} from './modelConfigurationPort.ts'

export function createMemoryModelConfigurationPort(): ModelConfigurationPort {
  const registrations = new Map<string, ModelRegistrationRecord>()
  const assignments = new Map<AssignableModelUse, ModelAssignmentRecord[]>()
  const secrets = new Map<string,string>()

  const vault = Object.freeze({
    async store(input: { profileKey:string; secretName:string; secretValue:string; actorId:string }) {
      const value=String(input.secretValue||'').trim()
      if(!value) throw new Error('platform_model_secret_required')
      const credentialRef=`model-vault:${randomUUID()}`
      secrets.set(credentialRef,value)
      return Object.freeze({ credentialRef, last4:value.slice(-4) })
    },
    async resolve(credentialRef:string){ return secrets.get(credentialRef) ?? null },
    async remove(credentialRef:string, _actorId:string){ secrets.delete(credentialRef) },
  })

  function history(use:AssignableModelUse){ return assignments.get(use) || [] }

  const port:ModelConfigurationPort={
    vault,
    async listRegistrations(){ return Object.freeze([...registrations.values()]) },
    async getRegistration(profileKey){ return registrations.get(profileKey) || null },
    async register(input){
      const existing=registrations.get(input.profile.key)
      let credentialRef=existing?.binding.credentialRef || null
      if(input.secretValue){
        if(credentialRef) await vault.remove(credentialRef,input.actorId)
        credentialRef=(await vault.store({
          profileKey:input.profile.key,
          secretName:input.secretName || 'apiKey',
          secretValue:input.secretValue,
          actorId:input.actorId,
        })).credentialRef
      }
      const now=new Date().toISOString()
      const record=Object.freeze({
        profile:input.profile,
        binding:Object.freeze({ ...input.binding, credentialEnv:null, credentialRef }),
        credentialConfigured:Boolean(credentialRef),
        enabled:true,
        createdAt:existing?.createdAt || now,
        updatedAt:now,
      })
      registrations.set(input.profile.key,record)
      return record
    },
    async disable(profileKey){
      for(const rows of assignments.values()){
        if(rows[0]?.status==='active' && rows[0].profileKey===profileKey) throw new Error('platform_model_disable_active_assignment')
      }
      const existing=registrations.get(profileKey)
      if(existing) registrations.set(profileKey,Object.freeze({ ...existing, enabled:false, updatedAt:new Date().toISOString() }))
    },
    async currentAssignment(use){ return history(use).find(row=>row.status==='active') || null },
    async assignmentHistory(use,limit=20){ return Object.freeze(history(use).slice(0,Math.max(1,Math.min(100,limit)))) },
    async assign(input){
      const registration=registrations.get(input.profileKey)
      if(!registration?.enabled) throw new Error('platform_model_assignment_profile_unavailable')
      if(!registration.profile.uses.includes(input.use)) throw new Error('platform_model_assignment_use_not_registered')
      const rows=[...history(input.use)]
      const current=rows.find(row=>row.status==='active') || null
      if((current?.assignmentId || null)!==(input.expectedCurrentAssignmentId || null)) throw new Error('platform_model_assignment_conflict')
      if(current?.profileKey===input.profileKey) throw new Error('platform_model_assignment_already_active')
      const updated=rows.map(row=>row.assignmentId===current?.assignmentId ? Object.freeze({ ...row,status:'superseded' as const }) : row)
      const next=Object.freeze({
        assignmentId:randomUUID(),
        use:input.use,
        profileKey:input.profileKey,
        previousAssignmentId:current?.assignmentId || null,
        certificationEventId:input.certificationEventId,
        status:'active' as const,
        createdBy:input.actorId,
        createdAt:new Date().toISOString(),
      })
      assignments.set(input.use,[next,...updated])
      return next
    },
    async rollback(input){
      const rows=[...history(input.use)]
      const current=rows.find(row=>row.status==='active') || null
      if(!current || current.assignmentId!==input.expectedCurrentAssignmentId) throw new Error('platform_model_assignment_conflict')
      if(!current.previousAssignmentId) throw new Error('platform_model_assignment_no_rollback_target')
      const previous=rows.find(row=>row.assignmentId===current.previousAssignmentId)
      if(!previous) throw new Error('platform_model_assignment_rollback_target_missing')
      const updated=rows.map(row=>row.assignmentId===current.assignmentId ? Object.freeze({ ...row,status:'rolled_back' as const }) : row)
      const next=Object.freeze({
        assignmentId:randomUUID(),
        use:input.use,
        profileKey:previous.profileKey,
        previousAssignmentId:current.assignmentId,
        certificationEventId:previous.certificationEventId,
        status:'active' as const,
        createdBy:input.actorId,
        createdAt:new Date().toISOString(),
      })
      assignments.set(input.use,[next,...updated])
      return next
    },
  }
  return Object.freeze(port)
}
