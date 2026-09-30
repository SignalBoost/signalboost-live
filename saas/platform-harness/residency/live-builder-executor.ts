// saas/platform-harness/residency/live-builder-executor.ts
// @ts-nocheck
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createPortableCapabilityDescriptor } from '../../provider-hub-core/capability-runtime.ts'
import type {
  AgentRequest,
  ConsequenceClass,
  GatewayHost,
  GovernancePolicy,
} from '../../agent-gateway/types.ts'
import { configuredRunpodApiKey } from '../../lib/ai/cos/runpodConfig.ts'
import { BuilderToolLoop } from '../../lib/builder/tool-loop.ts'
import type {
  BuilderAiPort,
  BuilderFile,
  BuilderRunResult,
  BuilderRunnerPort,
  BuilderWorkspacePort,
} from '../../lib/builder/contracts.ts'
import { InMemoryBuilderWorkspace } from '../../lib/builder/workspace.ts'
import { VercelSandboxBuilderRunner } from '../../lib/builder/vercel-sandbox-runner.ts'
import type {
  HarnessAuthorityEnvelope,
  HarnessManifest,
  HarnessVerificationResult,
} from '../core/types.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import type { HarnessCapabilityResolverPort } from '../capabilities/resolver.ts'
import { createGovernedHarnessExecutor } from '../runtime/governed-executor.ts'
import { runHarnessWorker, type HarnessWorkerContext } from '../runtime/runner.ts'
import type { HarnessTrajectoryVerifier } from '../verification/outcome-verifier.ts'
import type { BuilderResidencyExactArtifactExecutor } from './builder-case-runner.ts'
import {
  createRunpodBuilderResidencyModelPort,
  type BuilderResidencyModelPort,
} from './exact-artifact-model.ts'

export const BUILDER_RESIDENCY_NATIVE_CAPABILITIES=Object.freeze([
  'native.builder-residency.files.list',
  'native.builder-residency.file.read',
  'native.builder-residency.file.write',
  'native.builder-residency.file.edit',
  'native.builder-residency.command.run',
] as const)

type NativeCapability=(typeof BUILDER_RESIDENCY_NATIVE_CAPABILITIES)[number]

/**
 * Keep Builder's model-round deadline strictly inside the provider abort deadline.
 * BuilderToolLoop owns one bounded retry on builder_model_round_timeout; equal
 * deadlines let AbortSignal win the race and bypass that retry.
 */
export const BUILDER_RESIDENCY_MODEL_ROUND_TIMEOUT_MS=90_000
export const BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS=110_000
const READ_CAPS=new Set<NativeCapability>([
  'native.builder-residency.files.list',
  'native.builder-residency.file.read',
])
const KIND_BY_CAP:Record<NativeCapability,string>={
  'native.builder-residency.files.list':'residency_files_list',
  'native.builder-residency.file.read':'residency_file_read',
  'native.builder-residency.file.write':'residency_file_write',
  'native.builder-residency.file.edit':'residency_file_edit',
  'native.builder-residency.command.run':'residency_command_run',
}

export function createBuilderResidencyNativeAuthority():HarnessAuthorityEnvelope{
  return Object.freeze({
    manifestRef:'host://platform-harness/builder-residency-native-v1',
    verified:true,
    verifiedBy:'host',
    environments:Object.freeze(['sandbox'] as const),
    capabilities:Object.freeze(BUILDER_RESIDENCY_NATIVE_CAPABILITIES.map(id=>Object.freeze({
      id,
      environments:Object.freeze(['sandbox'] as const),
      mutating:!READ_CAPS.has(id),
      risk:READ_CAPS.has(id)?'read' as const:'write' as const,
      scopes:Object.freeze([
        READ_CAPS.has(id)?'builder.residency.observe':'builder.residency.execute',
      ]),
    }))),
    limits:Object.freeze({
      maxToolCalls:120,
      deadlineMs:240_000,
      maxConcurrency:1,
    }),
  })
}

