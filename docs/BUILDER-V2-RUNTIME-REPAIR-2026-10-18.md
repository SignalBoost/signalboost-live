# Builder V2 runtime failure targeting

## Evidence

Production job `8ab2c66c-c5fc-45a8-9eda-dbcb694e620a`, workspace
`1da0e9da-90c3-4712-958d-9b952dbe06da`, ended with
`builder_v2_model_call_budget_exhausted`. Stored host receipts show repeated
`index.js` edits followed by passing test commands and a failing `node index.js`.
This establishes unsuccessful repair attempts, not that the call ceiling was too low.

The V2 working set previously targeted named test files and then arbitrary
`src/` and `test/` files. A runtime entrypoint could be omitted from its 12,000
character budget even when the real stack named it. Its extensionless local
imports were also not resolved as runtime repair context. The progress report
kept only the last 12 output lines, which could discard the actual exception.

## Changes

- Resolve existing workspace files named by stack locations and the actual
  failed command; resolve their direct relative imports, including extensionless
  CommonJS and ES imports. Put that context before unrelated source files.
- Reconstruct runtime targets from host receipts on every turn and resumed
  checkpoint. Prompt guidance refers to the failing command and caller API,
  including runtime failures after passing tests.
- After a source change, retry the last failing required command ahead of
  test-only predecessors, preserving explicit setup/build ordering. Once
  it passes, every other required command must still pass on that same revision.
- Preserve the head and tail of bounded failure output in user progress.
- Preserve model-budget exhaustion as its own terminal reason if it occurs
  inside the retry helper; do not label it a model outage.

The 60-call default, 12,000-character source working set, receipt and continuation
limits, provider selection, execution authority, and independent acceptance rules
are unchanged. No generated OrderFlow source or customer data is included.

## Verification and limits

Three runtime-targeting/progress regressions fail against main
`db5de54a072e8893f42142b31aab342c4893bbbb` and pass with the repair.
Seven new tests cover one-call runtime repair, checkpoint continuation, exception
visibility, path isolation/Windows stacks, unchanged-failure budget exhaustion,
setup/build ordering and real Node subprocess failure-to-pass through the V2 dispatcher.
The model responses in these tests are scripted: they verify orchestration,
not the production model's competence. The new suite is a Vercel release gate.

62 targeted V2 tests pass locally with Node 24 and
`--experimental-transform-types`; the release-gate script passes `node --check`.
Exact-head CI, deployment, and a live model-driven Builder job remain separate
verification steps. Do not infer autonomous production completion from this test run.

CI also exposed two working-set fixture failures reproduced on unmodified main:
the fixture expected a missing-export error and unchanged source, but the newer
host interface repair intentionally inserts a throwing export stub. The fixture
now uses an existing exported factory with a real functional failure and repairs
the implementation on resume. Exact source, retained error, unchanged tests,
bounded working set, and real passing host verification remain asserted.
