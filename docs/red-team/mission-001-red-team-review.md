# Mission 001 Red Team Review — Production Failure Modes

Date: 2026-07-17
Role: Red Team Lead
Scope: Supervisor, Observer, Thinker, Policy Engine, Dispatcher, BPAL, verification, audit, persistence, operator UI, localization, scheduling, webhook ingestion, provider routing, lease ownership, fencing, durable coordination, and recovery.

## Verdict

Mission 001 is safer than a mutation-capable autonomous repair system because current production-facing paths are largely read-only, fail-closed, metadata-only, and approval-gated. It is still not production-ready for customer-trust-critical supervision because the highest-risk remaining failures are not dramatic provider mutations; they are silent blind spots, false confidence, stale coordination, incomplete audit continuity, deduplication mistakes, health-score masking, and operational ambiguity during partial outages.

If Mission 001 were deployed tomorrow, the biggest reasons it could still fail are ranked in Section 1.

## Evidence reviewed

- `ONBOARD.md` Mission 001 doctrine and constraints.
- Durable coordination schema and RPCs in `saas/supabase/migrations/20260716_supervisor_federated_coordination.sql`.
- Vercel trigger ledger schema in `saas/supabase/migrations/20260717_vercel_observation_triggers.sql`.
- Supabase coordination store in `saas/lib/supervisor/coordination/supabase-coordination-store.ts`.
- Dispatcher validation and in-memory dispatch dedupe in `saas/lib/supervisor/executors/supervisor-dispatcher.ts`.
- Vercel trigger ingestion, webhook normalization, and scheduled work acceptance in `saas/lib/supervisor/providers/vercel/trigger-ingestion.ts`.
- Cron and webhook routes in `saas/app/api/cron/vercel-observation/route.ts` and `saas/app/api/webhook/vercel/route.ts`.
- Platform health scoring in `saas/lib/supervisor/platform-health.ts`.

## Section 1 — Ten highest-risk production failure scenarios

### 1. Health score masks zero real Supervisor capacity

**Description:** The platform health model can report warning-level rather than critical-level availability when there are no active Supervisor instances. That creates false confidence during a complete control-plane outage.

**How to reproduce:** Generate a platform health snapshot with empty `instances`, non-failing runs, no active work, no expired leases, and passing CI. Observe that Supervisor score is degraded but not necessarily a total outage signal.

**Probability:** Medium.

**Impact:** Silent failure; operators may believe Mission 001 is degraded but still functioning.

**Severity:** Critical.

**Recommended mitigation:** Add a hard critical invariant: zero healthy/draining/starting Supervisor instances must force overall `critical`, with an explicit alert.

**How to test automatically:** Unit test `createPlatformHealthSnapshot({ instances: [] })` and assert `status === 'critical'`, a zero-capacity alert exists, and score cannot mask the condition.

### 2. In-memory dispatcher dedupe allows duplicate execution after restart

**Description:** Dispatcher at-most-once enforcement is process-local. A restart, serverless cold start, or second instance can accept the same dispatch ID unless durable execution/work-item state blocks it elsewhere.

**How to reproduce:** Dispatch a request, restart the process or instantiate a fresh dispatcher without the prior `InMemoryDispatchStore`, then dispatch the same `dispatchId` again.

**Probability:** High in serverless/HA environments.

**Impact:** Duplicate execution or duplicate evidence/audit rows. Read-only today, but catastrophic if future executor mutations are enabled without durable idempotency.

**Severity:** Critical.

**Recommended mitigation:** Preserve architecture but move dispatch consumption to the durable coordination/execution store before executor invocation; make duplicate dispatch IDs reject across restarts and regions.

**How to test automatically:** Integration test with two dispatcher instances using the same Supabase-backed dispatch ledger and assert only one can consume a dispatch ID.

### 3. Coordination event persistence is not atomic with state transitions

**Description:** `SupabaseCoordinationStore` performs the RPC mutation first and writes the coordination event afterward. If event insertion fails after the state transition, ownership or work state changes without a corresponding event.

**How to reproduce:** Mock Supabase so `supervisor_transition_work_item` succeeds but `supervisor_coordination_events.insert` fails.

**Probability:** Medium.

**Impact:** Lost audit integrity and hard-to-debug state transitions.

**Severity:** Critical.

**Recommended mitigation:** Incrementally add event insertion inside the same database RPC transaction or create an outbox row in the mutation RPC that is transactionally committed with the state change.

