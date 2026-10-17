# Builder V2 installation, configuration, and recovery verification

## Purpose and scope

Inspired by the procedure-oriented structure of ABB *Automation Builder — Installation and Licensing* (3ADR010659, rev. 9, 2026-08-21), especially prerequisites (pp. 9–12), installation and optional components (pp. 12–18), license management (pp. 21–56), and support logs (pp. 55–61). ABB's PLC packages and CodeMeter licenses **do not apply** to iTMounts. These are independent software products.

## 1. Repository preflight (no live services, no secrets)

From `saas/`, execute:

```sh
node scripts/verify-builder-installation.mjs
node --test tests/builderInstallationPreflight.node.test.ts
```

The check verifies declared sandbox and database dependencies, Node 24 sandbox setup, network-denied user execution, cleanup, workspace ownership scoping, agent wiring, model governance, host-test verification, and checkpoint persistence. It deliberately reports `productionVerified: false`. Static results do not establish deployed configuration.

## 2. Production acceptance (must be run in the actual deployment)

1. Verify the production deployment revision matches the intended release and the Builder V2 route selects the expected execution engine.
2. Verify server-side service configuration and permissions for Supabase, the coding-model provider, and Vercel Sandbox. Never print secrets in logs or store them in a workspace.
3. Create a fresh authenticated test workspace, write and read a file, then resume by workspace ID to prove durable storage and user isolation.
4. Execute a tiny Node 24 program with a known passing test. Capture actual sandbox exit code and output, not model assertions.
5. Execute a known failing test due to a missing named CommonJS export. Confirm a source edit and a second host test run; do not mark verified without the passing receipt.
6. Test cancellation, retry, checkpoint restoration, and an unavailable model. Confirm a bounded, explicit failure rather than indefinite or billable looping.
7. Verify sandbox network policy remains deny-all for project commands and sandbox cleanup runs for success and failure.
8. Review privacy-safe job and error logs for each run, including request ID, execution revision, time, cost, and terminal status. No user source or credentials in public diagnostics.
9. Run the full repository test/build checks for the exact revision; inspect production observability before approving any rollout.

## 3. Failure disposition

* A missing dependency, wrong runtime or missing integration wiring: fail deployment acceptance.
* A provider or database credential failure: fail production acceptance; do not silently swap external LLM providers.
* A test failure: edit the implicated source, rerun host tests, and preserve durable workspace receipts.
* A stalled model: stop within configured bounded work and preserve the checkpoint. A restart without a diagnosed change is not a repair.
* Partial or missing evidence: report **not verified**, never **green**.

The ABB manual describes a Windows installation, distinct edition licenses and CodeMeter. These cannot prove that iTMounts' cloud services are installed or functioning. Only a real deployed Builder job can provide that evidence.
