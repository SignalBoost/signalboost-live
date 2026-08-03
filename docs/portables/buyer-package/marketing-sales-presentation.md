<!-- docs/portables/buyer-package/marketing-sales-presentation.md -->

# Marketing + Sales Engine Software — Buyer Evaluation

**Find prospects, write to them in their language, publish to eight social platforms and buy
paid placement on ten ad networks — all from your own infrastructure, on your own accounts,
with your own credentials and your own money under your own caps.**

*Prepared by SignalBoost · technical evaluation material · not an offer or production commitment*

> **Before sending this document, fill in:** [SET price], [SET pilot length], [SET pilot fee],
> and the contact line in section 11.

---

## 1. The problem

Marketing tooling arrives in three pieces that never quite meet. An outreach tool holds your
prospect list. A publishing tool holds your tokens. An ads dashboard holds your budget. Each
is a service, so your prospects, your access tokens and your spending authority all live on
servers you neither run nor audit — and the seams between them are where a campaign quietly
goes wrong.

Building it yourself is worse. Every social platform has its own OAuth dance, its own upload
protocol and its own idea of what "published" means. Every ad network has its own currency
units, its own approval regime, and its own way of telling you what you spent — if it tells
you at all.

This portable answers one question with evidence:

> Can a team run outreach, publishing and paid placement from their own environment, with a
> human approving every message and a cap on every dollar, without a vendor holding any of it?

## 2. What it is

One installable package, **zero third-party dependencies**, no network calls except to the
platform or network you connected.

```text
a prospect found on their own published site
→ a message drafted in their language
→ a human approval, always
→ your email provider, your social accounts, your ad accounts
→ what the platform actually confirmed
→ your audit trail and your spend ledger
```

The vendor operates nothing in that path and receives nothing from it.

**The Social Outreach Connector is included.** It is a named capability of this product, not a
second purchase — the same publishing engine, sold separately only for buyers who already have
a system upstream deciding what to publish.

## 3. The three rules the design turns on

**A message never sends without a named human approving it.** There is no parameter that skips
the gate, because a supported way to skip it would be a supported way to defeat the product.

**A post is reported as published only when the platform confirms it.** No optimistic success
anywhere. If a provider returns no id and no URL, the result is a failure carrying the
provider's own reason — nothing downstream can claim a post that does not exist.

**No ad spends without a cap and a named spend approver, and both are recorded.** Approving
copy is not approving a budget, and the person who does one is usually not the person who does
the other.

## 4. Email outreach

Regional discovery across eleven countries, searching in the target's own language. Drafting
in five languages, chosen from the target rather than from your interface — a US prospect gets
English while your console is in Portuguese, and that is correct.

The decision that matters most is a refusal: **it finds published addresses only.** Where no
published address exists it records the prospect and skips it. It does not construct
`firstname.lastname@company.com` and hope. That single choice is most of the difference
between this and a scraper.

Duplicate protection is scoped to the *product*, not the address, so the same company can be
approached about a different offer but never twice about the same one. A prospect list is an
asset you reuse; burning an address after one campaign is the wrong trade.

Every approved message passes through one chokepoint that attaches the signature, the physical
address and the unsubscribe link. There is no second send path.

## 5. Social publishing

Eight connectors — YouTube, TikTok, Instagram, LinkedIn Profile, LinkedIn Company, Facebook,
X, Reddit — with OAuth, token refresh, destination discovery, and link or native publishing
with automatic fallback when a platform refuses the native form.

**Plus any platform you declare.** A platform is data, not code: describe where to authorize,
what the publish request looks like and where the post id appears, and it publishes through
the identical path as a built-in one — same confirmation rule, same approval gate. Threads,
Bluesky, Mastodon, Telegram, VK, whatever your market actually uses, with no adapter, no
release and no vendor involvement.

A declaration is refused if it cannot describe how to read the post id back. You can add
reach. You cannot add authority.

### Approvals differ sharply, and you should know before you sign

| Platform | Business entity | Approval |
| --- | --- | --- |
| YouTube | no — any Google account | consent screen in production |
| LinkedIn Profile | a Page to hold the app — unverified is fine | none — self-serve products |
| LinkedIn Company | registered company, verified Page | Community Management review |
| Facebook / Instagram | a Page or Business account | app review |
| TikTok | no | content posting audit |
| X | no | paid API tier |
| Reddit | no | none |

YouTube is the genuinely same-day one. Each platform is independent: an unapproved one reports
"not configured" while the others keep working, so you publish on day one and widen as
approvals land.

## 6. Paid advertising

The same platforms, bought rather than posted, plus the search and marketplace networks.

**Every campaign is created paused, on every network.** The campaign exists, the cap is
registered against it, and a person turns it on. A mistake in a create request therefore costs
nothing.