function nativeCapabilityResolver(bound:HarnessManifest):HarnessCapabilityResolverPort{
  return Object.freeze({
    async resolve(manifest){
      const tenantId=String(manifest.identity.tenantId||'').trim()
      const portableId=String(manifest.identity.portableId||manifest.identity.agentId).trim()
      if(
        manifest.runId!==bound.runId||
        !tenantId||
        !portableId||
        manifest.profile!=='residency'||
        manifest.environment.class!=='sandbox'
      ){
        return Object.freeze({
          satisfied:false,
          resolved:Object.freeze({}),
          missing:Object.freeze(manifest.capabilities.map(item=>item.id)),
          reason:'residency_native_capability_scope_invalid',
        })
      }
      const resolved:Record<string,ReturnType<typeof createPortableCapabilityDescriptor>>={}
      const missing:string[]=[]
      for(const grant of manifest.capabilities){
        if(!BUILDER_RESIDENCY_NATIVE_CAPABILITIES.includes(grant.id as NativeCapability)){
          missing.push(grant.id)
          continue
        }
        const id=grant.id as NativeCapability
        resolved[id]=createPortableCapabilityDescriptor({
          capabilityId:id,
          providerId:'itmounts-native-residency',
          connectionId:`residency:${manifest.runId}`,
          tenantId,
          environmentId:manifest.environment.environmentId,
          risk:READ_CAPS.has(id)?'read':'write',
          availability:'available',
          requiresApproval:false,
          scopes:READ_CAPS.has(id)
            ?['builder.residency.observe']
            :['builder.residency.execute'],
          metadata:{profile:'residency',ephemeral:true},
        })
      }
      return Object.freeze({
        satisfied:missing.length===0,
        resolved:Object.freeze(resolved),
        missing:Object.freeze(missing),
        ...(missing.length?{reason:'residency_native_capability_unavailable'}:{}),
      })
    },
  })
}

function asObject(value:unknown):Record<string,unknown>{
  return value&&typeof value==='object'&&!Array.isArray(value)
    ?value as Record<string,unknown>
    :{}
}
function stringValue(value:unknown,max=20_000):string{
  return String(value??'').slice(0,max)
}
function actionResult<T>(
  result:Awaited<ReturnType<HarnessWorkerContext['execute']>>,
):T{
  if(result.status!=='executed'||!result.gatewayOutcome?.ok){
    throw new Error(
      result.error||
      result.gatewayOutcome?.error||
      'residency_governed_action_failed',
    )
  }
  return result.gatewayOutcome.result as T
}

class GovernedResidencyActionSerial{
  private tail:Promise<void>=Promise.resolve()
  run<T>(task:()=>Promise<T>):Promise<T>{
    const current=this.tail.then(task)
    this.tail=current.then(()=>undefined,()=>undefined)
    return current
  }
}

class GovernedResidencyWorkspace implements BuilderWorkspacePort{
  private sequence=0
  private readonly context:HarnessWorkerContext
  private readonly workspaceId:string
  private readonly serial:GovernedResidencyActionSerial
  constructor(
    context:HarnessWorkerContext,
    workspaceId:string,
    serial:GovernedResidencyActionSerial,
  ){
    this.context=context
    this.workspaceId=workspaceId
    this.serial=serial
  }
  private invoke<T>(
    capabilityId:NativeCapability,
    params:Record<string,unknown>,
  ):Promise<T>{
    // BuilderToolLoop can overlap file operations with command execution. Residency keeps
    // maxConcurrency=1, so EVERY governed action in the practical loop must share one queue.
    const actionId=`workspace-${++this.sequence}`
    return this.serial.run(async()=>{
      const result=await this.context.execute({
        actionId,
        kind:KIND_BY_CAP[capabilityId],
        capabilityId,
        params:{workspaceId:this.workspaceId,...params},
      })
      return actionResult<T>(result)
    })
  }
  listFiles(_workspaceId:string){
    return this.invoke<readonly Pick<BuilderFile,'path'|'updatedAt'>[]>(
      'native.builder-residency.files.list',
      {},
    )
  }
  readFile(_workspaceId:string,path:string){
    return this.invoke<BuilderFile|null>(
      'native.builder-residency.file.read',
      {path},
    )
  }
  writeFile(_workspaceId:string,path:string,content:string){
    return this.invoke<BuilderFile>(
      'native.builder-residency.file.write',
      {path,content},
    )
  }
  editFile(
    _workspaceId:string,
    path:string,
    search:string,
    replace:string,
  ){
    return this.invoke<BuilderFile>(
      'native.builder-residency.file.edit',
      {path,search,replace},
    )
  }
}