**How to test automatically:** Fault-injection test every coordination RPC path with post-mutation event-write failures and assert either transaction rollback or durable outbox presence.

### 4. Trigger deduplication may suppress valid repeated incidents in the same window

**Description:** Scheduled observation fingerprints are window-based and include project/environment but not always a specific failing deployment. Multiple distinct failures in one observation window can collapse into one reused trigger.

**How to reproduce:** Emit two different production failures for the same Vercel connection in the same scheduled observation window with no deployment ID.

**Probability:** Medium.

**Impact:** Lost execution and missed customer-impacting incident.

**Severity:** High.

**Recommended mitigation:** Add bounded incident-specific discriminators when known, such as latest failed deployment ID, alias target, or deployment created time, while preserving dedupe for exact replay.

**How to test automatically:** Property test trigger fingerprints with varying deployment IDs, event types, event times, and observation windows; assert distinct incidents do not collapse.

### 5. Webhook accepted but not executed immediately can create operator ambiguity

**Description:** The webhook route accepts and enqueues a work item but does not run accepted work. If the scheduler/worker path is impaired, a real provider failure may sit queued while the webhook response says accepted.

**How to reproduce:** Disable cron/worker processing, send a valid Vercel webhook, and verify the route returns 202 while no run occurs.

**Probability:** Medium.

**Impact:** Silent delay and false operational confidence.

**Severity:** High.

**Recommended mitigation:** Keep read-only architecture, but add explicit “accepted_not_processed_yet” status, queue-age alerts, and an operator-visible SLA timer for webhook-origin work.

**How to test automatically:** Route test valid webhook acceptance with worker disabled; assert queued work appears in SOC with age and warning after threshold.

### 6. Clock drift can cause lease theft or stale-owner rejection

**Description:** Lease acquire, renew, assert, and reconciliation logic relies on supplied `p_now` timestamps. Divergent instance clocks can make valid leases appear expired or stale, or make stale leases appear valid.

**How to reproduce:** Acquire a lease with one clock, then renew/assert/reconcile from another instance with ±5 minute skew.

**Probability:** Medium.

**Impact:** Split-brain prevention may fail closed too aggressively or queue work prematurely; operators may see abandoned work.

**Severity:** High.

**Recommended mitigation:** Use database server time inside lease RPCs for production paths or record and alert on client-clock skew.

**How to test automatically:** Database integration tests with skewed `p_now` values around expiry boundaries; assert no duplicate active lease and no premature terminal abandonment.

### 7. Reconciliation can abandon production work after transient lease expiry

**Description:** Expired production work is abandoned rather than retried. That is safe for mutation prevention, but for read-only production observation it can convert a transient delay into lost execution.

**How to reproduce:** Start a production Vercel health work item, let the lease expire without terminal state, run reconciliation, and observe state becomes `abandoned`.

**Probability:** Medium.

**Impact:** Lost observation and potential missed outage.

**Severity:** High.

**Recommended mitigation:** Distinguish production mutation-capable work from production read-only observation work. Preserve fail-closed behavior for mutation/browser work, but allow bounded retry for read-only health checks.

**How to test automatically:** Migration/RPC test read-only production work-item types and assert expiry moves to queued until max attempts, while browser/mutation types still abandon.

### 8. Audit completeness inference may produce false verification

**Description:** Platform health infers audit success by checking for completion/failure/rejection event names inside runs. A malformed or partial audit sequence can satisfy the check while missing earlier required events.

**How to reproduce:** Create a Vercel run with only a terminal event and no observation/thinker/verification/fence events.

**Probability:** Medium.

**Impact:** False audit and loss of trust during investigation.

**Severity:** High.

**Recommended mitigation:** Define required audit event sequences per workflow and verify order, schema version, work item, lease, fencing token, and verification IDs.

**How to test automatically:** Table-driven tests for complete, missing-middle, out-of-order, duplicated, and mismatched audit timelines.

### 9. Sanitization can corrupt forensic evidence or miss encoded secrets

**Description:** Current sanitization is pattern-based. It may over-redact benign fields needed for diagnosis while missing base64-encoded, URL-encoded, nested, or provider-specific secret formats.

**How to reproduce:** Feed metadata with `auth%6frization`, base64 bearer tokens, nested provider payloads, and benign strings containing “token”.

**Probability:** Medium.

