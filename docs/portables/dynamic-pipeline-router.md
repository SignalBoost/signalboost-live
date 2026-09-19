# Dynamic Pipeline Router Software

## Purpose

Dynamic Pipeline Router is the shared SignalBoost control-plane component for work-driven routing.

When eligible work arrives, the router does not wait for a named vendor or fixed pipeline. It evaluates the compatible pipelines that are healthy and have capacity, then returns the best available route under the buyer's policy.

The router is deliberately separate from MCP, Provider Hub, and durable queue storage:

- **Provider Hub** owns provider/capability/health metadata and buyer-owned connection boundaries.
- **Dynamic Pipeline Router** decides which compatible available pipeline should receive work.
- **Workflow/Supervisor coordination** owns durable work items, leases, fencing, recovery, and exactly-once ownership semantics.
- **MCP** may expose tools/capabilities to agents, but it is not the traffic scheduler.
- **Product-specific execution code** remains responsible for approvals, spend, rights, and consequential actions.

## Routing model

The host submits a workload requirement and a set of candidate pipelines.

A workload identifies at minimum:

- workload ID;
- required capability;
- environment;
- optional allowed or preferred providers;
- optional excluded provider/pipeline IDs after a failure;
- optional maximum cost;
- optional maximum latency;
- whether degraded capacity may be considered.

A pipeline advertises:

- pipeline and provider identity;
- capabilities;
- availability;
- maximum concurrency;
- active leases;
- queue depth;
- recent failure rate;
- optional estimated unit cost;
- optional estimated latency;
- supported environments.

The router filters incompatible or unavailable pipelines and ranks the remainder using health/capacity signals and buyer preferences. Ties are resolved deterministically from workload and pipeline identity.

## Lease-aware claiming

The portable defines a host-injected lease port. After ranking, it may attempt a lease against the best candidate. If that candidate lost its capacity race, the router may try the next ranked compatible candidate.

The router itself does not implement another database or provider registry.

## Failure and rerouting

A failed pipeline can be excluded from the next routing decision so the same workload can move to another compatible route. Automatic rerouting does not mean automatic business authority: execution remains constrained by the consuming product's existing approval, spend, rights, and policy gates.

## First live consumer

COS University mass hosted-teacher generation is the first integrated consumer. OpenAI, Anthropic, xAI, and buyer-added compatible teacher providers are represented as pipeline candidates. The teacher stage asks the shared router for an ordered compatible route and may move missing work to another route within the already-authorized teacher stage.

This removes vendor-name routing from the distillation engine.

## Provider Hub integration

`dynamicPipelineCandidatesFromProviderHub()` adapts Provider Hub capability descriptors into router candidates. It reads only bounded capability/health/capacity metadata. It does not retrieve credentials or create another provider registry.

## Current commercial status

The core router, Provider Hub adapter, lease-port contract, and first live University/Distillation integration are implemented.

The product remains **preview** and non-licensable until a buyer-neutral durable lease host adapter, router-specific telemetry/audit ledger, install package, upgrade/rollback proof, and clean buyer deployment acceptance are completed.
