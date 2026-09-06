# Builder product capabilities — 2026-09-05

Implementation on `feat/builder-product-readiness-20260905`, based on the concurrent
checkpoint continuation release #1861. This is not a declaration of full product readiness.

## Changes

- New files can be assembled through `write_file` with `mode: append`, an exact
  JavaScript-string `offset`, and `final`. Each chunk is at most 12,000 characters;
  the complete file remains bounded to 512 KiB. Unfinished files cannot be run or
  downloaded. Pending assembly is included in private checkpoints. Existing files
  continue to use precise edits. `read_file` supports bounded line ranges.
- Standard jobs have cumulative ceilings of 96 work rounds, 48 successful file
  writes/edits and 20 successful command runs, across the existing maximum four
  invocations. The existing 300-second route duration is unchanged. Slices yield
  earlier to leave time for dependency installation and result persistence. Failed
  actions still consume work rounds; saved state never resets the total budget.
- The host installs npm registry dependencies in the isolated sandbox, without
  lifecycle scripts, before staging source or npm configuration. Egress is restricted
  to registry.npmjs.org during installation and closed before user code runs.
  A failure to close it prevents source staging/execution. A generated package lock
  is validated and saved with workspace files. Installation failures are identified
  as installation commands, never fabricated execution of the requested test.
- A public GitHub repository or folder URL can be imported into an empty user
  workspace. The importer pins one exact commit, bounds reads, skips symlinks and
  excluded sensitive/config/generated paths, and never uses platform credentials.
  Limit: 100 source files / 2 MiB total / 512 KiB per file. Private repositories use
  uploaded source; this release does not implement private GitHub OAuth. SignalBoost's
  platform repository remains restricted to its existing owner execution lane.
- The model receives current workspace source, evidence-based diagnostic guidance,
  explicit uncertainty rules and instructions to give concrete next steps. A repair
  with no source deterministically reports what to supply before model execution.
  Ordinary project attachments can use the standard verified repair loop; the narrow
  small-file debug protocol is retained when applicable.

## Verification and acceptance

The new tests execute five isolated create/run cases and five existing-source
fail/change/pass variants with real Node processes and scripted model decisions.
They also execute a 600-line chunked file, serialized continuation, changed-workspace
and scope rejection, package-policy checks, sandbox egress ordering and pinned import
checks. Existing #1861 generation-fencing/continuation tests remain mandatory.
The installer and GitHub transport checks use controlled adapters; they do not prove
live Sandbox or live-model behavior. All 198 Builder tests passed. The final 887-test deployment gate and TypeScript
check passed, including the evidence-reporting refinements. Exact remote CI/Preview
checks must also be recorded in the PR.

Still required for product acceptance: exact Preview/build and deployment verification,
then authenticated live-model create/repair trials, a real dependency-backed command,
a public repository import, a large-file generation, and a scheduled continuation.
The available browser was logged out during implementation. A green controller test
or green deployment must not be presented as those live-model observations.

Unsupported package workflows fail explicitly: non-registry/git/file dependencies,
non-npm lockfile-only projects, workspaces and overrides. Native packages requiring
lifecycle installation scripts may not work with scripts disabled. This release does
not grant external network access to user code, deployment authority, remote repository
writes, or private company access.

## Review follow-up — 2026-09-06

Reconciled main b1fc71f without dropping its repository search or deadline controls.
Informational GitHub links do not start executable jobs. Explicit import/build/repair
requests may import source; slash-containing refs resolve longest-first, and folder
imports traverse nonrecursive parent trees before fetching only the selected subtree.
If generated-lock persistence fails, the completed run remains recorded accurately
and the trace separately reports the storage failure. All 928 mandatory tests and
TypeScript pass locally. Updated remote CI/Preview verification is pending.

Engineering owns these checks and repairs; owner evaluation follows delivery.
The independent #1863 chunk implementation remains open and must not be merged as
a second protocol without reconciling its rejection and storage-retry coverage.
