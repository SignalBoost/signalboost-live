# Cursor → iTMounts Builder: REA behavioral evidence 01 (2026-10-16)

## Evidence boundary
This is **behavioral/black-box reconnaissance** based on Cursor's published user-facing documentation, not an inspection of Cursor's binary or private orchestration source. Do not infer internal implementation from product descriptions. No proprietary source has been copied.

## Directly evidenced functionality
Source: https://docs.cursor.com/background-agent (Cursor documentation, retrieved 2026-10-16).

1. A user launches background coding agents that **edit and run code in remote environments**.
2. The user can **view agent status, send follow-up instructions, and take over** the running environment.
3. Background environments are **isolated Ubuntu-based machines** with package installation and network access.
4. Environment preparation distinguishes **install**, **start**, and **terminal processes**. The install phase's disk state is cached; started processes are not assumed to survive across phases.
5. Terminal processes are exposed in **tmux** sessions.

These are observable product contracts, not claims about Cursor's private scheduler, checkpoint database, model provider, or implementation.

## Derived iTMounts behaviors to independently implement and measure

| Observed contract | Our independent implementation target | Falsifiable acceptance probe |
| --- | --- | --- |
| Agent edits and runs real source | Durable workspace plus actual sandbox command receipts | Request OrderFlow, verify physical 15 files and all three actual exit codes |
| User sees job status | Authoritative server job state rather than chat's startup acknowledgment | Reload page mid-run and see same job, workspace, latest command and pending work |
| User may follow up | Append follow-ups to job without replacing original acceptance checklist | Follow-up after two failing tests; remaining requirements and command failures persist |
| User can take over environment | Inspectable/exportable workspace independent of agent | Stop model and inspect/download unmodified files and logs |
| Prepared remote environment | Cached immutable install state + separate per-run process supervision | Interrupt command; inspect timeout and saved logs; resume without counting prep as build progress |
| Terminal session visibility | Command-scoped stdout/stderr and precise exit code | npm test failure cannot be hidden by later successful demo |

The table's right columns are **design hypotheses and tests**, not documented Cursor implementation internals.

## Local analysis attempted in current assistant environment
- `node --version`: `v22.16.0`
- No executable `ghidra` or `analyzeHeadless` resolved via PATH.
- No Cursor `.asar` or Ghidra headless analyzer located by a bounded search under `/mnt/data`, `/opt`, `/home/oai`.
- REA upstream requires Node >=22.19 (or >=24.11, or >=26), and a supplied extracted JS application directory or ASAR to run the static JavaScript analyzer: https://github.com/morluto/rea
- Therefore **no binary/static Cursor application analysis was performed**. No REA CLI output or Ghidra finding exists in this record.

## Next actual REA evidence acquisition
On a supported, authorized host possessing Cursor's installed application bundle:
1. Verify Node version and `rea doctor`.
2. Run existing `scripts/rea-cursor-inspect.mjs /absolute/path/to/app.asar`.
3. Store raw findings locally, private, and collect only abstract module/call-boundary descriptions in sanitized evidence.
4. Exercise Cursor and iTMounts against identical disposable OrderFlow tests: initial build, failing assertions, interruption, resume, failed command, final three-command verification.
5. Mark each comparison **observed**, **inferred**, or **unknown**.

## Status
Behavioral evidence collected; local executable availability checked; Cursor static binary analysis **BLOCKED** by missing target/compatible runtime. No claim of equivalent production Builder, no claimed fix.
