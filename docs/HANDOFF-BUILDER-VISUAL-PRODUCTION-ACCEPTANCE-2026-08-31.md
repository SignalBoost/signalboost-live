# Builder and Visual Production Acceptance — 2026-08-31

**Accepted deployment:** `dpl_F22cDaDNCvTrWMGiHfFPSARRFDXh`  
**Accepted implementation:** `901f47c8a034f92de8edd7e472e065381eb2aa09`  
**Canonical host:** `saas.signalboostapp.com`  
**Observation window:** 2026-08-31 20:02–20:05 UTC

## Scope

This record accepts the authenticated one-file Builder debug lane, its asynchronous durable-History contract, strict non-coding routing, and the generic visual objective/render/preview/download path. It does not certify every future repository repair, every image-edit/reference-person case, or any consequential external action.

The observations used one isolated, short-lived authenticated identity and the real Production HTTP routes. The identity and every associated Builder job, Assistant conversation, and workspace were deleted after the observations. Final counts were all zero.

## Builder acceptance — passed

One authenticated request attached a deliberately broken `broken.js` and sent the fixed one-file debug instruction. The exact Production behavior was:

1. `GET /api/assistant/chats` returned HTTP 200.
2. Exactly one `POST /api/builder` returned HTTP 202 with a durable job and workspace.
3. A separate History GET immediately found the durable running turn.
4. History ordering was deterministic: user message order `2039`, assistant message order `2040`.
5. The first command was `node 'broken.js'` and exited `1`.
6. The returned evidence contained the real stack trace: `ReferenceError: result is not defined` at `broken.js:2`.
7. Builder applied exactly one `edit_file` operation.
8. Builder reran the identical command, `node 'broken.js'`.
9. The verification command exited `0`.
10. No second Builder POST or Send was required; read-only job polling observed completion.
11. The same assistant History row changed from running to terminal in place.
12. Reopened History contained both the first failing exit code and the successful verification exit code.
13. The production classifier rejected `does a pay gap exist?` as Builder work.
14. A real pay-gap request created no additional `builder_jobs` row.
15. Post-run cleanup returned Builder jobs, Assistant conversations, and Builder workspaces to zero.

This satisfies the five acceptance conditions in `HANDOFF-BUILDER-ASYNC-HISTORY-2026-08-31.md`.

## Visual objective and delivery acceptance — passed

The same Production deployment was exercised through the authenticated visual and Concierge routes:

1. An 8,001-character request sent through the supported `prompt` envelope returned HTTP 400 with `visual_objective_too_large`.
2. The response reported `objective_source: prompt`, `observed_length: 8001`, and `max_length: 8000`.
3. The obsolete `visual_invalid_objective` error was absent.
4. A generic Concierge request for a minimalist blue-circle image returned HTTP 200 from `concierge-visual`.
5. The structured inline preview returned HTTP 200 as `image/jpeg`, 23,657 bytes.
6. The download returned HTTP 200 with `Content-Disposition: attachment; filename="visual.jpg"`, the normal attachment MIME `application/octet-stream`, and the identical 23,657 bytes.
7. Post-run cleanup returned all application records for the isolated identity to zero.

The temporary acceptance harness initially marked item 6 red only because it incorrectly required an `image/*` MIME for a forced download. Byte equality, attachment disposition, filename, and HTTP status prove that the download itself succeeded. This was an assertion mismatch, not a product failure.

## Security and cleanup

- The acceptance endpoint was Production-only, canonical-host-only, token-locked, time-limited, and never exposed its token or credentials in repository text, responses, or logs.
- It sent exactly one Builder POST and used only authenticated read-only GET requests afterward.
- It performed no deployment, publishing, payment, email, or other consequential external action.
- The isolated auth user and its identity record were deleted.
- Final database verification: auth users `0`, auth identities `0`, Builder jobs `0`, Assistant conversations `0`, Builder workspaces `0` for the acceptance identity.
- The temporary endpoint and its test are removed by the cleanup release. A permanent deployment-gated regression requires them to remain absent.

## Accepted status

The Builder one-file debug path and asynchronous durable-History recovery are **Production-accepted** as of 2026-08-31. The generic visual objective, generation, inline preview, and download path is also **Production-accepted** for the scope described above.
