# COS University LangGraph research orchestration

## Purpose

This module gives COS University a bounded, recoverable research workflow for questions that require many papers, documents, or other governed sources. LangGraph coordinates the work; it does not become a new source of truth, model provider, academic examiner, credential issuer, or authorization authority.

The graph lives at:

`saas/lib/cos-core/orchestration/university-research.ts`

## Flow

```text
research question
  -> plan source set
  -> bounded parallel source research
  -> validate provenance for every successful source
  -> preserve per-source failures
  -> map cross-source contradictions
  -> synthesize evidence and disagreements
  -> specialist review
  -> durable handoff
```

Every completed stage writes a caller-supplied checkpoint. A later invocation can resume from that checkpoint without repeating already-completed source acquisition or analysis.

## Bounded research

Defaults and hard ceilings are host-controlled:

- default selected sources: 24;
- hard maximum selected sources: 64;
- default source concurrency: 4;
- hard maximum source concurrency: 8;
- source-plan truncation is explicit in `planStats.truncatedSources` rather than silent;
- one source failure is preserved as evidence and does not erase successful sibling results.

These limits bound one graph invocation. A caller that needs broader coverage must create another governed research run rather than silently widening the current run.

## Provenance contract

A successful source result must contain:

- the exact planned source identity;
- at least one provenance record;
- the exact planned source URI;
- a valid observation time;
- a source summary or one or more claims.

Invalid or provenance-free source output becomes a recorded source failure. It cannot enter synthesis as evidence. If every source fails, synthesis is skipped and a specialist cannot approve the result for handoff.

The graph does not weaken the existing continuous-learning admission rules. Durable University learning, semantic distillation, source confidence, duplicate handling, Knowledge Graph storage, and other evidence policies remain owned by their existing controllers.

## Contradictions are first-class evidence

Cross-source disagreement is not flattened away during summarization. The contradiction stage receives the complete validated evidence set and must return explicit records containing:

- the disagreement topic;
- both incompatible statements;
- at least two researched source identities;
- optional evidence references.

Synthesis, specialist review, checkpointing, and durable handoff all receive the contradiction records separately from the narrative synthesis.

## Specialist review and durable handoff

A specialist review is mandatory before handoff. It can return only:

- `approved_for_handoff`; or
- `needs_revision`.

The caller supplies the durable handoff implementation. That boundary is where the reviewed research package can be persisted into the appropriate University evidence store, Knowledge Graph workflow, research dossier, or later study pipeline. The graph itself does not assume a database or provider.

## Academic authority boundary

The graph has **no academic authority**. Its result explicitly reports:

`academicAuthority: 'none'`

It must not:

- award a subject pass;
- write an academic grade;
- issue a credential;
- declare mastery;
- waive an unseen exam, transfer exam, capstone, practical-outcome gate, or delayed-retention requirement;
- widen agent or specialist operational authority.

All existing COS University independent examination, grading, graduation, retention, Production-evidence, and credential controllers remain authoritative.

## Checkpoint / recovery contract

Checkpoint stages are:

1. `planned`
2. `researched`
3. `contradictions_mapped`
4. `synthesized`
5. `reviewed`
6. `handed_off`

A resume checkpoint must match the same `runId`, `agentId`, subject, research question, and context references. Mismatched checkpoints fail closed. Resuming begins after the last completed stage.

## Provider neutrality

The graph contains no hosted-provider fallback and no hard-coded model choice. Planning, source analysis, contradiction detection, synthesis, and specialist review are injected dependencies. Existing COS provider policy and local/private inference rules remain outside and authoritative over those implementations.

## Acceptance scope

This implementation establishes and tests the orchestration foundation. It is not, by itself, proof that a Production University route has executed a large research run. Production acceptance requires a separately wired caller plus deployment-bound runtime evidence under the repository's normal evidence rules.
