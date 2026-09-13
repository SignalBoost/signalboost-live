# Mandatory Answer Provenance

**Status:** required runtime invariant  
**Adopted:** 2026-09-13

Every browser-delivered COS/Concierge answer must have server-recorded provenance. A user must be able to ask where the immediately preceding answer came from without trusting the agent to reconstruct its own history.

## Required behavior

- Every delivered answer has an execution-provenance record, including model-only, deterministic, cached, tool-assisted, live-research, timeout, and bounded-fallback answers.
- If live/public evidence materially contributes, the recorded public source URLs are retained and returned on provenance introspection.
- If no live source contributed, provenance still identifies the recorded execution class (for example local reasoner, deterministic server logic, cache, or external-provider class) instead of claiming that provenance is unavailable.
- Public provenance never exposes private provider/model identifiers, credentials, prompts, hidden reasoning, or authorization data.
- Public anonymous/trial answers receive a server-signed provenance capsule bound to the exact normalized answer text. The immediate next-turn provenance lookup verifies the signature and answer hash before using it.
- Signed-in answers also retain durable account-bound provenance server-side.
- The provenance boundary is internal and authenticated by a server-only rewrite secret; direct access fails closed.
- A provenance lookup is deterministic. A reasoning model is never asked to invent or reconstruct where a prior answer came from.

## Trust model

The answer itself is not treated as authority about its origin. Provenance is assembled from server-observed execution state, durable records, tool/source evidence, and signed answer-bound metadata. This lets users inspect evidence and origin instead of treating the agent as an unquestionable source.
