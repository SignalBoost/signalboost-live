// saas/agent-operations-host/signalboostAgentOperationsHost.ts
//
// THE MISSING HALF OF THE AGENT OPERATIONS PLATFORM.
//
// Every other portable ships as a pair: a host-agnostic core, and a host adapter that binds
// it to one deployment's real infrastructure. The Agent Operations Platform never got the
// second half. The consequence was not cosmetic — `new AgentWorkflowCoordinator(...)`
// appeared in exactly ONE place in the entire repository, a test file, because assembling it
// by hand takes nine dependencies and nobody had written that down anywhere. A control plane
// that cannot be constructed outside a test is not a product.
//
// This file is that assembly, and nothing more. It adds no capability and invents no
// workload. It is deliberately honest about what is missing:
//
//   • NO SANDBOX PROVIDER IS FABRICATED. loadAgentSandboxProviderConfig defaults to
//     'disabled', and a remote provider is built ONLY when the environment explicitly
//     enables one AND the caller supplies a transport. Absent either, the registry returns
//     the disabled provider, which refuses work with a stated reason rather than pretending.
//   • NO PATCH GENERATOR IS FABRICATED. Repair needs a model that writes candidate patches.
//     Until one is supplied, the default generator REFUSES with a clear message, so a
//     workflow ends in a clean, recorded failure instead of a crash or a silent success.
//   • NO ACTIVITY IS FABRICATED. The datastore is INJECTED by the caller — this file never
//     imports a database client, which is also what keeps it testable under `node --test`
//     (the one file in agent-gateway-host that reaches real systems is untestable for
//     exactly that reason). With no store supplied, records are dropped rather than
//     invented, and the portable's card stays "Not connected" until a real workflow really
//     runs, which is the correct reading.
//
// So this makes the portable CONSTRUCTIBLE and INSPECTABLE. It does not make it busy. What
// would make it busy is a real sandbox provider plus a real workload — see
// describeAgentOperationsHost(), which reports exactly which of those is still missing.

import { AgentWorkflowCoordinator } from '../lib/agent-runtime/workflow-coordinator.ts'
import { AgentSandboxQuotaLedger } from '../lib/agent-runtime/provider-quotas.ts'
import { RepairController } from '../lib/agent-runtime/repair-controller.ts'
import { createAgentSandboxProviderRegistry } from '../lib/agent-runtime/provider-registry.ts'
import { DEFAULT_SANDBOX_RUNTIME_POLICY } from '../lib/agent-runtime/policy.ts'
import {
  DISABLED_AGENT_SANDBOX_PROVIDER_CONFIG,
  loadAgentSandboxProviderConfig,
} from '../lib/agent-runtime/provider-config.ts'
import { RemoteCodeSandboxProvider } from '../lib/agent-runtime/providers/remote-provider.ts'

import type { AgentSandboxProviderConfig } from '../lib/agent-runtime/provider-config.ts'
import type { AgentOperationActivityStore } from '../lib/agent-runtime/activity-store.ts'
import type { CodeSandboxProvider, RuntimeLanguage, SandboxCapability } from '../lib/agent-runtime/contracts.ts'
import type { RepairCandidate, RepairCandidateGenerator } from '../lib/agent-runtime/repair-types.ts'
import type { SandboxRuntimePolicy } from '../lib/agent-runtime/policy.ts'

/** Why a workflow refuses when no patch generator has been supplied. */
export const NO_GENERATOR_REASON =
  'No repair candidate generator is configured for this deployment, so no patch can be proposed.'

/** Why nothing is recorded when the datastore is absent. */
export const NO_ACTIVITY_STORE_REASON =
  'No activity store is configured, so workflow outcomes are not durably recorded in this deployment.'

/**
 * The default generator: it refuses.
 *
 * Refusing is the honest default. A stub that returned an empty patch would let a workflow
 * report a clean run having repaired nothing, which is worse than a stated failure.
 */
export function createRefusingCandidateGenerator(reason: string = NO_GENERATOR_REASON): RepairCandidateGenerator {
  return {
    async generateInitial(): Promise<RepairCandidate> {
      throw new Error(reason)
    },
    async generateCorrection(): Promise<RepairCandidate> {
      throw new Error(reason)
    },
  }
}

/** Drops records. Used only when no datastore is configured; never counted as activity. */
export function createNullActivityStore(): AgentOperationActivityStore {
  return {
    async record() {
      /* intentionally dropped — see NO_ACTIVITY_STORE_REASON */
    },
  }
}

