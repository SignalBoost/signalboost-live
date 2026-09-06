# Builder source history — 2026-09-06

The precision-job explanation accepted after #1905 incorrectly claimed that current files matched the older job's final state. Existing persisted traces had edit excerpts and command output but no full-content identity tied to a run. Current workspace reads could not establish that historical identity.

The host now captures source before every runner dispatch, including both automatic repair-proof paths. Each snapshot stores SHA-256 over full content for up to 200 files, with sorted paths, at most 8,000 excerpt characters per file and 24,000 total excerpt characters per run. Truncation and omitted-file count are explicit. The snapshot is input supplied to the runner, not a post-run or final-job snapshot; generated lockfiles and command-side changes are not retroactively added to it. Execution outcome remains a separate recorded fact. Snapshot data is excluded from the execution reasoner's diagnostic window to avoid crowding out actual tool output.

Both workspace and owner-authorized repository trace serializers retain the bounded snapshot. Existing JSON result/checkpoint persistence provides durability and existing same-user/conversation/repository access gates still apply. No migration, new execution port, new access scope or model change.

Explanation generation and review receive the last three available run snapshots, limited to the selected file paths, separately from current source. The host compares current full-content fingerprints against the last recorded run's snapshot. It never borrows identity from an older run if the last run lacks a snapshot. A same result applies only to that named file at runner input; different establishes different content; unavailable makes no historical identity claim. Legacy snapshots are not invented or backfilled from today's files.

Tests cover real Node execution followed by a workspace mutation, durable serialized old content, different and same identities, bounded large-file excerpts with full fingerprints, omitted files, corrupted complete snapshots, missing/legacy/latest-missing snapshots, both public serializers, and delivery of the same authoritative evidence to generation and both review stages. Existing authorization/deadline and repair regressions remain required. Live acceptance must check a legacy job and a newly recorded job after a later file change.

Local validation: 40 focused tests, all 1009 mandatory regressions and TypeScript passed. Exact head 7d3d6df096be99cc77dea8e7684085f0fe1c2b75 passed ten CI workflows and Preview dpl_FAjXHojE5ZQ3YUXMKAJJWpM1G6oG with no unresolved review threads. #1907 merged at 4967fe8a3f5efb574a2812e1144064411ad803fc; Production dpl_385qSkfTezQZjyED4XWmSr3TQQau was verified READY at that SHA.


## Live comparison

Job 40025dd2-d165-45ab-85cc-4206ce310317 added README.md. Its round-1 npm test passed all fifteen tests with seven captured source fingerprints; its round-3 node cli.js --help passed with eight captured files including the complete README excerpt. The README fingerprint was 8526c2b8ef24b9570678d1a455466ed83c2153eea5afcbe5f7d4da74ac747137.

Later job 97abd8c1-2211-4c2b-8dd0-3f6cff7f6e9e appended a Troubleshooting / Missing input file section and then passed fifteen tests. Its recorded README fingerprint became 14463e173011e246f5958bb55563400cd533119a842e29da7b0504315592a6f5. The other seven fingerprints, including all runtime source and tests, remained identical. The original job's snapshot remained intact after this edit. The later job was nevertheless marked failed with builder_regression_evidence_required; this is an intent-classification defect, not a failed npm test.

The read-only question about whether today's README matched the last command input of the original job returned an accurate answer: different fingerprints, the newly added section, and the old CLI-help command/exit/output kept distinct from the later edit. Runtime review returned supported=true. The explicit legacy identity question for job e22206f9-7008-41c5-aba7-5f0bb880e691 correctly reported unavailable comparison because no historical SHA-256 snapshot exists. Neither question created a new job; the latest scoped job remained the later documentation job.

## Remaining boundaries and discovered routing defects

Repeating the broader legacy precision-repair explanation returned safe raw evidence rather than useful prose. It did not repeat the false match claim, but broad explanation availability is not accepted. A question beginning Does and asking whether the same legacy job's saved source established a match incorrectly entered generic answer-provenance handling; an explicit Explain-question used the correct Builder evidence route. This wording sensitivity is a separate conversation-routing gap.

The documentation request mentioned the existing missing-input-file error as the subject to explain. Current isRepairObjective treats error vocabulary as repair intent unless the opening directive matches its creation exceptions; Extend is absent. The later task therefore required a failing regression that the owner never requested. Its deterministic fallback compounded this by saying proof had not passed despite a recorded zero exit and fifteen passing tests. Correct intent classification and truthful gate-versus-command narration are next. Do not infer that source-history acceptance makes the full engineering harness or every conversation path complete.

Follow-through: #1910 corrected and live-verified the observed documentation classification and Does-question routing failures. See `BUILDER-REQUEST-INTENT-2026-09-06.md` for exact jobs and deployment. Historical failed results remain unchanged. No-new-edit attribution and broad legacy narration remain open.
