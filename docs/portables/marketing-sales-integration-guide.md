<!-- docs/portables/marketing-sales-integration-guide.md -->

# Marketing + Sales — Integration Guide

For the engineer installing this portable into your own stack. It assumes you have the
tarball and nothing else.

Companion documents:

- `docs/portables/social-outreach-integration-guide.md` — the publishing half in isolation,
  for buyers who take the connector-only artifact.
- `docs/portables/buyer-package/marketing-sales-presentation.md` — the commercial summary.

---

## 1. What you receive

One npm-installable tarball, `@signalboost/marketing-sales`. Zero runtime dependencies. It
contains three surfaces built on one approval model:

| Surface | Package path | What it does |
| --- | --- | --- |
| Email outreach | `src/outreach/…` | Finds prospects, drafts in their language, routes every draft through a human, sends |
| Social publishing | `src/outreach/…` | Publishes to eight platforms plus any platform you declare |
| Paid advertising | `src/ads/…` | Creates capped, approved, paused-by-default campaigns on ten networks, plus any you declare |

The two paths stay distinguishable inside the package on purpose: `src/ads/…` carries a
different risk profile from everything else, because it spends money. It is the same product
and the same boundary, not a second install.

A second, smaller artifact exists — `@signalboost/social-outreach-connector`, publishing
only. It is wholly contained in the larger one. Take it only if you already have a system
upstream deciding what to publish; otherwise it will look like half a product, because it is.

### What it is not

The portable brings behaviour. You bring infrastructure. It has no opinion about your
database vendor, your secrets store, your identity provider, your queue or your logging, and
it imports nothing from the platform it was developed on. If you find a reference to a host
system anywhere in the installed files, that is a defect — report it, because CI is supposed
to fail the build before it reaches you.

---

## 2. Requirements

- Node 18 or later.
- A Postgres-compatible database you control.
- Outbound HTTPS to the providers you enable, and nothing else.
- An email sending account (the reference implementation targets Resend; any provider works
  if you supply the send function).

Install from the tarball rather than a registry:

```bash
npm install ./signalboost-marketing-sales-<version>.tgz
```

Verify it landed intact before wiring anything:

```bash
node -e "const p=require('@signalboost/marketing-sales'); console.log(Object.keys(p).length)"
```

A non-zero key count and no import error means the package is self-contained. If that command
needs anything from your application to succeed, stop and tell us — it should not.

---

## 3. Database

Three tables back the engine. The DDL ships with the package under `migrations/`:

| Migration | Adds |
| --- | --- |
| `20260731_outreach_product_key.sql` | Product scoping on outreach records, so duplicate protection is per product rather than global |
| `20260802_outreach_custom_platforms.sql` | `outreach_social_custom_platforms` — the platforms you declare |
| `20260802_integration_custom_providers.sql` | `integration_custom_providers` — the tools you declare |
| `20260802_ads_spend_ledger.sql` | `ads_campaigns`, `ads_spend_events`, `ads_account_ceilings` — the paid-advertising ledger |

Run them in your own migration runner or paste them into your SQL console. DDL returns zero
rows on success; that is not an error.

**No table in this schema holds a secret.** Credentials live in your environment or your
vault, and the column comments say so. If you find yourself adding a `client_secret` column,
you have gone off the supported path.

---

## 4. Configuration

### Email outreach

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Send credential. Swap for your own provider's key if you replace the send function |
| `OWNER_EMAILS` | Who receives approval requests and the daily digest. Comma-separated |
| `CRON_SECRET` | Shared secret for the scheduled digest endpoint |
| `BRAVE_SEARCH_API_KEY` | Prospect discovery |
| `OUTREACH_PHYSICAL_ADDRESS` | Appended to every outbound message. Required by CAN-SPAM and its equivalents; the engine refuses to send without it |

### Social publishing

Two variables per platform, using the platform's id in upper case:

```
SOCIAL_<PLATFORM>_CLIENT_ID
SOCIAL_<PLATFORM>_CLIENT_SECRET
```

The same convention applies to platforms you declare yourself — declare `bluesky` and the
engine looks for `SOCIAL_BLUESKY_CLIENT_ID` and `SOCIAL_BLUESKY_CLIENT_SECRET`. The declare
API returns the exact two names to set, so nobody has to guess.

### Paid advertising

One access token per network, read from the environment and never from a request:

