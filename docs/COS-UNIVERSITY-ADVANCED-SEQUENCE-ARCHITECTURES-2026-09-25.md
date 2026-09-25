# COS University — Advanced Sequence Architecture Roadmap

Date: 2026-09-25  
Status: research-only; no Production activation

## Purpose

The University should study sequence architectures that can reduce the long-context compute and memory limits of standard softmax attention without weakening the existing artifact, safety, authority, training-rights, evaluation, rollback, or promotion contracts.

This track is deliberately separate from the current Qwen3-4B QLoRA/GKD production-training lane.

## Source-derived research directions

The reviewed material identifies four relevant directions:

1. **Linear attention / linear RNN state**
   - Reorders the attention computation so historical key/value information is compressed into a recurrent matrix-valued state.
   - The state size is independent of sequence length, unlike the standard KV cache whose memory grows with context length.
   - Plain linear attention can underperform softmax attention, so efficiency alone is not sufficient evidence for adoption.

2. **Chunkwise-parallel training**
   - Splits long sequences into chunks.
   - Preserves recurrent state transfer between chunks while parallelizing work inside each chunk.
   - This is the practical training pattern to benchmark rather than a purely sequential reference implementation.

3. **Delta/gated memory updates**
   - Replaces blind accumulation with error-driven or gated updates that can overwrite stale key/value associations.
   - Candidate families include DeltaNet-style updates and later gated/structured variants.
   - These are new model architectures; they are not ordinary LoRA patches to the current Qwen attention mechanism.

4. **Test-Time Training (TTT) / adaptive inference**
   - Updates a bounded subset of model state or parameters while processing context.
   - This is potentially useful for very long-context reasoning and continual adaptation, but it changes the meaning of an immutable artifact unless transient state is explicitly governed.

## University invariants

### Existing Production lane remains authoritative

- `Qwen/Qwen3-4B` remains the current mass-distillation student.
- The existing QLoRA/GKD, exact-artifact identity, holdout, independent evaluator, safety/transfer/retention, rollback and promotion gates remain unchanged.
- Linear attention, DeltaNet, gated linear attention and TTT are **not enabled in the current Production training or serving paths**.
- No research-track result may silently replace standard Qwen attention.

### Research artifacts are separate identities

A model whose sequence architecture differs from the canonical Qwen base is a separate architecture artifact, not merely another adapter revision. Its receipt must bind:

- base architecture and immutable source revision;
- attention/memory architecture profile;
- training implementation/profile;
- serving implementation/profile;
- context length and chunk configuration;
- recurrent-state schema, if any;
- exact evaluator implementation;
- artifact hash and rollback target.

### TTT state is ephemeral by default

Test-time adaptation must initially run with **non-persistent transient state**:

- reset between independent evaluation cases;
- no automatic carryover between users, tenants, subjects, or sessions;
- no private/user content written back into University training corpora;
- no change to long-lived model weights or graduate artifacts;
- no authority expansion through learned state;
- no network/tool permissions derived from adaptive state.

Persistent TTT memory requires a separate explicit governance design and must not be inferred from ordinary model-serving permission.

### Security and Self-Healing boundaries

Self-Healing may observe runtime health, memory pressure, state corruption, latency and failed experiments. It may reset or quarantine a research runtime when policy permits. It must not:

- enable a research architecture;
- persist TTT state;
- increase experimental traffic;
- weaken evaluation thresholds;
- substitute a different architecture when exact identity is required.

## Experimental order

### Phase A — benchmark the current baseline

Measure the present Qwen3-4B path at increasing context lengths:

- prompt prefill latency;
- decode latency;
- peak GPU memory;
- KV-cache memory;
- tokens/second;
- holdout quality;
- long-range retrieval/reasoning quality.

This baseline is required before claiming any architectural improvement.

### Phase B — offline Linear/Delta research

Implement isolated research notebooks/workers or disposable GPU jobs using rights-cleared public/synthetic data. Compare:

- softmax attention control;
- basic linear attention;
- gated/Delta-style state updates;
- chunk-size variants.

No Production traffic and no graduate eligibility.

### Phase C — sandboxed TTT

Run TTT only in an isolated evaluation runtime with reset-on-case semantics. Record:

- parameters/state allowed to adapt;
- update objective;
- number of online update steps;
- transient-state hash;
- reset proof;
- latency/memory overhead;
- quality gain or regression.

The baseline artifact must remain byte-identical.

### Phase D — independent evidence

A candidate architecture advances only if it demonstrates a useful trade-off on the existing University gates plus long-context-specific evidence. Lower memory or higher throughput alone is not sufficient.

### Phase E — bounded architecture canary

Only after training and serving implementations are identical and independently validated may the University create a small deterministic architecture canary. Architecture experiments must remain isolated from optimizer experiments such as Muon during their first comparison.

## Relationship to XSA

XSA is the nearer-term attention experiment because it preserves the standard Q/K/V attention computation and makes a bounded correction to its output. Linear/Delta attention and TTT are more invasive and remain in this Advanced Sequence Architecture research track.

Do not combine XSA, Muon, Linear/Delta attention and TTT in an initial experiment. Each variable must first establish independent evidence.
