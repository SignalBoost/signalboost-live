import { resolveHarnessManifest } from '../core/policy.ts'
import type { HarnessCapabilityResolverPort } from '../capabilities/resolver.ts'
import type { GovernedHarnessExecutor } from '../runtime/governed-executor.ts'
import { runHarnessWorker, type HarnessWorkerPort } from '../runtime/runner.ts'
import type { HarnessTrajectoryVerifier } from '../verification/outcome-verifier.ts'
import type { BuilderResidencyExactArtifactExecutor } from './builder-case-runner.ts'

/**
 * Canonical exact-artifact Residency executor over the shared live Platform Harness.
 * It re-resolves the manifest at execution time and refuses identity/artifact drift.
 */
export function createBuilderResidencyHarnessExecutor(input:{
  capabilities:HarnessCapabilityResolverPort
  executor:GovernedHarnessExecutor
  worker:HarnessWorkerPort
  verifier:HarnessTrajectoryVerifier
}):BuilderResidencyExactArtifactExecutor{
  return Object.freeze({
    async run(call){
      const policy=resolveHarnessManifest(call.request,call.authority)
      if(policy.allowed===false) throw new Error('residency_execution_manifest_rejected')
      const requested=call.request.identity.artifact
      const bound=policy.manifest.identity.artifact
      if(!requested?.artifactId||!requested.artifactHash||!bound?.artifactId||!bound.artifactHash) throw new Error('residency_exact_artifact_missing')
      if(requested.artifactId!==bound.artifactId||requested.artifactHash!==bound.artifactHash||requested.revision!==bound.revision) throw new Error('residency_exact_artifact_drift')
      if(policy.manifest.profile!=='residency'||policy.manifest.environment.class!=='sandbox') throw new Error('residency_execution_boundary_invalid')
      return runHarnessWorker({manifest:policy.manifest,capabilities:input.capabilities,executor:input.executor,worker:input.worker,verifier:input.verifier})
    },
  })
}
