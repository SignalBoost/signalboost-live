# Concierge bounded multi-file debug — 2026-09-02

## Problem

The authenticated Concierge/Builder debug lane was still hard-capped to exactly one executable attachment and one edit. That prevented the common source + test debugging shape even though the isolated Vercel sandbox runner already stages multiple user files.

## Increment

- Admit 1–4 supported `.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, or `.py` files, each <=128 KiB.
- Prefer a supplied JS/TS `*.test.*` or `*.spec.*` file as the fail-before/pass-after proof entrypoint.
- Do not automatically treat pytest-style `test_*.py` / `*_test.py` as proof entrypoints because direct `python3 file.py` execution does not discover bare pytest functions. Python remains supported when the selected entry file is directly executable.
- The actual public Concierge transport decodes supported source attachments and posts them to the durable `/api/builder` job contract rather than the legacy empty-workspace direct Builder loop.
- Read every admitted file into the bounded model context and stage all admitted files into the existing network-denied ephemeral sandbox.
- Permit exactly one minimal `edit_file` operation against any admitted path, then rerun the exact same proof command with the full file set.
- Preserve the existing no-repository-authority boundary for public/member Builder work. This does not grant GitHub, Production, network, commit, push, merge, deploy, or arbitrary filesystem authority.
- Keep backwards compatibility for existing one-file jobs and durable job records.

## Evidence required

The mandatory Vercel gate includes `builderDebugFileJob.node.test.ts`, `builderRoutingStrict.node.test.ts`, `builderAsyncJobs.node.test.ts`, and `agentProgressStreaming.node.test.ts`. Runtime acceptance additionally requires a signed-in Concierge observation that supplies at least a source file plus its test, sees fail-before evidence, edits the faulty source, and sees the same test command pass afterward.