```
ADS_META_ACCESS_TOKEN        ADS_REDDIT_ACCESS_TOKEN
ADS_LINKEDIN_ACCESS_TOKEN    ADS_PINTEREST_ACCESS_TOKEN
ADS_TIKTOK_ACCESS_TOKEN      ADS_SNAPCHAT_ACCESS_TOKEN
ADS_X_ACCESS_TOKEN           ADS_GOOGLE_ACCESS_TOKEN
ADS_MICROSOFT_ACCESS_TOKEN   ADS_AMAZON_ACCESS_TOKEN
```

Plus, for the networks with prerequisites of their own:

| Variable | Needed by |
| --- | --- |
| `ADS_CURRENCY` | all — the account currency, which decides the size of a minor unit |
| `ADS_REPORT_LOOKBACK_DAYS` | all — how far back a reporting window reaches (default 90) |
| `ADS_LINKEDIN_CAMPAIGN_GROUP_URN` | LinkedIn — every campaign belongs to a campaign group |
| `ADS_GOOGLE_DEVELOPER_TOKEN`, `ADS_GOOGLE_CAMPAIGN_BUDGET` | Google — and optionally `ADS_GOOGLE_LOGIN_CUSTOMER_ID` |
| `ADS_X_SIGNING_PROXY_URL`, `ADS_X_FUNDING_INSTRUMENT_ID` | X |
| `ADS_MICROSOFT_BRIDGE_URL` | Microsoft |
| `ADS_AMAZON_REPORTING_URL`, `ADS_AMAZON_CLIENT_ID`, `ADS_AMAZON_PROFILE_ID` | Amazon |

A network whose prerequisites are absent is not declared at all, and the cockpit lists it
with the reason. Half-declared networks do not exist here.

### Sender addresses

Every outbound address must be verified with your email provider before use. An unverified
alias does not degrade — the send fails outright. Decide your desks up front and verify them
as a set. A workable division, and the one the reference deployment uses:

| Desk | Used for |
| --- | --- |
| `sales@` | Cold sales outreach |
| `partners@` | Press and partnership relationships |
| `marketing@` | Outbound brand |
| `support@` | Support replies |
| `contact@` | General |

---

## 5. The email outreach surface

The sequence is: discover → draft → approve → send → digest.

**Discovery** searches regionally, in the target's own language, across eleven countries. It
finds published contact addresses only. Where no published address exists it records the
prospect and skips it — it does not construct `firstname.lastname@company.com` and hope. That
single decision is most of the difference between this and a scraper.

**Drafting** produces the message in one of five languages, chosen from the target rather than
from your locale. Product scoping means the same company can be approached about a different
product without tripping duplicate protection, and cannot be approached twice about the same
one.

**Approval** is not optional and there is no parameter that skips it. Nothing leaves the
system until a human named in `OWNER_EMAILS` approves that specific draft.

**Send** passes every approved message through one chokepoint that attaches the signature,
the physical address and the unsubscribe link. There is no second send path. If you need a
different signature per desk, configure it there; do not add a bypass.

**Digest** is a scheduled summary of everything pending, so drafts do not rot unseen in a
queue. Point your scheduler at the digest endpoint with `CRON_SECRET` in the header.

---

## 6. The social publishing surface

Eight connectors ship built in: YouTube, TikTok, Instagram, LinkedIn Company, LinkedIn
Profile, Facebook, X, Reddit. Each handles OAuth, token refresh, destination discovery, and
link-versus-native publishing with automatic fallback when a platform refuses the native
form. Cross-posting one item to several destinations is a single call.

### The rule that governs all of it

**A post is reported as published only when the platform confirms it.** Not when the request
returns 200, not when a retry is queued. Everything else in this surface follows from that.

### Declaring a platform

A platform is data, not code. You can publish to anything with an HTTP API — Threads,
Pinterest, Bluesky, Mastodon, Telegram, Weibo, VK, whatever your market actually uses —
without an adapter, a release, or us.

```js
import { registerCustomPlatform } from '@signalboost/marketing-sales';

registerCustomPlatform({
  id: 'bluesky',
  label: 'Bluesky',
  authUrl: 'https://bsky.social/oauth/authorize',
  tokenUrl: 'https://bsky.social/oauth/token',
  scopes: ['write'],
  publishUrl: 'https://bsky.social/xrpc/com.atproto.repo.createRecord',
  method: 'POST',
  body: { kind: 'json', template: { text: '{text}', repo: '{accountRef}' } },
  idPath: 'uri',
});
```

