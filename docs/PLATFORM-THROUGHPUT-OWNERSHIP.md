# Platform Throughput Ownership

Status: platform-wide architecture rule.

## Rule

Throughput and capacity belong to the deployment owner/buyer.

SignalBoost/iTMounts must not impose arbitrary product-level ceilings on ingestion rate, queue depth,
worker count, model-training concurrency, evaluation concurrency, GPU count, batch inventory, corpus
scan size, request parallelism, or other capacity dimensions when the buyer's authorized infrastructure
can safely support more.

The platform may provide conservative defaults for its own hosted/reference environment. Defaults are
not product limits. Buyer-owned deployments must be able to raise or lower capacity through governed
configuration without source-code edits.

This rule applies across the platform, not only to distillation. Shared runtimes, Builder, Concierge,
COS, specialists, workflow engines, learning pipelines, provider adapters, queues, background workers,
and future portables should treat throughput as owner capacity policy rather than vendor authority.

## Separation of concerns

Buyer-controlled throughput does not weaken platform governance. These remain independently enforced:

- tenant and data isolation;
- provenance, licensing, privacy, and data-use authorization;
- explicit authorization for consequential actions;
- buyer-selected spending/budget policy;
- provider and infrastructure permissions;
- integrity, safety, evaluation, evidence, and rollback gates;
- fail-closed provider substitution where configured;
- truthful telemetry and audit records.

A safety or authority gate may block an unauthorized action. It must not be disguised as a fixed
vendor throughput ceiling.

Provider, operating-system, cloud-account, database, network, or physical-resource constraints may
limit achievable throughput. Those are observed capacity constraints, not SignalBoost product limits.
The platform should surface them explicitly and let the owner decide whether to add capacity, change a
provider, or lower the requested operating target.

## Scaling contract

The reusable platform core should be horizontally scalable and capacity-aware. In normal operation it
should discover or receive the buyer's capacity profile and adapt queue depth, sharding, worker pools,
GPU pools, and pipeline concurrency to that profile.

Reference pattern:

```text
buyer capacity profile
  -> ingestion/sharding
  -> normalization + rights/provenance admission
  -> prepared work inventory
  -> parallel execution/training pools
  -> parallel independent evaluation
  -> governed promotion/deployment
  -> telemetry + autoscaling feedback
```

The platform should expose only real supported capacity and should report provider/infrastructure limits
truthfully. It must never silently reduce a buyer-requested throughput target because of an arbitrary
hard-coded SignalBoost limit; if an external provider or physical resource is the constraint, report
that constraint explicitly.

## University/reference environment

COS University remains a small reference/proof environment with its own owner-approved spend and
authority policy. Its $25 rolling training authority and one-live-campaign rule are University policy,
not commercial architecture limits. Non-spending preparation and scale tests should exercise larger
capacity profiles so the reusable design is proven independently of the small reference budget.