class GovernedResidencyRunner implements BuilderRunnerPort{
  private sequence=0
  private readonly context:HarnessWorkerContext
  private readonly workspaceId:string
  private readonly serial:GovernedResidencyActionSerial
  constructor(
    context:HarnessWorkerContext,
    workspaceId:string,
    serial:GovernedResidencyActionSerial,
  ){
    this.context=context
    this.workspaceId=workspaceId
    this.serial=serial
  }
  run(input:{
    workspaceId:string
    command:string
    files:readonly BuilderFile[]
  }):Promise<BuilderRunResult>{
    const actionId=`run-${++this.sequence}`
    return this.serial.run(async()=>{
      const result=await this.context.execute({
        actionId,
        kind:KIND_BY_CAP['native.builder-residency.command.run'],
        capabilityId:'native.builder-residency.command.run',
        params:{
          workspaceId:this.workspaceId,
          command:input.command,
        },
      })
      return actionResult<BuilderRunResult>(result)
    })
  }
}

function residencyGovernancePolicy():GovernancePolicy{
  const valid=new Set<NativeCapability>(BUILDER_RESIDENCY_NATIVE_CAPABILITIES)
  return Object.freeze({
    classifier:{
      classify(request:AgentRequest):ConsequenceClass{
        const target=request.action.target as NativeCapability
        return valid.has(target)&&request.action.kind===KIND_BY_CAP[target]
          ?'reversible_internal'
          :'unknown'
      },
    },
    allowlist:Object.freeze(
      BUILDER_RESIDENCY_NATIVE_CAPABILITIES.map(id=>Object.freeze({
        actionKind:KIND_BY_CAP[id],
        target:id,
        rollback:'discard ephemeral Residency workspace/sandbox',
      })),
    ),
    environment:'sandbox',  })
}

async function allFiles(
  workspace:InMemoryBuilderWorkspace,
  workspaceId:string,
):Promise<readonly BuilderFile[]>{
  const listed=await workspace.listFiles(workspaceId)
  const files=await Promise.all(
    listed.map(item=>workspace.readFile(workspaceId,item.path)),
  )
  return Object.freeze(
    files.filter((item):item is BuilderFile=>Boolean(item)),
  )
}

function nativeGatewayHost(input:{
  manifest:HarnessManifest
  workspace:InMemoryBuilderWorkspace
  runner:BuilderRunnerPort
  workspaceId:string
  markInfrastructureFailure:(code:string)=>void
}):GatewayHost{
  return Object.freeze({
    execution:{
      async perform(request){
        const params=asObject(request.action.params)
        const harness=asObject(params._harness)
        if(
          harness.profile!=='residency'||
          harness.environmentClass!=='sandbox'||
          harness.environmentId!==input.manifest.environment.environmentId||
          params.workspaceId!==input.workspaceId
        ){
          return {ok:false,error:'residency_native_scope_mismatch'}
        }
        try{
          switch(request.action.target as NativeCapability){
            case 'native.builder-residency.files.list':
              return {
                ok:true,
                result:await input.workspace.listFiles(input.workspaceId),
              }
            case 'native.builder-residency.file.read':
              return {
                ok:true,
                result:await input.workspace.readFile(
                  input.workspaceId,
                  stringValue(params.path,240),
                ),
              }
            case 'native.builder-residency.file.write':
              return {
                ok:true,
                result:await input.workspace.writeFile(
                  input.workspaceId,
                  stringValue(params.path,240),
                  stringValue(params.content,512*1024),
                ),
              }
            case 'native.builder-residency.file.edit':
              return {
                ok:true,
                result:await input.workspace.editFile(
                  input.workspaceId,
                  stringValue(params.path,240),
                  stringValue(params.search,64*1024),
                  stringValue(params.replace,64*1024),
                ),
              }
            case 'native.builder-residency.command.run':{
              const files=await allFiles(input.workspace,input.workspaceId)
              return {
                ok:true,
                result:await input.runner.run({
                  workspaceId:input.workspaceId,
                  command:stringValue(params.command,2000),
                  files,
                }),
              }
            }
            default:
              return {ok:false,error:'residency_native_capability_unknown'}
          }
        }catch(error){
          const code=error instanceof Error
            ?error.message
            :'residency_native_execution_failed'
          if(/sandbox|infrastructure|capacity|network/i.test(code)){
            input.markInfrastructureFailure(code)
          }
          return {ok:false,error:code}
        }
      },
    },
  })
}

function evidenceRef(input:{
  manifest:HarnessManifest
  command:string
  proof:BuilderRunResult
  files:readonly BuilderFile[]
}):string{
  const digest=createHash('sha256').update(JSON.stringify({
    profile:'builder-residency-practical-proof-v1',
    runId:input.manifest.runId,
    artifactHash:input.manifest.identity.artifact?.artifactHash,
    command:input.command,
    exitCode:input.proof.exitCode,
    timedOut:input.proof.timedOut,
    files:input.files.map(file=>({
      path:file.path,
      hash:createHash('sha256').update(file.content).digest('hex'),
    })),
  })).digest('hex')
  return `evidence://builder-residency/${digest}`
}