| Network | Spend reported in | Beyond an ad account, you supply |
| --- | --- | --- |
| Meta | major | `ads_management`, business verification, app review |
| LinkedIn Ads | major | partner-gated access, a campaign group |
| TikTok Business | major | a Business Center advertiser account |
| Reddit Ads | micro | ads account with API access |
| Pinterest Ads | micro | standard access after review |
| Snapchat Ads | micro | an organisation-scoped app |
| X Ads | micro | an OAuth 1.0a signing endpoint you run |
| Google Ads | micro | developer token, a budget resource created first |
| Microsoft Advertising | major | a SOAP bridge you run |
| Amazon Ads | major | a reporting endpoint you run |

Units are declared per network and never inferred, because the error is not a rounding
difference. Reading micro as major understates spend a millionfold — and it fails in the
direction where you believe you have spent nothing while the network bills in full. The
conversion also knows that a "minor unit" is not always a hundredth: yen has none, Kuwaiti
dinar has three.

Three of the ten need a small endpoint on your side, and we state it here rather than during a
pilot: **X** because its API requires request signing a declaration cannot perform,
**Microsoft** because its API is SOAP, and **Amazon** because its spend can only be read from
an asynchronous report job. The engine refuses to register any network whose spend it cannot
read, and that rule was not bent for a large network — a campaign whose spend you cannot see
is precisely what a cap exists to prevent.

Any other network is a declaration, refused unless it can describe how to read spend *and* how
to pause.

### The ledger

A campaign row cannot exist without a cap and both approvers — the row **is** the
authorisation. It is written before the network is contacted, so a create whose response is
lost still leaves a record that the account was asked to spend. Spend observations are
append-only and keep the network's raw figure beside the converted one, so a units error is
provable afterwards instead of arguable.

Reconciliation reads the network. Platforms overdeliver; when the reported figure passes the
cap, the row says so rather than averaging it away.

## 7. What you implement

One interface, and it is the one your security team will ask about.

```ts
setSocialSecretsResolver((name) => yourVault.get(name))
```

Credentials are read through a resolver you install, so they live in AWS Secrets Manager,
Azure Key Vault, HashiCorp Vault or your own service. Install nothing and it reads
`process.env`, which is the right choice for a trial. Ad network tokens are read from the
environment and never accepted from a request.

Everything else is injected. Every function that touches state takes your database client as
its first argument; the layer opens no connection of its own and ships the DDL for the tables
it needs.

## 8. The portability claim, verified rather than asserted

The packager walks the import graph from the public entry point and **fails** if any reachable
file imports a host path, escapes the layer's directories, or pulls in a third-party package.
It then packs a tarball, installs it into a clean directory, and confirms the installed
manifest declares no dependencies.

The same check runs in CI on every change. If a future edit reaches for host infrastructure
the build breaks instead of shipping something that only works on the vendor's deployment.

We test that guard by breaking it deliberately: a host import added to a connector fails the
check by name. A boundary check that stays green when you violate the boundary is measuring
nothing.

## 9. What it does not do

Stated plainly, because a buyer who discovers these after signing is a buyer who was misled.

- **It does not schedule.** Give it an approved message or post and it goes. Timing belongs to
  your queue.
- **It does not generate content.** It drafts outreach copy; it does not write your campaign.
- **It does not guess an email address.** No published address, no send.
- **It does not start ad campaigns.** Every one is created paused.
- **It does not fund anything.** The ad account, the permissions and the money are yours.
- **It does not obtain platform or network approvals.** Reviews, audits, paid tiers and
  partner gates are between you and each platform.
- **It does not guarantee reach, engagement or conversion.** No API sets those.
- **It never reports a post as published without confirmation**, which occasionally means it
  reports less than a competitor would.

## 10. Editions and commercials

| | Standard | Enterprise |
| --- | --- | --- |
| Email outreach | included | included |
| Social publishing | eight platforms, plus any you declare | same |
| Paid advertising | ten networks, plus any you declare | same |
| Credential resolver | environment variables | your vault |
| Deployment | one environment | per production environment |
| Support | business hours | see support terms |
| Price | [SET price] | [SET price] |

**Pilot:** [SET pilot length] at [SET pilot fee], covering installation into one environment,
two social platforms connected end to end, one ad network reconciled against its own account,
and a real approved message sent from your infrastructure.

## 11. Next steps

1. Read the integration guide — it names every interface, table, environment variable and
   platform requirement.
2. Run the boundary check against the source. It takes seconds and proves the claim in
   section 8.
3. Install the tarball in a scratch environment and connect YouTube — same-day, any Google
   account.
4. Send one approved message and publish one real post; confirm the permalink.
5. Set a ceiling on one ad account, create one capped campaign, and reconcile it against the
   network's own reported spend. That comparison is the single check most worth doing before
   you raise a ceiling.

Contact: [SET name, title, email]

---

*Supplied with this document: the integration guide, the built tarball with per-file
checksums, and the DDL for the required tables.*
