<!-- saas/portable-release/press-media.RELEASE-NOTES.md -->

# Press & Media — 1.0.0-rc.1

First distributable release of the Press & Media portable. Fifteen modules, no
runtime dependencies, and nothing in the payload that reaches outside the
interfaces you implement.

## What it does

It turns a campaign brief into press outreach through whichever providers you
have relationships with. A registry holds provider adapters; five adapter shapes
ship with it — free submission, PR wire, media database, ad platform, direct
I/O — and you can register your own.

Generated copy is governed by the factual-discipline kernel that ships in the
same archive: the engine states only facts your company record contains, and
anything it does not know appears as a visible `[PLACEHOLDER]` rather than as an
invented product name, person, quote or statistic. That rule exists because the
alternative gets discovered by a journalist.

## What is in the archive

| Item | Purpose |
| --- | --- |
| `payload/press-media-core/` | The registry, the five adapters, the contract types. |
| `payload/portable-kernel/` | Company identity and factual discipline. |
| `payload/portable-audit/` | The SIEM event shape, ECS-JSON and CEF. |
| `manifest.json` | Version, source commit, per-file SHA-256, what you supply, what is not included. |
| `SHA256SUMS` | Verify with `sha256sum -c SHA256SUMS` from the archive root. |
| `sbom.json` | CycloneDX 1.5. It lists no components, because there are none. |
| `docs/design.md` | The portable's design document. |

## What you supply

Everything that touches the outside world:

- **AiPort** — your model, your key, your spend. No provider SDK is in the payload.
- **EmailPort** — your transport. The payload composes; you deliver.
- **OwnerNotifyPort** — how a human hears what happened.
- **HttpPort** — only for adapters that call a provider API directly.
- **RunnerPort** — config-driven execution for paid providers. Without it, paid adapters can say what they need but cannot dispatch.
- **CompanyProfilePort** — optional, and the one worth wiring first. It is how the engine knows whose company it is writing for.

Your PR wire, media database and ad platform accounts stay yours, billed to you.
The portable knows the shape of those providers; the relationship is not ours to
hold.

## Verifying the archive

```
sha256sum -c press-media-1.0.0-rc.1.tgz.sha256
tar xzf press-media-1.0.0-rc.1.tgz
sha256sum -c SHA256SUMS
grep -rn "process\.env" payload/     # expect: no results
```

`manifest.json` records the exact commit this was built from. The build pipeline
runs an independent verifier over the artifact that fails the release if the
payload gains an environment read, a credential-shaped string, the build
platform's name, or a file the manifest does not list.

## Known limitations

1. Factual discipline is enforced by prompt construction and visible placeholder
   markers, not by a post-generation checker. Review copy before it reaches a
   journalist.
2. Paid adapters need a `RunnerPort`. Without one they describe their
   requirements but cannot dispatch.
3. Proof collection is provider-shaped and asynchronous. A dispatch that returns
   `submitted` is not evidence of publication.
4. Seats and execution limits recorded in a licence are contract terms, not
   enforced controls.

## Why this is `-rc.1`

The payload is clean and the release gates pass — no host coupling, no
environment reads, no external dependencies, no build-platform name anywhere.
What does not exist yet is an acceptance harness: a way for you to prove, in
your own environment against your own ports, that the thing works before you
point it at a journalist.

The Self-Healing Supervisor has one because its risk is operational. This
portable's risk is commercial — a bad release goes out under your name — and
that deserves the same treatment. Until a buyer can run acceptance and keep the
record, this stays a release candidate.

## Compatibility

No previous version, so nothing to upgrade from yet. Within `1.x` the port
interfaces change additively only; a new required member on any of them is a
major version. Adapters you write against `MediaProviderAdapter` keep working
across minor versions. The payload holds no state, so rollback is restoring the
previous archive.
