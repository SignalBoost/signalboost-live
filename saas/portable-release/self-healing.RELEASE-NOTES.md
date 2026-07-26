<!-- saas/portable-release/self-healing.RELEASE-NOTES.md -->

# Self-Healing Supervisor — 1.0.0-rc.1

First distributable release of the Self-Healing Supervisor as a standalone
product. Everything before this existed only as source inside a monorepo; this
is the first version a buyer can receive, verify and install without access to
the build platform.

## What it does

It watches infrastructure, diagnoses incidents, drafts a repair plan, and then
stops. Every step the plan classifies as financial, destructive or
credential-affecting is halted and routed to a named human approver before it
can run. Safe steps execute; consequential steps wait for a person.

## What is in the archive

| Item | Purpose |
| --- | --- |
| `payload/` | The modules your deployment loads. Nothing else. |
| `manifest.json` | Version, source commit, every file with its SHA-256, the interfaces you supply, and what is deliberately not included. |
| `SHA256SUMS` | Verify with `sha256sum -c SHA256SUMS` from the archive root. |
| `sbom.json` | CycloneDX 1.5 software bill of materials. |
| `docs/integration-guide.md` | Interfaces, ledger DDL, reference wiring, go-live checklist. |
| `package.json` | Declares entry points and peer dependencies. |

## What you supply

The payload reads no environment variables and holds no credentials. It reaches
your infrastructure through interfaces you implement: secrets, SQL, notification
delivery, approver identity, branding, and SIEM transport. `manifest.json` lists
them under `buyerMustSupply`, and the integration guide gives the signatures and
a reference wiring.

A reference `ApproverDirectory` ships in the payload. It validates when your
deployment is wired rather than when an incident occurs, because the notifier
swallows delivery errors by design — a directory that failed at runtime would
fail silently, on the one control you most need to trust.

## Proving it works in your environment

Run `runAcceptanceScenario({ host })` from
`payload/supervisor/portable/acceptance-harness.ts` against your own wiring,
once per risk category. It reports five checks independently: the safe step
executed, the consequential step paused, your approver was reached, your
branding was used, and the audit trail reached your SIEM.

Nothing consequential executes during acceptance — the dangerous step is
required to pause. The approver notification is real, delivered through your own
sink, and only counted as passed after your sink accepts it.

Keep the returned result. It is frozen and JSON-serializable, and it is the
acceptance record for your deployment.

## Verifying the archive

```sh
sha256sum -c self-healing-supervisor-1.0.0-rc.1.tgz.sha256
tar xzf self-healing-supervisor-1.0.0-rc.1.tgz
sha256sum -c SHA256SUMS
```

`manifest.json` records the exact source commit this archive was built from.

## Known limitations in this release candidate

1. Two adapter identifiers still carry the build platform's name into evidence
   records and SIEM output. Naming only, no behaviour change, and both are
   listed in `manifest.json` under `namingExceptions` with the reason. They must
   be renamed before 1.0.0 final.
2. Deployment-platform trigger ingestion reads platform environment variables
   directly. It is outside the buyer import graph and is not in this archive;
   incident sources are host-side.
3. The acceptance harness has not yet been run against a real buyer deployment.
   That run is what turns this release candidate into 1.0.0.

## Why this is `-rc.1` and not `1.0.0`

The code checklist is complete and the release gates pass. What is missing is
evidence from a real environment. A version number is a promise, and the promise
is not earned until one deployment other than the build platform has run the
acceptance harness and passed all five checks.

## Compatibility

No previous version exists, so there is no upgrade path to support yet. Within
`1.x` the interfaces you implement change additively only; a new required member
on any of them is a major version. Ledger rows carry `schema_version`, so rows
written by a newer version stay readable after a rollback.