function exactArtifactBuilderAi(input:{
  modelPort:BuilderResidencyModelPort
  identity:{
    candidateId:string
    artifactId:string
    artifactHash:string
    revisionKey:string
  }
  markInfrastructureFailure:(code:string)=>void
}):BuilderAiPort{
  return Object.freeze({
    async generate(request){
      try{
        const out=await input.modelPort.complete({
          identity:input.identity,
          system:request.systemPrompt,
          user:request.prompt,
          maxTokens:request.maxTokens,
          signal:request.signal,
        })
        if(out.exactArtifact!==true||!out.text.trim()){
          throw new Error('residency_exact_artifact_response_invalid')
        }
        return out.text
      }catch(error){
        if(request.signal?.aborted){
          throw new Error('builder_model_round_timeout')
        }
        const code=error instanceof Error
          ?error.message
          :'residency_exact_artifact_inference_failed'
        input.markInfrastructureFailure(code)
        throw error
      }
    },
  })
}

/**
 * Live practical Residency executor.
 *
 * #2900 owns exact-artifact inference. This layer owns the practical Harness:
 * model-controlled workspace reads/mutations and commands cross runGoverned();
 * the independent verifier then reruns the case proof against the final ephemeral files.
 */
export function createLiveBuilderResidencyExecutor(input:{
  db:SupabaseClient
  sandboxRunner?:BuilderRunnerPort
  modelPortFactory?:()=>BuilderResidencyModelPort
  /**
   * Bounded exact-artifact readiness wait for THIS case. The cron passes what is left of its own invocation after
   * reserving the harness deadline, so a cold start can never outlive the function and leave the case unrecorded.
   */
  readyTimeoutMs?:number
}):BuilderResidencyExactArtifactExecutor{
  const readyTimeoutMs=Number.isFinite(Number(input.readyTimeoutMs))&&Number(input.readyTimeoutMs)>0
    ?Math.min(360_000,Math.max(30_000,Math.floor(Number(input.readyTimeoutMs))))
    :360_000
  return Object.freeze({
    async run(call){
      const decision=resolveHarnessManifest(call.request,call.authority)
      if(decision.allowed===false){
        throw new Error('residency_execution_manifest_rejected')
      }
      const manifest=decision.manifest
      const artifact=manifest.identity.artifact
      const candidateId=String(call.candidateId||'').trim()
      const revisionKey=String(artifact?.revision||'').trim().toLowerCase()
      if(
        !candidateId||
        !artifact?.artifactId||
        !artifact.artifactHash||
        !/^[a-f0-9]{64}$/.test(revisionKey)
      ){
        throw new Error('residency_exact_artifact_identity_missing')
      }
      if(
        manifest.profile!=='residency'||
        manifest.environment.class!=='sandbox'
      ){
        throw new Error('residency_execution_boundary_invalid')
      }
      if(!manifest.capabilities.every(item=>
        BUILDER_RESIDENCY_NATIVE_CAPABILITIES.includes(
          item.id as NativeCapability,
        )
      )){
        throw new Error(
          'residency_live_native_capability_boundary_required',
        )
      }

      const workspace=new InMemoryBuilderWorkspace()
      const workspaceId=`${manifest.runId}:workspace`
      for(const file of call.practiceCase.seedFiles){
        await workspace.writeFile(
          workspaceId,
          file.path,
          file.content,
        )
      }

      const runner=input.sandboxRunner??new VercelSandboxBuilderRunner()
      let infrastructureFailure:string|null=null
      const markInfrastructureFailure=(code:string)=>{
        const specific=String(code??'').trim()
        if(!specific) return
        // Never let the generic routing bucket overwrite the provider/runtime cause.
        if(specific==='environment_provider_or_tool_infrastructure_failed'){
          infrastructureFailure=infrastructureFailure??specific
          return
        }
        if(!infrastructureFailure||infrastructureFailure==='environment_provider_or_tool_infrastructure_failed'){
          infrastructureFailure=specific
        }
      }
      const apiKey=configuredRunpodApiKey()
      if(!input.modelPortFactory&&!apiKey){
        throw new Error('residency_runpod_key_missing')
      }
      const modelPort=input.modelPortFactory
        ?input.modelPortFactory()
        :createRunpodBuilderResidencyModelPort({
          db:input.db,
          apiKey:apiKey!,
          timeoutMs:BUILDER_RESIDENCY_PROVIDER_TIMEOUT_MS,
          readyTimeoutMs,
        })

      const modelIdentity={
        candidateId,
        artifactId:artifact.artifactId,
        artifactHash:artifact.artifactHash,
        revisionKey,
      }
      if(modelPort.prepare){
        try{
          await modelPort.prepare(modelIdentity)
        }catch(error){
          markInfrastructureFailure(
            error instanceof Error
              ?error.message
              :'residency_exact_artifact_runtime_prepare_failed',
          )
        }
      }

      const gatewayHost=nativeGatewayHost({
        manifest,
        workspace,
        runner,
        workspaceId,
        markInfrastructureFailure,
      })
      const executor=createGovernedHarnessExecutor({
        policy:residencyGovernancePolicy(),
        host:gatewayHost,
      })
      const capabilities=nativeCapabilityResolver(manifest)
      const ai=exactArtifactBuilderAi({
        modelPort,
        identity:modelIdentity,
        markInfrastructureFailure,
      })

      const worker={
        async run(context:HarnessWorkerContext){
          if(infrastructureFailure){
            context.observe({
              summary:'Residency exact-artifact runtime was unavailable before practical execution.',
              data:{failureCode:infrastructureFailure},
            })
            return
          }
          const governedActionSerial=new GovernedResidencyActionSerial()
          const governedWorkspace=
            new GovernedResidencyWorkspace(context,workspaceId,governedActionSerial)
          const governedRunner=
            new GovernedResidencyRunner(context,workspaceId,governedActionSerial)
          const deadline=Math.min(
            manifest.limits.deadlineMs??240_000,
            240_000,
          )
          const result=await new BuilderToolLoop(
            ai,
            governedWorkspace,
            governedRunner,
          ).run({
            objective:call.practiceCase.objective,
            workspaceId,
            maxRounds:16,
            modelRoundTimeoutMs:BUILDER_RESIDENCY_MODEL_ROUND_TIMEOUT_MS,
            deadlineAtMs:
              Date.now()+Math.max(60_000,deadline-20_000),
            minimumStepMs:25_000,
          })
          if(!result.ok&&result.error==='builder_model_round_timeout'){
            markInfrastructureFailure('residency_exact_artifact_inference_timeout')
          }
          const observationData:Record<string,unknown>={
            builderOutcome:result.ok?'completed':'incomplete',
            traceSteps:result.trace.length,
          }
          if('error' in result){
            observationData.failureCode=result.error
          }
          context.observe({
            summary:result.ok
              ?'Resident Builder completed the practical work loop.'
              :'Resident Builder stopped before proving practical completion.',
            data:observationData,
          })
        },
      }

      const verifier:HarnessTrajectoryVerifier={
        async verify():Promise<HarnessVerificationResult>{
          if(infrastructureFailure){
            return Object.freeze({
              verified:false,
              verifierRef:
                'host://builder-residency-independent-proof-v1',
              evidenceRefs:Object.freeze([]),
              reason:infrastructureFailure,
              failureAttribution:'infrastructure',
            })
          }
          try{
            const files=await allFiles(workspace,workspaceId)
            const proof=await runner.run({
              workspaceId:`${workspaceId}:verifier`,
              command:call.practiceCase.provingCommand,
              files,
            })
            const ref=evidenceRef({
              manifest,
              command:call.practiceCase.provingCommand,
              proof,
              files,
            })
            const verified=
              proof.exitCode===0&&!proof.timedOut
            return Object.freeze({
              verified,
              verifierRef:
                'host://builder-residency-independent-proof-v1',
              evidenceRefs:Object.freeze([ref]),
              ...(verified
                ?{}
                :{
                  reason:proof.timedOut
                    ?'residency_proof_timed_out'
                    :`residency_proof_exit_${proof.exitCode}`,
                  failureAttribution:'competency' as const,
                }),
            })
          }catch(error){
            return Object.freeze({
              verified:false,
              verifierRef:
                'host://builder-residency-independent-proof-v1',
              evidenceRefs:Object.freeze([]),
              reason:error instanceof Error
                ?error.message
                :'residency_independent_verifier_failed',
              failureAttribution:'infrastructure',
            })
          }
        },
      }

      return runHarnessWorker({
        manifest,
        capabilities,
        executor,
        worker,
        verifier,
      })
    },
  })
}
// end of saas/platform-harness/residency/live-builder-executor.ts (if this line is missing, the paste was cut short)