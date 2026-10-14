# REA investigation protocol — Cursor Builder → iTMounts Builder

## Target and permitted scope
Target: locally installed **Cursor desktop application**, focusing solely on observable, authorized coding-agent behavior. Investigation engine: [morluto/rea](https://github.com/morluto/rea) (`rea-agents`). This protocol is **not** evidence that Cursor has been inspected. Do not bypass authentication, licensing, access controls, or protected services. Do not copy proprietary code or publish extracted assets.

## Prerequisites on a machine where Cursor is installed
1. Obtain the installed Cursor application's local path using the operating system's normal application-management facilities.
2. Review REA documentation and install with `npx rea-agents@latest setup`. Review proposed agent/MCP registration changes before approving.
3. Run `npx -y rea-agents@latest analyze-javascript-application "/absolute/path/to/EXTRACTED_APP_OR_ASAR" --json` only on an application directory or ASAR you are authorized to inspect. REA's documented static JavaScript analysis does not require Hopper/Ghidra.
4. Store resulting JSON as **local evidence**, not in a publicly accessible GitHub repository. Redact license data, access tokens, account information, and personal project content.

## Behavioral probes (test with synthetic, disposable projects)
Use the same tasks and failure conditions for Cursor and iTMounts; capture independent observations and do not assume internal implementation:
- Create a 15-file Node.js project from the OrderFlow specification; inspect files in the workspace.
- Start with 64/66 passing tests, where two inventory assertions fail.
- Verify full test nonzero result cannot be superseded by `node index.js` exit 0.
- Check whether a diagnostic continuation uses precise test names, assertions and the implicated `src/orders.js`.
- Interrupt/restart the agent during repair. Measure checkpoint durability, retries, run count and human action required.
- Induce a hung tool/provider and measure idle-timeout behavior, job lease fencing, and observable error.
- Check eventual full `node --test test/*.test.js` exit 0; do not claim success from UI text alone.

## Evidence schema
For every finding record:
`{probe_id, target_app_version, rea_version, source_artifact, observation_time, observation_method, evidence_location, direct_observation, hypothesis, confidence, limits, equivalent_itmounts_test}`.

Explicitly distinguish static module relationships from observed runtime effects. Record unknowns as unknowns. Never infer Cursor's private infrastructure solely from UI behavior.

## Implementation contract for iTMounts
1. The persistent job record owns the state machine: queued → running → paused/queued or succeeded/failed.
2. A failed declared verification command is a **repair-required** state. Preserve exact failing test names and assertion output from the current source revision.
3. Smoke tests can prove the smoke command only, not a required full suite.
4. Scheduler resumes eligible checkpoints automatically under a generation-fenced lease, bounded budgets and an idle timeout with a real blocker when exhausted.
5. Success requires all requested files plus all declared verification commands passing against the latest source revision.
6. Test both a simulated interrupted execution and a real fresh OrderFlow acceptance. Do not merge or claim readiness if either fails.

## Status
REA tooling researched from its upstream documentation. **No Cursor binary, extracted application, or runtime trace has been supplied to this repository and no REA inspection has been performed.** This is a reproducible investigation protocol, not completed REA results.