**Impact:** Either leaked secrets or unusable evidence.

**Severity:** High.

**Recommended mitigation:** Add structured allowlists for persisted evidence fields plus encoded-secret detectors. Avoid storing arbitrary provider metadata even after regex redaction.

**How to test automatically:** Fuzz sanitizer with encoded secrets and benign near-matches; assert no secret-like values persist and key diagnostic fields remain readable.

### 10. Operator UI may imply repair capability where execution is read-only or disabled

**Description:** Mission 001 has many components with “Supervisor”, “Operations”, “Dispatcher”, and “Health Intelligence” labels, while production browser/API mutation remains disabled. Operators may misinterpret observed/accepted/verified as repaired.

**How to reproduce:** Walk a non-engineer through the SOC using a simulated Vercel failure and ask whether the system fixed the issue or only observed it.

**Probability:** High.

**Impact:** Operator confusion and delayed manual response.

**Severity:** High.

**Recommended mitigation:** Add unambiguous UI states: “read-only observation”, “no repair attempted”, “manual action required”, and “not dispatched to mutation executor”.

**How to test automatically:** UI snapshot/accessibility tests for incident states requiring those labels in all five locales.

## Section 2 — Additional failure modes by attack category

### Supervisor / durable coordination

#### Split-brain after database partition

**Description:** If one instance loses database connectivity after acquiring a lease, it may continue local work while another instance later acquires a new lease after expiry.

**How to reproduce:** Acquire lease, block DB from owner, wait past expiry, let second owner acquire, then unblock first owner and attempt dispatch/result persistence.

**Probability:** Medium.

**Impact:** Duplicate observation/result attempts; future mutation paths could duplicate repairs.

**Severity:** Critical.

**Recommended mitigation:** Require fence assertion immediately before every external side effect and every terminal persistence operation; already present in some paths, but test the full workflow boundary.

**How to test automatically:** Fault-injection integration test that expires a lease mid-work and verifies stale owner cannot transition, dispatch, or persist success.

#### Lease duration too short for Vercel read latency

**Description:** A slow provider read can outlive the lease and cause terminal transition rejection or abandoned work.

**How to reproduce:** Inject Vercel client delays greater than `SUPERVISOR_LEASE_MS`.

**Probability:** Medium.

**Impact:** Lost observation and noisy stale-owner failures.

**Severity:** High.

**Recommended mitigation:** Add renewal during long observations or bound provider read timeout below lease duration.

**How to test automatically:** Simulated slow Vercel client; assert lease is renewed or work fails cleanly with a visible retry/blocked state.

#### Work starvation by priority ordering

**Description:** `listAvailableWork` orders by priority and available time. Persistent high-priority storms can starve lower priority tenants/projects.

**How to reproduce:** Continuously enqueue high-priority Vercel work for one tenant and lower-priority work for another.

**Probability:** Medium.

**Impact:** Tenant-specific silent monitoring gaps.

**Severity:** High.

**Recommended mitigation:** Add tenant/project fairness or per-provider concurrency quotas.

**How to test automatically:** Scheduler simulation asserting maximum wait time per tenant under mixed-priority load.

#### Attempt counter incremented on acquire, not failed execution

**Description:** Attempts increase when a lease is acquired. A worker crash immediately after acquiring burns an attempt without work.

**How to reproduce:** Acquire lease then kill process before observation starts; reconcile repeatedly.

**Probability:** Medium.

**Impact:** Work can become blocked without real attempts.

**Severity:** Medium.

**Recommended mitigation:** Track separate `lease_attempt` and `execution_attempt`, or annotate crash-before-start for operator visibility.

**How to test automatically:** Crash simulation with max attempts set low; assert status explains no execution occurred.

### Dispatcher / policy / provider routing

#### Policy approval scope can become stale relative to updated plan

**Description:** Dispatch validates approved step IDs against the supplied plan and policy decision, but a caller can supply a different plan object with the same IDs unless the policy decision is cryptographically/content bound to the plan.

**How to reproduce:** Approve step IDs for plan A, then submit plan B with same incident ID and step IDs but different non-step metadata.

**Probability:** Low to Medium.

**Impact:** Policy mismatch and false authorization boundary.

**Severity:** High.

**Recommended mitigation:** Include deterministic plan fingerprint in policy decision and assert equality at dispatch.

**How to test automatically:** Mutation test plan fields after approval and assert dispatch rejects fingerprint mismatch.

