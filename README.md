# SignalBoost

SignalBoost is the repository for the SignalBoost platform and Cognitive Operating System (COS).

## Engineering entrypoint

Before changing code, read [`ONBOARD.md`](./ONBOARD.md) and verify the current repository, open pull requests, Production deployment state, and database migrations. `ONBOARD.md` is the canonical engineering/operations handoff.

## COS reasoning boundary

COS uses the configured neural reasoner for ordinary semantic inference. Governed retrieval supplies evidence; deterministic code owns control-plane duties such as freshness, source authority, citation validation, arithmetic, safety, authorization, provenance, system-of-record integrity, and output schemas.

Do not repair ordinary empirical or analytical questions by adding topic-specific answer paragraphs, keyword-to-conclusion maps, or retrieval-order formatters. Improve evidence quality, reasoning instructions, and deterministic validation boundaries so the behavior generalizes.

See [`cos-policy/README.md`](./cos-policy/README.md) for the neural evidence-reasoning policy.