export interface AgentOperationsHostOptions {
  /** Defaults to process.env. Passing a plain object makes the host testable. */
  env?: Readonly<Record<string, string | undefined>>
  /** Supplying a transport is what turns an enabled remote config into a real provider. */
  remoteTransport?: ConstructorParameters<typeof RemoteCodeSandboxProvider>[1]
  /** The model that writes candidate patches. Without it, repair refuses. */
  generator?: RepairCandidateGenerator
  /**
   * Where workflow outcomes are recorded. Injected, never imported here: pass
   * createSupabaseAgentOperationActivityStore() from a route. Omitted means dropped.
   */
  activityStore?: AgentOperationActivityStore
  runtimePolicy?: SandboxRuntimePolicy
  supportedLanguages?: readonly RuntimeLanguage[]
  supportedCapabilities?: readonly SandboxCapability[]
  now?: () => number
  createAuditId?: () => string
}

/** What is actually wired in this deployment, and what is not. */
export interface AgentOperationsHostReadiness {
  providerId: AgentSandboxProviderConfig['providerId']
  /** True only when a provider is enabled AND a transport was supplied to reach it. */
  sandboxReady: boolean
  generatorReady: boolean
  activityRecordingReady: boolean
  /** Empty when the portable can genuinely run a workflow end to end. */
  missing: readonly string[]
}

function resolveConfig(env: Readonly<Record<string, string | undefined>>): AgentSandboxProviderConfig {
  try {
    return loadAgentSandboxProviderConfig(env)
  } catch {
    // A malformed sandbox configuration must never silently widen into a working one.
    return { ...DISABLED_AGENT_SANDBOX_PROVIDER_CONFIG }
  }
}

function resolveRemoteProvider(
  config: AgentSandboxProviderConfig,
  options: AgentOperationsHostOptions,
  policy: SandboxRuntimePolicy,
): CodeSandboxProvider | undefined {
  if (config.providerId !== 'remote' || !config.enabled || !options.remoteTransport) return undefined
  try {
    return new RemoteCodeSandboxProvider(config, options.remoteTransport, policy)
  } catch {
    // The provider validates its own configuration and throws on anything unsafe. Falling
    // back to no provider keeps the platform refusing rather than running unsafely.
    return undefined
  }
}

/** Report what is wired without constructing anything that touches the network. */
export function describeAgentOperationsHost(
  options: AgentOperationsHostOptions = {},
): AgentOperationsHostReadiness {
  const config = resolveConfig(options.env ?? process.env)
  const sandboxReady = config.providerId === 'remote' && config.enabled && Boolean(options.remoteTransport)
  const generatorReady = Boolean(options.generator)
  const activityRecordingReady = Boolean(options.activityStore)

  const missing: string[] = []
  if (!sandboxReady) {
    missing.push(
      config.providerId === 'remote'
        ? 'a transport for the configured remote sandbox provider'
        : 'an enabled sandbox provider (AGENT_SANDBOX_PROVIDER is not set to an enabled remote provider)',
    )
  }
  if (!generatorReady) missing.push('a repair candidate generator')
  if (!activityRecordingReady) missing.push('a configured activity store')

  return { providerId: config.providerId, sandboxReady, generatorReady, activityRecordingReady, missing }
}

/**
 * Assemble the coordinator for this deployment.
 *
 * Always returns a working control plane. Whether that control plane can DO anything depends
 * on what the deployment supplies — describeAgentOperationsHost() answers that without
 * running a workflow.
 */
export function createSignalBoostAgentOperationsHost(
  options: AgentOperationsHostOptions = {},
): AgentWorkflowCoordinator {
  const config = resolveConfig(options.env ?? process.env)
  const runtimePolicy = options.runtimePolicy ?? DEFAULT_SANDBOX_RUNTIME_POLICY
  const generator = options.generator ?? createRefusingCandidateGenerator()
  const remoteProvider = resolveRemoteProvider(config, options, runtimePolicy)

  return new AgentWorkflowCoordinator({
    providerConfig: config,
    providerRegistry: createAgentSandboxProviderRegistry(config, remoteProvider),
    quotaLedger: new AgentSandboxQuotaLedger(config),
    runtimePolicy,
    // Code execution is permitted only when a provider is genuinely reachable.
    toolPolicy: { permitsCodeExecution: Boolean(remoteProvider) },
    supportedLanguages: options.supportedLanguages ?? ['typescript', 'javascript'],
    supportedCapabilities: options.supportedCapabilities ?? ['isolated_filesystem'],
    createRepairController: (provider: CodeSandboxProvider) =>
      new RepairController({ provider, generator, policy: runtimePolicy, now: options.now }),
    activityStore: options.activityStore ?? createNullActivityStore(),
    now: options.now,
    createAuditId: options.createAuditId,
  })
}