#### Manual executor may hide blocked automation as successful routing

**Description:** Unknown executor kinds default to manual for early audit request, then validation rejects later. This may generate confusing audit records.

**How to reproduce:** Submit `requestedExecutorKind: 'api2'` with otherwise valid request.

**Probability:** Low.

**Impact:** Audit ambiguity.

**Severity:** Medium.

**Recommended mitigation:** Use a distinct `unknown` audit classification before fallback/manual labeling.

**How to test automatically:** Dispatcher audit test for invalid executor kind and assert no manual-success implication.

#### Result validation allows `completed` with empty evidence

**Description:** Dispatcher validates serializability and approved step IDs, but does not enforce workflow-specific evidence requirements.

**How to reproduce:** Register a fake executor returning `completed`, approved step IDs, and empty evidence.

**Probability:** Medium in future executor expansion.

**Impact:** False verification.

**Severity:** High.

**Recommended mitigation:** Add executor-kind evidence contract checks before accepting terminal success.

**How to test automatically:** Fake executor tests for missing evidence, mismatched verification ID, and empty executed steps.

### Observer / Thinker / verification

#### Env-name-only inspection can miss misconfigured values

**Description:** Vercel health intentionally avoids env values, inspecting names only. That protects secrets but can falsely verify readiness when a required variable exists with an invalid value.

**How to reproduce:** Configure all required env names with invalid/empty provider values.

**Probability:** High.

**Impact:** False confidence; deployment still fails.

**Severity:** High.

**Recommended mitigation:** Add safe value-shape checks only where non-secret and allow owner-approved secret hash/metadata checks without exposing values.

**How to test automatically:** Mock Vercel env name list with present-but-invalid metadata and assert warning, not healthy.

#### Deterministic thinker may under-diagnose provider incidents

**Description:** Conservative bounded plans reduce unsafe action, but may miss real root causes from malformed or incomplete provider events.

**How to reproduce:** Feed truncated event/log data where deployment failure reason is only present in omitted fields.

**Probability:** Medium.

**Impact:** Manual work and missed diagnosis.

**Severity:** Medium.

**Recommended mitigation:** Add explicit uncertainty classifications and evidence gap reporting.

**How to test automatically:** Golden tests for incomplete provider payloads requiring `unknown_due_to_missing_evidence`.

#### Verification can pass stale evidence

**Description:** If verification does not bind evidence timestamps tightly to the current work item/lease/fencing token, stale evidence from a previous run can appear valid.

**How to reproduce:** Reuse evidence references from an older run with a new work item.

**Probability:** Low to Medium.

**Impact:** False verification.

**Severity:** High.

**Recommended mitigation:** Bind verification report to work item ID, run ID, lease ID, fencing token, provider connection, and captured-at range.

**How to test automatically:** Replay old evidence references into a new run and assert verification rejects.

### BPAL / provider registry

#### Metadata-only provider claims can drift from real code capability

**Description:** BPAL is canonical metadata, but future code changes can add executor capability without updating metadata or vice versa.

**How to reproduce:** Add an adapter/export path that imports browser runtime or provider SDK outside BPAL validation scope.

**Probability:** Medium over time.

**Impact:** Policy/UI misstates capability and risk.

**Severity:** High.

**Recommended mitigation:** Keep `validate:bpal`, expand it to scan import graphs from all Supervisor executor entry points, not only BPAL files.

**How to test automatically:** CI fixture that intentionally adds forbidden import path and expects validation failure.

#### Provider capability selection depends on detached snapshot freshness

**Description:** Capability decisions are bound to metadata snapshots, but stale snapshots can select a provider/capability after a config change.

**How to reproduce:** Generate decision, change provider registration policy, then dispatch old decision before expiry.

**Probability:** Low.

**Impact:** Stale policy authorization.

**Severity:** Medium.

**Recommended mitigation:** Short decision TTL plus provider registry version assertion at dispatch.

**How to test automatically:** Version-bump provider registry after decision and assert dispatch rejects stale version.

### Webhook ingestion / scheduling

#### Webhook replay after secret rotation

**Description:** If old secrets remain accepted by deployment configuration or intermediaries, old signed webhooks may enqueue reused or new triggers depending on fingerprint content.

**How to reproduce:** Send old valid payloads after secret rotation in an environment that still has the prior secret.

**Probability:** Low to Medium.

**Impact:** Replay noise and queue pressure.

