# COS live acceptance (unmocked)

This is **not** the ordinary green CI/Playwright suite. The normal homepage test intercepts `/api/cos-browser`. The dedicated live suite makes real authenticated HTTP calls and inspects completed analytical deliverables.

## Prerequisites

- An approved dedicated COS test account, with an authenticated Playwright storage-state JSON written to a **local temporary path** outside Git. Never commit or upload session state to build artifacts.
- A known HTTPS iTMounts production or Vercel preview URL.
- Verification in Vercel that the URL actually resolves to the **intended commit**. The `expectedCommit` receipt field is a reference only; setting it does not prove the deployment is serving that revision.
- Operator consent to actual model execution, which incurs inference work. Do not schedule repeated production runs without cost controls.

From `saas/`:

```sh
COS_LIVE_BASE_URL=https://itmounts.com \
COS_LIVE_STORAGE_STATE=/secure/path/to/test-account-state.json \
COS_LIVE_EXPECTED_COMMIT=<Vercel-verified-full-commit-sha> \
node scripts/cos-live-acceptance.mjs
```

Run the same tests against the exact preview deployment before merge; repeat against production after deploy. The launcher **fails closed** if the target, state file, or expected commit marker is missing. The suite has **no route mocks**. It submits two unrelated forensic analytical cases and asserts all requested deliverables are present, a meaningful analytical response was produced, and the known refusal is absent.

## Certification result

Green ordinary CI is not live certification. Record a signed-off revision/URL association from Vercel and store the receipt plus Playwright test report. Any missing authenticated run, skipped live suite, refusal, missing analytical deliverable, stale revision, unexpected spend, or inference timeout is **NOT CERTIFIED**. Never promote a preview based on a mocked Playwright test.

Current limitation: The deterministic structural deliverable checker is not a semantic judge. A passing answer still requires independent human or model-based rubric review for soundness, calibration of uncertainty, ranked hypotheses, and discriminating tests. The suite currently does not validate Builder V2 or tool orchestration end-to-end, and its existence does not mean any live test was executed.
