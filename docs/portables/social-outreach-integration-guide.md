<!-- docs/portables/social-outreach-integration-guide.md -->

# Social Outreach Connector — buyer integration guide

Publish approved content to seven social platforms using **your own** developer
applications, your own accounts and your own credentials. Nothing is shared with the
vendor, and no content leaves your deployment except to the platform you connected.

This guide is for the engineer wiring it into a host. It describes the interfaces you
implement, the tables it needs, what each platform requires of you before it can
publish, and what the connector deliberately does not do.

---

## 1. What it is

A publishing layer, not a scheduler and not a content generator. It takes an approved
post and puts it on a platform, then reports back a real permalink or an honest failure.

Its central rule: **a post is reported as published only when the platform confirms it.**
There is no optimistic success anywhere in the layer. If a provider returns no id or no
URL, the result is a failure with the provider's own reason attached.

## 2. The seven connectors

| Platform | Content | Needs a destination | Publish modes |
| --- | --- | --- | --- |
| YouTube Channels | video | no | native |
| TikTok | video | no | native |
| Instagram Business | media (Reels) | yes | native |
| LinkedIn Profile | text, video | yes (auto-discovered) | link, native |
| LinkedIn Company | text, video | yes | link, native |
| Facebook Pages | text, video | yes | link, native |
| Twitter/X | text | no | link |
| Reddit | text | yes | link |

"Needs a destination" means the platform posts on behalf of a specific page, channel or
profile, so one must be selected before publishing. The layer discovers the available
destinations from the provider after connection; it never guesses one.

**Publish modes.** `link` posts a caption plus a URL. `native` uploads the media into
the post itself. Where both are available the choice is yours, changeable at any time,
and **a native failure automatically falls back to a link post** — a publish never dead-
ends because an upload failed.

## 3. What you must supply per platform

This is the part no software can do for you, and it differs sharply by platform. Plan
for it before promising a launch date.

| Platform | Developer app | Business entity required | Review |
| --- | --- | --- | --- |
| YouTube | Google Cloud project | no — any Google account | consent screen must be **In production**, or refresh tokens expire after 7 days |
| LinkedIn Profile | LinkedIn app | **no** | none — Share on LinkedIn and Sign In with LinkedIn are self-serve |
| LinkedIn Company | LinkedIn app | yes — registered company and a verified Page | Community Management API review |
| Facebook / Instagram | Meta app | a Page or Business account (free to create) | app review for publishing permissions |
| TikTok | TikTok developer app | no | content posting audit |
| Twitter/X | X developer account | no | paid API tier |
| Reddit | Reddit app | no | none |

**Start with LinkedIn Profile and YouTube.** Both can be live the same day. The others
unlock as their approvals land, and the layer treats each independently — an unapproved
platform simply reports "not configured" and the rest keep working.

## 4. Interfaces you implement

### 4.1 Credentials — `SocialSecretsResolver`

The only host coupling in the layer. Your OAuth client ids and secrets are read through
a resolver you install, so they can live in your vault rather than in deployment
environment variables.

```ts
import { setSocialSecretsResolver, socialCredentialNames } from './social-secrets.ts'

// Pre-load at startup: the resolver is synchronous, because it is called inside OAuth
// URL construction and request signing. A vault round trip per outbound request would
// add latency and a failure mode to every publish.
const cache = await loadFromYourVault([
  ...socialCredentialNames('youtube_channels'),
  ...socialCredentialNames('linkedin_member'),
])

setSocialSecretsResolver((name) => cache[name])
```

Credential names follow one convention: `SOCIAL_<PLATFORM>_CLIENT_ID` and
`SOCIAL_<PLATFORM>_CLIENT_SECRET`, where `<PLATFORM>` is the connector id upper-cased.
Install nothing and the default reads `process.env`, which is the right choice for a
trial deployment.

### 4.2 Datastore

The layer does not open a database connection. Every function that reads or writes
state takes your client as its first argument, so any Postgres-compatible client works.

```ts
getValidSocialToken(db, userId, platform)   // -> { ok, accessToken, accountRef, accountName }
resolvePublishMode(db, userId, platform)    // -> 'link' | 'native'
```

Three tables are required. DDL ships with the package.

| Table | Holds |
| --- | --- |
| `outreach_social_tokens` | per-user OAuth access and refresh tokens, keyed `(user_id, platform)` |
| `outreach_social_destinations` | the pages, channels and profiles discovered after connection |
| `outreach_social_settings` | the chosen publish mode per user per platform |

Tokens are refreshed automatically when a provider returns an expiry. Store them
encrypted at rest if your policy requires it — the layer only reads what your client
returns.

## 5. What it does not do

Stated plainly, because a buyer discovering these late is a buyer who feels misled.

- **It does not schedule.** Give it an approved post and it publishes now. Timing is
  your queue's job.
- **It does not obtain platform approvals.** Reviews, audits and paid tiers are between
  you and each platform.
- **It does not guarantee reach, engagement or monetization.** No API sets those, and
  any product claiming otherwise is guessing.
- **It does not post without a destination** where the platform requires one. It
  refuses with `account_ref_not_configured` rather than picking one for you.
- **It does not report success it cannot prove.** No permalink, no success.

## 6. Operational notes worth knowing before launch

**Google's consent screen.** While a Google Cloud OAuth app is in *Testing*, refresh
tokens expire after exactly seven days. Publishing then stops with `invalid_grant` and
no code change will fix it. Move the consent screen to *In production*. The
`youtube.upload` scope is classed as sensitive, so Google may ask for verification.

**LinkedIn native video is the least-proven path.** It is a three-call upload —
initialize, PUT each chunk collecting ETags, finalize with the ordered part ids — and
chunked uploads fail in ways single uploads do not. It defaults to `link` mode for this
reason, and native failure falls back to a link post. Prove it on one real post before
relying on it.

**Rate limits are per platform and per app**, not per user. High-volume publishing
across many tenants needs your own queue in front of this layer.
