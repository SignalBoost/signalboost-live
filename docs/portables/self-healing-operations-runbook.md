# Self-Healing Supervisor — operations runbook

For the team that will run this in production. The integration guide covers the
interfaces you implement; this covers what happens after that — verifying what
you received, upgrading, rolling back, backing up, and removing it.

## What you are installing

Behaviour, not infrastructure. The payload holds no state, opens no network
connection of its own, reads no environment variable, and contains no
credential. Everything it touches, it reaches through an interface you
implement. That is why almost every procedure below is shorter than you expect:
there is very little of ours to break.

The one piece of persistent state is a single table in **your** database, whose
DDL is in §2 of the integration guide.

## 1. Verify what you received

Do this before extracting anything into a deployment path.

```sh
sha256sum -c <product>-<version>.tgz.sha256
tar xzf <product>-<version>.tgz
sha256sum -c SHA256SUMS
```

Then read `manifest.json`. It records the exact source commit the archive was
built from, every file with its SHA-256, the interfaces you must supply, and —
under `notIncluded` — what the product deliberately does not do. If anything in
`namingExceptions` is non-empty, read the reason attached to it.

`sbom.json` is CycloneDX 1.5 for your procurement and vulnerability tooling.

## 2. Install

1. Create the ledger table from §2 of the integration guide.
2. Implement the interfaces listed in `manifest.json` under `buyerMustSupply`.
   Start from the reference wiring in §5 of the guide.
3. Configure your approver directory. It validates at construction, so a
   missing approver or an unroutable address fails at deployment time rather
   than silently at the moment an incident needs a human.
4. Install your licence token as configuration and construct the entitlement
   gate — see `entitlements.md`.
5. Point your SIEM transport at the audit sink.

There is no migration to run beyond step 1, no service of ours to register
with, and no outbound allowlist entry to add.

## 3. Prove it works — before you rely on it

Run the acceptance harness against your own wiring, once per risk category:

```ts
import { runAcceptanceScenario } from '<payload>/supervisor/portable/acceptance-harness.ts';

for (const category of ['financial', 'destructive', 'credential_security']) {
  const result = await runAcceptanceScenario({ host, dangerousCategory: category });
  console.log(result.summary);
}
```

Five checks are reported independently: a safe step executed, a consequential
step paused, your approver was reached, your branding was used, and an audit
trail reached your SIEM. Nothing consequential executes — the dangerous step is
required to pause. The approver notification is real, delivered through your own
sink.

**Keep the returned result.** It is frozen and JSON-serializable, and it is your
acceptance record for this deployment. Re-run it after every upgrade and after
any change to your approver directory, notification channel or SIEM.

## 4. Day-to-day operation

Health is observable without us: query the ledger table for rows whose status
has not advanced, and watch your notification channel for approval requests that
nobody has acted on. A repair that is waiting for a human is the system working
correctly; a repair that has been waiting for a long time is an escalation
problem in your organisation, not a fault in the product.

`entitlement.describe()` returns one line suitable for a health endpoint or a
startup log. It never contains your licence token.

## 5. Upgrade

1. Verify the new archive as in §1.
2. Read `upgradeCompatibility` in the new `manifest.json`. Within a major
   version the interfaces you implement change additively only, so a minor
   upgrade should require no code change from you.
3. Compare the ledger schema. An added nullable column is a minor version and
   is safe to apply live; a change to an existing column is a major version and
   will say so.
4. Replace the payload directory. Do not merge two versions' files — extract
   the new archive to a fresh path and repoint your imports.
5. Re-run §3.

## 6. Roll back

The payload holds no state of its own, so rolling back is restoring the previous
archive and repointing your imports. Nothing has to be undone.

Ledger rows written by the newer version stay readable, because every row
carries `schema_version`. If the newer version added a nullable column, the
older version ignores it. If a major version changed a column, roll the schema
back with your own migration tooling first — that case is called out explicitly
in the release notes for the version that introduced it.

Re-run §3 after rolling back. A rollback that skips acceptance is a deployment
nobody has verified.

## 7. Backup

Two things are worth backing up, and neither of them is ours:

- **The ledger table**, with whatever cadence your other operational tables get.
  It is the record of what was proposed, what was approved and what ran.
- **Your wiring** — the modules implementing the interfaces, and your approver
  directory configuration. These are your source code; treat them as such.

The payload itself does not need backing up. It is a signed archive you can
re-download and re-verify, and `manifest.json` names the commit it came from.

Your licence token is configuration. Keep it wherever you keep the rest.

## 8. Restore

1. Restore the ledger table.
2. Extract the archive whose version matches the ledger's `schema_version`.
3. Restore your wiring and configuration.
4. Run §3 before letting it act on anything.

Rows that were mid-flight at the time of the backup will be in a claimed state.
They will not resume on their own, and that is deliberate: silently continuing a
half-finished repair after a restore is how a recovery becomes a second
incident. Review them and close or reissue them deliberately.

## 9. Removing it

1. Stop calling the dispatcher.
2. Delete the payload directory.
3. Export the ledger table if you want to keep the history, then drop it.
4. Remove your licence token from configuration.
5. Remove the interface implementations you wrote for it.

There is nothing of ours left behind: no scheduled job, no external
registration, no data held anywhere outside your own systems. Nothing needs to
be deauthorised on our side for your data to be gone, because none of it was
ever on our side.

## 10. When something is wrong

Every refusal names its reason, and every audit event carries the dispatch and
incident id. Quote those, plus the `version` and `sourceCommit` from your
`manifest.json`, when you contact support. Those four values identify exactly
what you are running.

Support scope, response targets and severity definitions are in your support
terms, not here.
