import assert from 'node:assert/strict';
import test from 'node:test';
import { EAE_CAPABILITY_SCHEMA_VERSION, buildCapabilityRegistrySnapshot, type EnterpriseCapability } from '../lib/autonomous-systems/capability-registry.ts';

const tenant={tenantId:'tenant-a',environmentId:'prod',region:'us'};
const query={tenant,action:'publish',region:'us',riskLevel:'high' as const,includeDegraded:false,maxResults:16};
function capability(overrides:Partial<EnterpriseCapability>={}):EnterpriseCapability{return {schemaVersion:EAE_CAPABILITY_SCHEMA_VERSION,capabilityId:'content.publish',version:'1.0.0',tenant,name:'Content Publish',kind:'workflow',status:'available',supportedActions:['publish'],supportedRegions:['us'],maxRiskLevel:'high',requiresHumanApproval:true,evidenceRefs:['ev1'],metadata:{classification:'internal'},...overrides};}

test('builds deterministic immutable snapshots',()=>{const a=buildCapabilityRegistrySnapshot([capability()],query);const b=buildCapabilityRegistrySnapshot([capability()],query);assert.equal(a.snapshotId,b.snapshotId);assert.ok(Object.isFrozen(a));assert.ok(Object.isFrozen(a.capabilities[0]));assert.deepEqual(a.capabilityIds,['content.publish@1.0.0']);});
test('filters by action, region, status, and risk',()=>{const result=buildCapabilityRegistrySnapshot([capability(),capability({capabilityId:'eu',supportedRegions:['eu']}),capability({capabilityId:'disabled',status:'disabled'}),capability({capabilityId:'low',maxRiskLevel:'low'})],query);assert.deepEqual(result.capabilityIds,['content.publish@1.0.0']);});
test('degraded capabilities require explicit inclusion',()=>{const degraded=capability({status:'degraded'});assert.equal(buildCapabilityRegistrySnapshot([degraded],query).capabilities.length,0);assert.equal(buildCapabilityRegistrySnapshot([degraded],{...query,includeDegraded:true}).capabilities.length,1);});
test('tenant boundary is enforced',()=>{assert.throws(()=>buildCapabilityRegistrySnapshot([capability({tenant:{tenantId:'other',environmentId:'prod'}})],query),/tenant_environment_boundary_violation/);});
test('duplicate capability versions are rejected',()=>{assert.throws(()=>buildCapabilityRegistrySnapshot([capability(),capability()],query),/duplicate_capability_version/);});
test('secret-shaped metadata is rejected',()=>{assert.throws(()=>buildCapabilityRegistrySnapshot([capability({metadata:{apiKey:'x'}})],query),/metadata_secret_rejected/);});
test('bounds and truncation are enforced',()=>{assert.throws(()=>buildCapabilityRegistrySnapshot([], {...query,maxResults:0}),/unbounded_capability_query_rejected/);const result=buildCapabilityRegistrySnapshot([capability(),capability({capabilityId:'second'})],{...query,maxResults:1});assert.equal(result.truncated,true);assert.equal(result.capabilities.length,1);});
test('validates semantic versions and duplicate actions',()=>{assert.throws(()=>buildCapabilityRegistrySnapshot([capability({version:'latest'})],query),/invalid_capability/);assert.throws(()=>buildCapabilityRegistrySnapshot([capability({supportedActions:['publish','publish']})],query),/duplicate_supported_action/);});