The body template accepts a fixed placeholder vocabulary — `{text}`, `{videoUrl}`,
`{imageUrl}`, `{accountRef}`, `{accountName}`, `{title}` — and nothing else. It is not a
template language, deliberately: you should not have to learn a DSL, and a DSL feeding a
network call is a larger attack surface than this problem deserves.

**A declaration without `idPath`, `idHeader` or `urlPath` is refused at registration.** If we
cannot read a post identifier back, we cannot confirm the post, and an unconfirmable post
would break the rule above. A URL the platform returns always wins over a permalink template,
because a returned URL is a fact and a template is a guess.

Declared platforms run the identical path as built-in ones — same confirmation rule, same
approval gate, same credential resolution. You can add reach. You cannot add authority.

### Declaring through the UI instead

The cockpit at `/dashboard/outreach/social` carries an **Add any platform** panel with the
same fields and the same validation. Its submit button stays disabled until the declaration
would pass, so the interface cannot even attempt something the runtime would reject. It does
not ask for a client id or secret — those are yours, and it tells you which two environment
variables to set.

### One deployment note

The platform registry lives in process memory, and serverless processes are cold and
independent. Every route that publishes or lists hydrates the registry from storage first. If
you fork a route, keep the hydration call. Assuming warm state fails intermittently, which is
the hardest kind of failure to diagnose.

---

## 7. The paid advertising surface

Organic publishing that fails costs nothing. An ad that goes out wrong spends real money at
machine speed and does not come back. This surface is therefore built around the spend, not
the creative, and it is stricter than the one above.

### Three rules, enforced not documented

1. **No spend without a cap.** Every campaign carries a maximum. A request without one, or
   above your account ceiling, is refused before any provider is contacted.
2. **The spend approval is separate from the content approval**, and both are recorded. The
   person who signs off on copy is usually not the person who signs off on money.
3. **Reconciliation reads the provider, never our own arithmetic.** Platforms overdeliver and
   convert currency. Actual spend is whatever the provider reports.

Supporting constraints, all deliberate:

- **Every campaign is created paused**, on every network. The campaign exists and the cap is
  registered; a person turns it on. A mistake in the create request therefore costs nothing.
- Money is integer minor units. A fractional cent is refused, not rounded — it means someone
  did floating-point arithmetic on money upstream.
- A cap in a different currency from the account ceiling is refused, not converted. An
  exchange rate applied here would be our guess about your money.
- Registration throws unless the adapter can create a campaign, **read spend and pause**. A
  network that can start spending but cannot report or be stopped is exactly what you need at
  2am.
- If the provider returns no campaign id, the result is a loud failure telling you to check
  the ad account directly. A campaign we cannot track may still be running.
- A failed pause returns a failure rather than being swallowed.

### The ledger

Three tables carry the answer to "what is authorised to spend right now, who approved it, and
what has it actually spent". A campaign row **cannot exist** without a cap and both approvers
— the row is the authorisation — and it is written *before* the network is contacted, so a
create whose response is lost still leaves a record that the account was asked to spend.

Spend events are append-only, and each one stores the provider's raw figure and the units it
arrived in beside the converted amount. If a network is ever declared with the wrong units,
that is the evidence which settles it rather than an argument about whose arithmetic was
right.

### The ten networks

| Network | Spend reported in | What you supply beyond an ad account |
| --- | --- | --- |
| Meta | major | `ads_management`, business verification, app review |
| LinkedIn Ads | major | partner-gated API access, a campaign group urn |
| TikTok Business | major | a Business Center advertiser account |
| Reddit Ads | **micro** | ads account with API access |
| Pinterest Ads | **micro** | business account, standard access after review |
| Snapchat Ads | **micro** | an organisation-scoped app |
| X Ads | **micro** | an OAuth 1.0a signing endpoint you run — see below |
| Google Ads | **micro** | developer token, and a campaign budget resource created first |
| Microsoft Advertising | major | a SOAP bridge you run — see below |
| Amazon Ads | major | a reporting endpoint you run — see below |

Units are declared per network and never inferred. Reading micro as major understates spend a
millionfold; as minor, ten-thousandfold. Both errors point the same way — you believe you have
spent almost nothing while the platform bills in full.

A second trap worth knowing before you configure a non-Western ad account: **a "minor unit" is
not always a hundredth.** Yen and won have none; Kuwaiti and Bahraini dinar have three. The
conversion knows this. Code that hardcodes 100 does not.

### Three networks need something from your side, and we will not pretend otherwise

