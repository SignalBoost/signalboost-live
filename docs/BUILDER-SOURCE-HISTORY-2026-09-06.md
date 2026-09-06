# Builder source history — 2026-09-06

The precision-job explanation accepted after #1905 incorrectly claimed that current files matched the older job's final state. Existing persisted traces had edit excerpts and command output but no full-content identity tied to a run. Current workspace reads could not establish that historical identity.

The host now captures source before every runner dispatch, including both automatic repair-proof paths. Each snapshot stores SHA-256 over full content for up to 200 files, with sorted paths, at most 8,000 excerpt characters per file and 24,000 total excerpt characters per run. Truncation and omitted-file count are explicit. The snapshot is input supplied to the runner, not a post-run or final-job snapshot; generated lockfiles and command-side changes are not retroactively added to it. Execution outcome remains a separate recorded fact. Snapshot data is excluded from the execution reasoner's diagnostic window to avoid crowding out actual tool output.

Both workspace and owner-authorized repository trace serializers retain the bounded snapshot. Existing JSON result/checkpoint persistence provides durability and existing same-user/conversation/repository access gates still apply. No migration, new execution port, new access scope or model change.

Explanation generation and review receive the last three available run snapshots, limited to the selected file paths, separately from current source. The host compares current full-content fingerprints against the last recorded run's snapshot. It never borrows identity from an older run if the last run lacks a snapshot. A same result applies only to that named file at runner input; different establishes different content; unavailable makes no historical identity claim. Legacy snapshots are not invented or backfilled from today's files.

Tests cover real Node execution followed by a workspace mutation, durable serialized old content, different and same identities, bounded large-file excerpts with full fingerprints, omitted files, corrupted complete snapshots, missing/legacy/latest-missing snapshots, both public serializers, and delivery of the same authoritative evidence to generation and both review stages. Existing authorization/deadline and repair regressions remain required. Live acceptance must check a legacy job and a newly recorded job after a later file change.

Local validation: 40 focused tests, all 1009 mandatory regressions and TypeScript passed. Exact-head CI, Preview, Production and live acceptance pending.
