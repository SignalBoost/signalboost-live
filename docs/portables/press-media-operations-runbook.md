<!-- docs/portables/press-media-operations-runbook.md -->

# Press & Media — operations runbook

Written for the team that will install this and be on the hook for it. Every
step here is something you can do from the archive you were given; where a step
depends on your own infrastructure, it says so.

## What you are installing

Source code that runs inside your environment. Three payload roots ship
together — the press core, the shared kernel that carries company identity and
factual discipline, and the audit event shape. The core reaches the other two by
relative path, so extracting only one of them produces broken imports.

It has no server of ours, no account with us, and no network destination it
chooses for itself.

## 1. Verify what you received

```
sha256sum -c SHA256SUMS
grep -rn "process\.env" payload/            # expect: no results
grep -rniE "https?://" payload/             # expect: no destination of ours
```

`manifest.json` records the source commit, every payload file's SHA-256, every
runtime dependency, and what is deliberately not included. It also records the
graph walk: the release is built by following the real imports from the declared
entry points and **fails if the graph reaches anything undeclared**. Host
fallbacks and vendor-name exceptions are both empty.

If a grep above returns something, stop and raise it. Those three commands are
the whole portability claim, and they are cheap to run.

## 2. Install

Extract the archive and point your build at the payload. Three entry points:

| Import | Gives you |
| --- | --- |
| `.` | the press engine, registry and adapters |
| `./kernel` | company identity and factual discipline |
| `./audit` | the audit event shape |

Then implement the ports. `ai`, `email` and `notify` are required; `http`,
`runner`, `company`, `audit`, `discovery` and `config` are optional and are
reported honestly when absent rather than simulated.

Register the adapters you intend to use:

```ts
const registry = createDefaultMediaRegistry()   // free submission already registered
registry.register(createPrWireAdapter())
registry.register(createMediaDatabaseAdapter())
```

## 3. Prove it works — before you rely on it

Run the acceptance harness against **your** ports, to an address **you**
control:

```
node scripts/run-press-acceptance.mjs <your-ports-module> --self press-test@yourcompany.com
```

It refuses to run without `--self`, and it never reads a target from a media
database. It sends one real email, because a stubbed transport proves nothing
about whether your mail actually leaves.

Eleven checks are reported independently: provider registered, buyer identity
used, unverified target refused, invalid contact refused, generation used your
AI, forbidden claim absent, unapproved quote absent, dispatch delivered, owner
notified, proof not fabricated, audit sink reachable.

Exit 0 only when every check passes. **Keep the JSON record** — it is your
acceptance evidence, and it is the artifact to attach to a change ticket.

Re-run it after every upgrade and after any change to your own port
implementations. The harness tests your wiring, not ours, so a change on your
side is exactly when it earns its keep.

## 4. Day-to-day operation

The intended path, and the reason each step is separate:

1. **Discover** — `findPublications(ports, query)` returns leads. It contacts
   nobody and queues nothing.
2. **Review** — a person reads the leads. A lead is a suggestion.
3. **Promote** — `leadToTarget(lead)` turns an approved lead into something the
   engine will actually email. This step is deliberate and human.
4. **Generate and dispatch** — through the adapter for that target's provider.
5. **Proof** — `fetchProof(ref)` stays pending until the provider confirms.
   Pending is a real answer, not an error.

Your owner is notified twice: at submission or scheduling, and again at
publication when the provider confirms it.

## 5. Upgrade

Install the new payload alongside the old one, run the acceptance harness
against it, and switch entry points only once it passes. The payload holds no
state of its own, so an upgrade touches no data. Anything you have persisted —
campaigns, leads, approvals — lives in your schema and is untouched.

## 6. Roll back

Point your build back at the previous payload. There is no migration to undo and
no state to reconcile, because the portable persists nothing. Keep the previous
archive and its `SHA256SUMS` until the new one has been through a real campaign.

## 7. Backup and restore

There is nothing of ours to back up. What matters is yours:

- your campaign and lead tables, on your normal backup schedule;
- your provider configuration and secrets, in your vault;
- the acceptance records, which are your evidence that a given version passed;
- the archives themselves, so a restore can reproduce a known-good version.

Restore is: extract the archive, verify checksums, re-run acceptance.

## 8. Removing it

Delete the payload and the ports you wrote for it. Nothing else of ours remains,
because nothing else was ever installed. Your data stays yours; decide
separately what to do with the contact records you have accumulated — see the
security and data-handling statement on retention.

## 9. When something is wrong

| Symptom | Most likely cause |
| --- | --- |
| Every send fails immediately at the transport | The From address is not verified with your mail provider. A plausible alias that was never verified fails at send time, not at configuration time. |
| Discovery returns a refusal naming what to connect | No `discovery` port is wired. That message is correct behaviour — it is not an empty result, and it is not a failure to find anything. |
| A target is refused before dispatch | It has no contact, or a malformed one. Validation rejects it deliberately rather than letting it fail later as a confusing provider error. |
| Copy came back without a quote you expected | No approved quote was supplied. No approved quote means no quote at all. |
| `fetchProof` stays pending | The provider has not confirmed publication. Proof is never fabricated; pending is the honest state. |
| Acceptance passes but real mail does not arrive | Check your transport's own logs. Delivery is recorded only after your `EmailPort` resolves, so a green record means your transport accepted it. |

For anything reproducible in unmodified payload code, raise it through the
channel named in the support framework, with the acceptance record attached.