**Severity:** Medium.

**Recommended mitigation:** Include timestamp tolerance and webhook delivery ID replay ledger when Vercel provides one.

**How to test automatically:** Replay same signed event outside allowed time skew and assert rejection.

#### Webhook storm exhausts connection lookup and trigger insert capacity

**Description:** The webhook path loads up to 25 active connections and normalizes each request. A storm can produce DB pressure before dedupe helps.

**How to reproduce:** Send many valid signed webhooks for known project IDs concurrently.

**Probability:** Medium.

**Impact:** Database saturation and delayed monitoring.

**Severity:** High.

**Recommended mitigation:** Add per-project rate limits, delivery-ID dedupe before full connection scan, and backpressure metrics.

**How to test automatically:** Load test signed webhook route with concurrent duplicate delivery IDs and assert low DB writes.

#### Scheduler overlap across regions

**Description:** Multiple Vercel cron invocations or regions can run the same scheduled window. Dedupe should suppress duplicated work, but immediate run behavior on `created` can produce uneven load.

**How to reproduce:** Invoke cron route concurrently from two processes for the same connections/window.

**Probability:** Medium.

**Impact:** Lock contention, duplicate attempts, noisy rejects.

**Severity:** Medium.

**Recommended mitigation:** Add scheduler leader lease or bounded concurrency per provider connection.

**How to test automatically:** Concurrent cron integration test asserting one created trigger, one reused trigger, and one executed work item.

### Persistence / audit

#### RLS policies allow broad authenticated reads of coordination tables

**Description:** Coordination tables enable select for any authenticated role. If exposed through client credentials accidentally, tenant metadata may leak across users.

**How to reproduce:** Use an authenticated non-admin client to select from `supervisor_work_items`.

**Probability:** Medium if table is reachable from client-side Supabase.

**Impact:** Tenant privacy leak and operational metadata exposure.

**Severity:** High.

**Recommended mitigation:** Restrict RLS to admin/owner claims or service-role-only access; route all reads through admin APIs.

**How to test automatically:** Supabase RLS test as normal authenticated user asserting zero rows or access denied.

#### Snapshot IDs can collide under same timestamp/score

**Description:** Platform health snapshot ID hashes captured timestamp and score. Concurrent snapshots at identical timestamp/score can upsert over each other.

**How to reproduce:** Inject same `now` and same inputs twice from separate collectors.

**Probability:** Low.

**Impact:** Lost health history.

**Severity:** Medium.

**Recommended mitigation:** Include collector instance/runtime ID or monotonic sequence in snapshot ID.

**How to test automatically:** Concurrent save test with same timestamp and different subsystem evidence; assert two records or deterministic merge semantics.

#### Event IDs use Date.now plus Math.random

**Description:** Coordination event IDs are non-deterministic and not content-addressed. Collisions are unlikely but not impossible; more importantly, dedupe/replay semantics are weak.

**How to reproduce:** Stub `Date.now` and `Math.random` to fixed values and emit two events.

**Probability:** Low.

**Impact:** Lost event insertion.

**Severity:** Medium.

**Recommended mitigation:** Use `gen_random_uuid()` server-side or content-bound IDs for idempotent event writes.

**How to test automatically:** Deterministic ID collision test and assert retry or server-generated uniqueness.

### Operator UI / localization

#### Localization completeness can be marked healthy by absent input

**Description:** Platform health treats localization as complete unless `localizationComplete === false` is supplied. If the caller forgets to calculate it, the dashboard can show healthy localization.

**How to reproduce:** Create health snapshot without passing localization status after deleting one locale key.

**Probability:** Medium.

**Impact:** Customer-facing untranslated UI in one locale.

**Severity:** Medium.

**Recommended mitigation:** Make unknown localization status `unknown` or `warning`, not healthy.

**How to test automatically:** Snapshot test with omitted localization input and assert non-healthy status; CI locale diff test for SOC keys.

#### Dashboard stale data not visually obvious

**Description:** Health history and SOC pages can show old snapshots if collection fails. Unless timestamp age is prominent, operators may trust stale data.

**How to reproduce:** Stop cron/collection, leave prior healthy snapshot in DB, open SOC after threshold.

**Probability:** Medium.

**Impact:** Silent monitoring failure.

**Severity:** High.

**Recommended mitigation:** Add stale snapshot age banner and force overall critical/unknown when latest snapshot is too old.

