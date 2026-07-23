# AI Code Repair V1 approval tokens

`lib/code-repair/approval.ts` provides the explicit, immutable operator authorization boundary for validated repair proposals. It is deliberately not an application engine: it contains no workspace, filesystem, Git, pull-request, or merge operations.

## Issuance and binding

`CodeRepairApprovalService.issue()` accepts only a proposal that remains non-applying and non-merging, a successful isolated validation report, an approving independent review, an operator identity, a reason, and a bounded issuance/expiry window. It deterministically fingerprints the exact proposal, validation report, and review, then produces a deterministic token ID. Identical approved inputs therefore produce the same token.

Every token has `applicationAllowed: false` and `mergeAllowed: false`. A future separately reviewed application boundary must verify the token and preserve its own human approval controls; possession of a token never applies a patch.

## Verification and audit

`verify()` fails closed if the issued token differs, the proposal/validation/review bindings change, validation is no longer successful and isolated, review no longer approves, the token is expired or revoked, or it was already consumed. Successful verification consumes by default, providing one-time replay protection. Pass `consume: false` only for a non-authorizing preflight check.

The in-memory service records immutable `issued`, `verified`, `consumed`, `revoked`, and rejected audit events, including operator identity and reason for issuance/revocation. Deployments that need retention may persist these sanitized records through a future durable adapter; persisting them must not add automatic application, Git, or merge behavior.

Tokens serialize as canonical JSON using `serializeCodeRepairApprovalToken()` and reject non-canonical or malformed forms during deserialization.
