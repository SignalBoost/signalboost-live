# Concierge Governed Repair — 2026-09-04

## Goal

Concierge is a customer-service surface backed by COS. For ordinary users it must understand a software problem, stage the supplied source, diagnose/repair it in the isolated Builder workspace, verify what can actually be verified, and return the corrected files. Commit/merge/deploy authority is not required for customer work.

For the authenticated SignalBoost owner, using the browser Concierge must not silently downgrade the session to guest. Owner-authorized SignalBoost repository repair may use the Software Specialist / Platform Engineer lane.

## Changes

- Browser Concierge and owner Assistant now enter the canonical `/api/cos-browser` ingress. That route reads verified owner identity before applying public-delivery scope; guests still receive public isolation.
- Source code pasted directly into Concierge is staged as a bounded synthetic source file when the request is an executable coding/repair objective. Explanation-only requests remain ordinary COS reasoning and do not mutate code.
- Owner Platform Engineer repair still requires a pinned SignalBoost revision and freshness preflight, then inspect → reproduce → minimal repair → rerun proof.
- After a verified repository repair, a configured server-side `GITHUB_WRITE_TOKEN` may publish the changed files as a serialized review branch and pull request. Main-targeted PRs advance `.github/main-write-token` from the pinned base.
- Repository write-back rechecks branch freshness immediately before mutation.
- Partial GitHub mutation is reported honestly: if objects/commit/branch were created before a later API failure, the response records the last completed stage instead of claiming no write occurred.
- Merge and deployment remain separate governed actions. This repair path does not self-merge or deploy merely because a repair succeeded.

## Public / owner boundary

Public/customer Concierge:

- may stage, edit, run, test, debug, repair, and return user-supplied workspace files;
- does not receive SignalBoost repository authority from prompt wording;
- does not inherit owner/private context through public delivery.

Authenticated SignalBoost owner:

- remains owner when using the browser Concierge because the canonical browser dispatcher authenticates before choosing public scope;
- may invoke pinned SignalBoost repository repair through the shared COS Software Specialist;
- may publish a verified repair to a review branch/PR when the server-side write credential is configured.

## Verification

`saas/tests/cosSoftwareSpecialistRouting.node.test.ts` covers:

- raw pasted TypeScript becomes a real Builder file;
- explanation-only pasted code does not enter mutation;
- both browser faces use the canonical COS dispatcher;
- direct public Concierge keeps repository repair disabled;
- write-back is unavailable without a server-side write token;
- verified write-back creates a serialized review branch + PR and does not self-merge/deploy;
- branch freshness is rechecked immediately before GitHub mutation.

CI/Preview remains authoritative for integration acceptance. No deployment or production acceptance should be claimed from source inspection alone.
