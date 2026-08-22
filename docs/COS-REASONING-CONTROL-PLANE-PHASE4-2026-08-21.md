# COS Reasoning Control Plane — Phase 4

## Purpose

Phase 4 closes the measured-outcome loop for COS reasoning routing. COS can now derive a worker/model preference for a bounded problem class from independently verified outcomes, latency, and explicitly configured estimated token cost.

## What is measured

For each reasoner turn, COS records only derived execution metadata keyed by `turn_id`:

- problem class
- worker role
- reasoner/model label
- worker latency
- estimated input/output tokens
- estimated monetary cost when per-million pricing is explicitly configured

Raw prompts and raw answers are not persisted in the worker-metrics table.

Quality remains independent from execution telemetry. `cos_turn_outcomes` supplies verified success, repair-needed, and escalation evidence after the fact.

## Learning policy

The routing profile is derived on read; there is no mutable weights table.

A preference requires:

- at least two worker/model alternatives for the same problem class
- at least 8 independently verified outcomes per alternative by default
- either a meaningful verified-quality margin, or near-equal quality plus a meaningful cost/latency improvement

Insufficient evidence and close results produce no behavior change.

Repair and escalation evidence reduce the quality score. Latency or estimated cost can break a near-quality tie, but cannot rescue an option with materially worse verified quality.

## Safety boundaries

- verifier routes remain pinned to the deterministic verifier policy and cannot be replaced by outcome learning
- explicit specialist requests and explicit primary overrides remain authoritative
- closed-model escalation remains outside the default reasoning worker set
- a historically preferred model label is advisory unless that model is explicitly registered/available
- no automatic model download, provider registration, or closed-provider promotion is performed
- preference lookup fails closed to deterministic Phase 3 routing

## Cost semantics

Monetary cost is explicitly an estimate until provider-returned billing usage is captured. Configure:

- `LOCAL_AI_INPUT_COST_PER_MILLION`
- `LOCAL_AI_OUTPUT_COST_PER_MILLION`

If either is absent, monetary cost is unknown and the efficiency tie-break falls back to measured latency. No provider price is hard-coded.

## Comparative evidence

Normal routing does not deliberately send duplicate production requests to alternate workers. Comparative evidence can accumulate through controlled benchmarks, explicit specialist evaluations, model migrations, and later opt-in experiments. COS will not create a winner from one observed alternative.
