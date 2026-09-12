# University accepted-study delivery to Specialist practice

## Production observation

On commit `27034fb`, the registered Software Specialist received two newly accepted study items
for plan `29998dad-519b-4ae4-b8aa-4fa2e02445f9` on September 12, 2026 at 03:47 UTC.
Its own practice run `3e7c1bad-c0c3-41ca-9f88-e1c65602511b` then failed the unchanged rubric.
The atomic recorder correctly reopened study and discarded the stale sibling exercise.
That is genuine failure/remediation execution, not a successful re-examination.

The execution carried SHA-256 of `[]` as contextHash. Code verification showed practice loaded
only independently validated procedures; the newly admitted source material was not supplied.
The acquisition receipt retained counts and gap IDs but lacked exact admitted-content references.
No causal claim is made that missing context alone explains the scored failure.

## Repair boundary

- Record bounded content hashes in the existing per-gap diagnostics only after durable admission
  succeeds. Rejects, duplicates, probationary candidates and failed writes do not produce references.
- For practice only, resolve the exact claimed queue, same-agent current study plan, accepted proof,
  matching completed acquisition run and exact retained content hashes. No title/time guesswork.
- Read at most four admitted public-source excerpts. Source text remains untrusted reference data,
  not validated procedures, case facts, tool instructions, grading evidence or authority. Excerpts
  are serialized only in the lower-trust user/data message; system instructions contain no source text.
- Hash the actual source packet into execution context/prompt provenance and retain the source
  hashes, acquisition run, plan and attempt identifiers in the existing execution evidence.
- Keep independent exams/capstones byte-equivalent in their input framing and token budget. Their
  material-loading port is never called. Preserve the existing post-inference/atomic study fences.
- Missing historical content receipts fail closed; do not manufacture links from titles, timestamps,
  old counters or reviewer knowledge. A fresh governed study attempt must supply a real receipt.

No new database, migration, schema permission, external endpoint, inference provider, approval,
academic grade, credential or admission/scoring threshold is introduced. This supplies study input;
it is not proof of permanent model learning, improved retention, transfer or graduation.

## Local evidence

Five reconstructed existing files were checked against their exact Git blob hashes before editing.
The actual baseline practice composer ignored the admitted-material port; the same regression
passes on the repair and verifies that the material reaches inference with recorded provenance.
Fourteen focused tests cover receipt/identity/time/round/source validation, bounded source packets,
actual practice delivery, unchanged independent examination, unavailable study, and actual cycle
admission outcomes using injected I/O. All pass, zero failed/skipped. Pure modules pass strict tsc.
The existing seven inference/atomic-fence tests remain unchanged and import the new suite.

Full repository CI/Preview and exact-merge Production are separate release gates. Live acceptance
requires an actual new source-hash receipt, a Specialist practice execution carrying that packet,
and an independently scored subsequent examination/remediation. Idle or skipped cron calls cannot
substitute. No live successful full learning/retest cycle is claimed by these local tests.


## Review correction

The first candidate embedded source excerpts in the system message. The review correctly identified
that prose labels alone do not create message-role isolation. Source text now travels only in the
user/data message, before the explicit host practice case; system instructions reject commands from
source titles, excerpts or URLs. A hostile-source regression checks that none of its content enters
the system message and that provenance hashes the actual composed user message. Independent exam
inputs remain byte-equivalent. This is structural isolation, not a claim that all prompt-injection
risk or every possible model response has been eliminated.