- **X Ads** requires OAuth 1.0a request signing on every call. A declaration cannot sign
  requests. Supply a small service holding your X credentials that signs and forwards, and X
  is declared against it; supply nothing and it is not declared at all.
- **Microsoft Advertising** speaks SOAP. A declaration describes a JSON request and cannot
  build a SOAP envelope.
- **Amazon Ads** can create campaigns over REST, but spend cannot be read synchronously —
  reporting is a job you request, poll and download. The engine refuses to register any
  network whose spend it cannot read, and that rule is not bent for a large network.

Each of the three declares only against an endpoint you run, and throws with the real reason
otherwise. Listing a network that cannot report spend would make this product a liar at the
moment it matters most.

### Declaring your own network

Anything not in the table above — a regional network, a retail media platform, an exchange —
is a declaration, the same as a social platform:

```js
import { declareAdPlatform } from '@signalboost/marketing-sales';

declareAdPlatform({ /* create, read spend, pause */ });
```

A declaration is **refused** unless it can describe how to read spend **and** how to pause,
and `spendUnits` must be stated explicitly as `minor`, `major` or `micro`. Both refusals exist
because the alternative is a campaign that spends money you cannot see or stop.

### The control surface

Everything that can spend goes through one admin-gated endpoint, and nothing else in the
application calls the start path. Access tokens are read from the environment, never accepted
from a request — an endpoint taking a token in its body would let anyone who reached it spend
on any account they held a token for.

The cockpit at `/dashboard/ads` shows the state a buyer actually needs: which networks are
declared versus **ready** (with the exact environment variable a missing one wants), account
ceilings, and every campaign with its authorised cap beside the spend the network reported.
Budgets are typed in major units and converted before they leave the browser. The create
button stays disabled until the request would pass the gate, so the interface cannot attempt
what the engine would refuse.

## 8. What this portable does not do

Stated plainly so it is not discovered in production:

- **No scheduling.** It publishes when told to.
- **No content generation.** It drafts outreach copy; it does not write your campaign.
- **No reach or engagement guarantees.** Nobody can offer those honestly.
- **No platform approvals on your behalf.** OAuth apps, business verification and review
  queues are yours.
- **It never reports a post as published without platform confirmation**, which occasionally
  means it reports less than a competitor would.
- **It does not start an ad campaign for you.** Every campaign is created paused on every
  network; a person turns it on in the ad account.
- **It does not fund anything.** The ad account, the permissions and the money are yours.
- **It does not sign OAuth 1.0a requests, speak SOAP, or run asynchronous report jobs.** X,
  Microsoft and Amazon each need a small endpoint on your side, and are not declared without
  one.

---

## 9. Verifying your install

Run these before you trust it with a live list.

1. **Boundary.** Grep the installed package for your vendor's name and for ours. Both should
   return nothing.
2. **Refusals.** Declare a social platform with no `idPath`, `idHeader` or `urlPath`; it must
   be refused by name. Declare an ad network with no pause URL; same.
3. **The gate.** Create a draft and confirm no message leaves before approval. There is no
   flag to bypass it, so a send that happens anyway is a defect worth a support call.
4. **Caps.** Submit an ad campaign with no cap and one above your ceiling. Both must be
   refused before the provider is contacted.
5. **Confirmation.** Publish one real post to the cheapest platform you have and confirm the
   stored record carries the platform's own id or URL.
6. **The ledger.** Start a campaign, then read the row before touching the network again: it
   must carry the cap, both approvers, and a paused state. Delete nothing — the table is the
   authorisation record.
7. **Units.** Reconcile one real campaign on a micro-reporting network and compare the stored
   raw figure against the ad account's own number. This is the single check most worth doing
   before you raise a ceiling.

---

## 10. Operating notes

- **Google OAuth consent screens must be In production.** In Testing, refresh tokens expire
  after exactly seven days and publishing stops with `invalid_grant`. This has bitten a real
  deployment.
- **A LinkedIn app requires a LinkedIn Page**, even one that only posts to a personal profile,
  and the Page cannot be a member profile page. Creating the Page requires an established
  personal profile — roughly five connections, an account older than seven days, and an email
  on a domain matching the company website. The Page itself does not need to be verified, and
  the two products you need (Share on LinkedIn, Sign In with LinkedIn using OpenID Connect)
  enable immediately with no review. Company-page posting is a longer road: Page verification
  plus Community Management review, measured in weeks.
- **YouTube is the only same-day platform.** Any Google account, no entity, no review. Start
  there when proving the install.
