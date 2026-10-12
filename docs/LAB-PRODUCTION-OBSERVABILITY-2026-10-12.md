# LAB production observability and launch monitoring

No real customers are required before launch. Use synthetic safety tests before release and observe genuine customer workflows after release. Customer absence is not an acceptance failure.

## Signal emitted
The LAB API emits one JSON event per request to Vercel runtime logs:
`{"event":"lab_request","version":1,"operation":"training.action","observationId":"<random>","status":503,"outcome":"response","durationMs":154,"severity":"error","environment":"production"}`.

Instrumented operations: workspace.create, providers.list/save/revoke, training.list/action/callback, artifact.download. Each successful handler response attempts to include `x-lab-observation-id` so customer support can correlate a request without a customer identifier.

The logger deliberately excludes credentials, prompts, tokens, provider endpoints, private URLs, user and organization IDs, request headers and raw exceptions. Errors thrown by handlers are logged as status 500 with `outcome:"exception"` and still propagate to normal platform error handling.

## Operational checks
In Vercel Runtime Logs filter for `lab_request`. Group by `operation`, HTTP status, environment and time. Evaluate:
- **Urgent**: any 5xx on `workspace.create`, `providers.save`, `training.action` or `artifact.download`; consecutive callback 5xx; elevated unexpected `outcome:"exception"`.
- **Investigate**: sustained increase in 401/403 access denials or 409 not-ready responses; rising p95 duration for training and download.
- **Cost safety**: separately inspect the immutable LAB reservation and settlement ledger for held reserves, teacher overruns, blocked spend, duplicate callback receipts and failed job recovery. The request event alone does **not** prove financial correctness.
- **Customer lifecycle**: reconcile signed-in signup/workspace conversion, number of permitted provider connects, real training start/completion, and successful artifact retrieval **only with consent and privacy constraints**. Request logs alone do not prove any of these customer milestones.

## Response and escalation
Record incident timestamp, operation, observationId, status, deployment SHA, database migration versions, affected stage and whether spend is reserved. Verify incident via live Vercel logs and read-only Supabase queries. Never request a customer's private provider key or unredacted prompt.

If a provider fails, preserve the customer run state and release unused reservation per documented governance. Do not rerun a paid job automatically without idempotency and budget checks. If a tenant isolation defect is observed, disable the affected feature and investigate before reopening. For bad rollouts, use exact-revision rollback.

## Limitations
This change adds structured events and response correlation; it **does not configure a Vercel alert subscription, log drain, dashboard, retention guarantee or external notification destination**. Those require an explicitly chosen recipient/service and deployment-specific configuration. Confirm runtime log receipt from the exact deployed revision and then configure alerts for 5xx and abnormal failure rates. Do not declare monitoring active until logs and alerts have been observed in production.

Temporary staging: delete `itmounts-staging` after preserving test evidence to stop recurring charges. Do not infer production readiness from a READY deployment or test logs alone.
