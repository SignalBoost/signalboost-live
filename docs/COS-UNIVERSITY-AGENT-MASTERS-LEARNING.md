# University: agent-aware Master's study worker

Date: 2026-09-11. Companion: ONBOARD.md, SKILLS.md, COS-UNIVERSITY-AGENT-CAPSTONE.md.

## Bounded release

This change converts the Master's learning lane, not the complete graduate pipeline. The learning cron scans the complete registered-agent list, rotates its starting point by absolute half-hour, and executes at most one claimed study batch. An inactive or already-claimed agent does not consume the batch; a persistent failure cannot monopolize later starting positions. Existing schedules, authentication and zero-external-cost acquisition policy remain unchanged.

Every enrollment, assessment, credential, coursework-evidence and study-plan read uses the requested agent. COS's historical plan and slot keys are preserved; other agents receive disjoint identities even in the same program/module/slot. Plan writes and accepted study proof remain agent/program/module bound. Run completion is checked against the same agent and program and must persist. Missing infrastructure, invalid registry identity, an invalid program, a foreign shared-admission state or a scope conflict fails closed.

An enrollment alone is insufficient: the current host-computed admission decision must still establish the learner's own undergraduate credential and current competence. Unresolved undergraduate remediation vetoes graduate admission readiness without deleting the historical credential. Before accepted study advances a plan, the worker rechecks registered role, active program and admission eligibility. A changed state cannot silently advance study. Shared admission snapshots now carry explicit agent identity; another learner's snapshot is rejected.

Acquisition uses the existing governed shared source corpus. Only accepted gap references from the learner's selected plans can advance those plans. Probationary documents, another plan's accepted gap, study activity, or the model's claims cannot award academic credit. Receipts explicitly distinguish acquisitionInvoked=false from actual acquisition. No new enrollment, exam result, credential, authority or specialist admission permission is created by this lane.

## Remaining graduate work

Specialist Master's exam execution, practical-evidence attribution and degree-completion workers remain separate unfinished paths. The existing specialist Master's admission deferral is deliberately retained until those workers are ready. Unsupported program values still fail closed against the existing database catalog; this change does not broaden the five-program learning-ledger constraint to additional catalog tracks.

## Validation boundary

Thirteen focused Node tests passed. They execute the actual checked-in learning/runtime functions with injected host ports, as well as key, admission and scheduling policies. The same test set failed in five cases against the exact prior source snapshots and passed after the changes. Baseline runtime, learning-worker and existing-test content was checked against Git blob hashes. Source syntax checks passed. Local validation is a focused source assembly because GitHub DNS resolution prevents a full checkout; full repository CI/typechecking and Preview remain required.

A read-only Supabase inspection at 2026-09-11T20:55:17.372885Z confirmed existing agent_id/program columns, unique slot_key, and service-role SELECT/INSERT/UPDATE permissions. It found two registered agents, no Master's enrollments and no credentials. No migration or Production data mutation was needed. Local fixtures never reached Production.

After current-head checks pass, verify the exact merged commit and deployment, then collect genuine Production lane receipts. A no-enrollment evaluation is proof of that blocked evaluation, not acquired knowledge, completed coursework, a graduate exam, or a degree. Never fabricate eligibility or bypass the foundation to obtain a receipt.