**How to test automatically:** UI test with old snapshot fixture and assert stale banner in all five languages.

### Recovery

#### Restart reconciliation abandons in-progress sandbox sessions without clear next action

**Description:** Fail-closed restart behavior is correct, but operators need explicit recovery guidance for abandoned non-terminal records.

**How to reproduce:** Pause sandbox execution, restart process, call execution history page.

**Probability:** Medium in test/sandbox.

**Impact:** Lost work and operator confusion.

**Severity:** Medium.

**Recommended mitigation:** Add “session expired; restart from safe beginning” status and link to evidence.

**How to test automatically:** Restart/reconcile test asserting abandoned execution has reason and UI copy.

#### Partial database outage creates mixed “accepted/deferred/rejected” semantics

**Description:** Different routes return different degraded outcomes depending on which Supabase call fails.

**How to reproduce:** Fail trigger store upsert, coordination enqueue, event insert, or health-store save separately.

**Probability:** Medium.

**Impact:** Operator confusion and inconsistent retry behavior.

**Severity:** High.

**Recommended mitigation:** Define a small set of failure states and map all partial DB failures consistently.

**How to test automatically:** Fault matrix tests for every DB call site in trigger acceptance and run execution.

## Section 3 — Enterprise review

### Would Google SRE approve?

Not yet for production-critical supervision. They would like the conservative fail-closed posture, read-only production scope, lease/fencing RPCs, and deterministic verification intent. They would reject or condition approval on stronger SLOs, durable dispatcher idempotency, explicit stale-data alarms, failure-injection coverage, and health scoring that cannot mask zero capacity.

### Would AWS approve?

Not yet. AWS-style operational readiness would require clearer multi-AZ/region behavior, retry budgets, throttling/backpressure, durable idempotency, chaos testing for database and provider outages, and least-privilege tenant-scoped data access.

### Would Cloudflare approve?

Not yet. They would focus on replay resistance, webhook storm handling, rate limiting, edge/serverless cold-start behavior, deterministic dedupe under concurrency, and origin/capability confusion in operator surfaces.

### Would Stripe approve?

Not yet for trust-critical automation. They would likely demand stronger audit immutability, exactly-once/idempotency semantics, clearer event sequence verification, secret redaction tests, and operator UX that never confuses observation with successful remediation.

### Would GitHub approve?

Conditionally for a read-only internal beta, not for broad production. They would require stronger CI enforcement, clearer runbooks, durable audit/event outbox, RLS hardening, and branch/deployment verification before claiming health.

## Section 4 — Final ranked reasons Mission 001 could still fail tomorrow

1. False confidence from health scoring and stale dashboards: zero capacity, stale snapshots, or missing localization inputs can appear less severe than they are.
2. Duplicate or replayed execution after restart because dispatcher dedupe is in-memory, not durable.
3. Lost audit integrity because coordination events are written after mutations rather than atomically with them.
4. Missed incidents because trigger dedupe can collapse distinct failures in the same observation window.
5. Webhook acceptance without guaranteed prompt processing can hide queued-but-unhandled provider failures.
6. Clock drift and lease expiry edge cases can create stale-owner rejection, abandoned work, or premature lease turnover.
7. Production read-only observations can be abandoned after transient lease failure even though retry would be safe.
8. Audit and verification checks can pass incomplete or stale evidence unless event sequences and evidence identity are strictly bound.
9. Pattern-based sanitization can either leak encoded secrets or destroy forensic usefulness.
10. Operator language can imply automated repair or completed safety when the current production system only observes, verifies, and reports.

## Section 5 — Incremental improvement backlog

- Add hard critical invariants for zero Supervisor capacity, stale latest snapshot, and stale webhook/scheduler work.
- Replace in-memory dispatch ID consumption with durable idempotency before executor invocation.
- Move coordination event creation into RPC transactions or add a durable outbox.
- Add clock-skew tests and prefer database time for production lease decisions.
- Distinguish production read-only work from production mutation/browser work in reconciliation.
- Add required audit event sequence verification per workflow.
- Add webhook replay timestamp/delivery-ID checks and storm rate limits.
- Add tenant-safe RLS policies for Supervisor coordination tables.
- Add SOC copy that explicitly says “read-only observation; no repair attempted” in all five locales.
- Add chaos/fault-injection tests for Supabase partial failures, provider latency, restarts, concurrent cron, and webhook storms.
