# Production Acceptance — RunPod COS Cold Start — 2026-08-15

## Result

**PASS** for the production cold-start path introduced by PR #1221.

This evidence is from the live production deployment, not a synthetic test and not a code-only inference.

## Exact production deployment

- Vercel deployment: `dpl_CfRYftcFAPLMEHuLzEhmqUajEeVr`
- Git commit: `e7be3525c453170ac79858fc78a10eb235e2937a`
- Branch: `main`
- Deployment state at verification: `READY`

Later documentation-only commits `b08b93f6aea9ba8237948585f437d28ad6870da4` and `5098cae72b94ac10853c2b6758bfef99e17c4a5f` produced canceled production deployments and did not replace the running code-bearing deployment.

## Runtime acceptance trace

A real production `POST /api/concierge` request at approximately `2026-08-15T22:44:48Z` exercised the local COS path.

The live runtime trace proved the required cold-start sequence:

1. RunPod was previously stopped: `previousStatus="EXITED"`.
2. Production detected a missing startup contract: `currentEntrypoint=[]`, `currentStartCmdCount=0`.
3. Production repaired the startup contract before wake:
   - `action="startup_contract_repaired"`
   - image `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404`
   - volume mount `/workspace`
4. Production resumed the pod:
   - `action="resume_requested"`
   - `desiredStatus="RUNNING"`
   - `started=true`
   - `startupContractRepaired=true`
5. The cron lifecycle probe shortly afterward observed the pod as `RUNNING` with authoritative RunPod telemetry.
6. Qwen served multiple successful local inference calls with HTTP 200.
7. The completed COS response reported:
   - `responseSource="local_cos_reasoning"`
   - `reasonerLabel="independent-local:qwen2.5-coder:32b"`
   - `localModelInvoked=true`
   - `externalAiInvoked=false`
   - confidence `0.78`

This is direct runtime proof that a stopped pod can be repaired, resumed, and used successfully by COS on the production #1221 deployment.

## Cost/lifecycle boundary

The wake remained inside the production RunPod lifecycle controller. The same production deployment retained:

- background no-wake behavior from PR #1217;
- failed cold-wake cleanup from PR #1218;
- stale unhealthy orphan stop protection from PR #1219;
- startup-contract repair-before-wake from PR #1221.

No approval or safety control was bypassed to generate this evidence.

## Separate defect observed during the same trace

Semantic Knowledge Graph / continuous-learning embedding retrieval returned HTTP 404 and correctly fell back to lexical retrieval. The local reasoner still completed successfully, so this does **not** invalidate the cold-start acceptance result.

Treat the embedding HTTP 404 as a separate production defect to investigate next. Do not describe semantic retrieval as healthy until it is independently verified.

## Acceptance conclusion

Production RunPod/COS cold-start behavior is now **runtime-proven** for the successful path:

`EXITED → detect broken startup contract → repair → RUNNING → Qwen HTTP 200 → local COS answer → no external AI`

This evidence does not prove Qwen3 is live. The verified model remains `qwen2.5-coder:32b`.
