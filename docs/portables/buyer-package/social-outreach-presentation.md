<!-- docs/portables/buyer-package/social-outreach-presentation.md -->

# Social Outreach Connector — Buyer Evaluation

**Publish approved content to seven social platforms from your own infrastructure, using your own developer applications, your own accounts and your own credentials.**

*Prepared by SignalBoost · technical evaluation material · not an offer or production commitment*

> **Before sending this document, fill in:** [SET price], [SET pilot length], [SET pilot fee], and the contact line in section 10.

---

## 1. The problem

Most social publishing tools are services. Your content, your access tokens and your posting schedule live on a vendor's servers, and every post routes through infrastructure you neither run nor audit. For a regulated buyer, or any buyer whose brand voice is the asset, that is a standing exception on a security review.

The alternative is usually worse: engineers wiring seven platform APIs by hand, each with its own OAuth dance, its own upload protocol and its own idea of what "published" means.

This connector answers one question with evidence:

> Can a team publish to every platform that matters, from their own environment, without a vendor holding their tokens or their content?

## 2. What it is

A publishing layer that installs into your stack. Roughly 900 lines across eight files, **zero third-party dependencies**, and no network calls except to the platform you connected.

```text
your approved content
→ your credentials, resolved from your vault
→ your OAuth token, stored in your database
→ the platform's own API
→ a real permalink, or an honest failure
→ your audit trail
```

The vendor operates nothing in that path and receives nothing from it.

## 3. The rule the design turns on

**A post is reported as published only when the platform confirms it.**

There is no optimistic success anywhere in the layer. If a provider returns no id and no URL, the result is a failure carrying the provider's own reason. Nothing downstream — no notification, no dashboard, no report — can claim a post exists that does not.

That sounds obvious until you audit tools that queue a post, return success, and let you discover three days later that an expired token silently dropped a week of content.

## 4. The seven connectors

| Platform | Content | Publish modes |
| --- | --- | --- |
| YouTube Channels | video | native |
| TikTok | video | native |
| Instagram Business | Reels | native |
| LinkedIn Profile | text, video | link, native |
| LinkedIn Company | text, video | link, native |
| Facebook Pages | text, video | link, native |
| Twitter/X | text | link |
| Reddit | text | link |

**Link mode** posts a caption and a URL. **Native mode** uploads the media into the post itself. Where both exist the choice is yours, changeable at any time, and **a native failure falls back to a link post automatically** — a publish never dead-ends because an upload failed.

## 5. Every buyer can publish on day one

This is the part most vendors leave you to discover after signing.

Social platforms gate their posting APIs behind business verification and app review, not follower counts — and the requirements differ sharply:

| Platform | Business entity required | Approval |
| --- | --- | --- |
| YouTube | no — any Google account | consent screen in production |
| LinkedIn Profile | **no** | none — self-serve products |
| LinkedIn Company | yes — registered company, verified Page | Community Management review |
| Facebook / Instagram | a Page or Business account | app review |
| TikTok | no | content posting audit |
| Twitter/X | no | paid API tier |
| Reddit | no | none |

So the connector ships **both LinkedIn paths**: posting from a person's own profile, which is free and self-serve, and posting from a company page, which is not. A five-person startup connects LinkedIn and YouTube the same afternoon. An enterprise adds the rest as their approvals land, and each platform is independent — an unapproved one reports "not configured" while the others keep working.

## 6. What you implement

One interface, and it is the one your security team will ask about.

```ts
setSocialSecretsResolver((name) => yourVault.get(name))
```

Your OAuth client ids and secrets are read through a resolver you install, so they live in AWS Secrets Manager, Azure Key Vault, HashiCorp Vault or your own service — not in deployment environment variables. Install nothing and it reads `process.env`, which is the right choice for a trial.

Everything else is already injected. Every function that touches state takes your database client as its first argument; the layer opens no connection of its own and ships DDL for the three tables it needs.

## 7. The portability claim, verified rather than asserted

Run one command:

```bash
node scripts/build-social-portable.mjs --check
```

It walks the import graph from the public entry point and **fails** if any reachable file imports a host path, escapes the layer's directory, or pulls in a third-party package. Then the build packs a tarball, installs it into a clean directory, and confirms the installed manifest declares no dependencies.

The same check runs in CI on every change to the layer. If a future edit reaches for host infrastructure, the build breaks instead of shipping something that only works on the vendor's deployment.

We test that guard by breaking it deliberately: a host import added to a connector fails the check by name. A boundary check that stays green when you violate the boundary is measuring nothing.

## 8. What it does not do

Stated plainly, because a buyer who discovers these after signing is a buyer who was misled.

- **It does not schedule.** Give it an approved post and it publishes. Timing belongs to your queue.
- **It does not obtain platform approvals.** Reviews, audits and paid tiers are between you and each platform.
- **It does not guarantee reach, engagement or monetization.** No API sets those.
- **It does not post without a destination** where the platform requires one. It refuses rather than choosing for you.
- **It does not generate content.** It publishes what you approved.
- **LinkedIn native video is the least-proven path.** It is a three-call chunked upload, it defaults to link mode, and failure falls back to a link post. Prove it on one real post before relying on it.

## 9. Editions and commercials

| | Standard | Enterprise |
| --- | --- | --- |
| Connectors | all seven platforms | all seven platforms |
| Credential resolver | environment variables | your vault |
| Deployment | one environment | per production environment |
| Support | business hours | see support terms |
| Price | [SET price] | [SET price] |

**Pilot:** [SET pilot length] at [SET pilot fee], covering installation into one environment, two platforms connected end to end, and a working publish from your own infrastructure.

## 10. Next steps

1. Read the integration guide — it names every interface, table and platform requirement.
2. Run the boundary check against the source. It takes seconds and proves the claim in section 7.
3. Install the tarball in a scratch environment and connect LinkedIn Profile and YouTube — both are same-day.
4. Publish one real post and confirm the permalink.

Contact: [SET name, title, email]

---

*Supplied with this document: the integration guide, the built tarball with per-file checksums, and the DDL for the three required tables.*
