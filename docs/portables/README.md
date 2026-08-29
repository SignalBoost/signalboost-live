> **Read with [ONBOARD.md](../../ONBOARD.md)** — repo operating doctrine & documentation
> index (§12D). This is the portables catalog: the list of sellable modules, where each
> one's code and docs live. Per §12D every doc is reachable from ONBOARD and points back.

# Portables Catalog

A **portable** is a sellable capability built to the Portable Module Doctrine
(ONBOARD §12C): a host-agnostic `*-core` holding the contract and logic, and a
`*-host` binding it to one host's services. SignalBoost is the first host — the
platform is the workshop where each module is proven before it is extracted and sold.

Two rules make a module portable rather than merely reusable:

1. **`*-core` imports no host.** No Next.js, no Supabase, no provider SDKs. Host
   services arrive as injected Ports, so the same engine runs on a buyer's platform.
2. **Providers are plugged in, not hard-coded.** A buyer connects their own accounts
   (BYO key / BYO money) through one of the three §12C onboarding paths — AI
   infrastructure-PR, manual, or Browser Agent — with manual always available.

## The modules

| Portable | Code | Documentation |
|---|---|---|
| **Provider Hub (BYOK/BYOI)** — self-service and enterprise provider connection, governance, and reusable capability access | Existing provider settings, provider stores, and Universal Provider Framework; target `provider-hub-core` / `provider-hub-host` extraction | `docs/portables/provider-hub-byok-portable.md`, `saas/docs/provider-integration.md` |
| **Console Hub** — operator console, Key Vault, audit & PR cockpit | `saas/console-core`, `saas/console-host` | `saas/console-core/README.md`, `saas/docs/console/*`, `saas/lib/infra-pr/README.md` |
| **Integrations / Social Outreach Connector** — BYO-provider publishing across seven social platforms | `saas/lib/outreach`, `saas/lib/publish-core.ts` | `saas/docs/enterprise-social-outreach-plug-and-play.md`, `saas/docs/outreach-engine-architecture.md`, `saas/docs/provider-integration.md`, ONBOARD §10A |
| **Marketing + Sales** | `saas/marketing-sales-core`, `saas/marketing-sales-host` | `saas/docs/marketing-sales-module-design.md` |
| **Chief of Staff (COS)** — the owner-side brain | `saas/lib/cos`, `saas/lib/cos/executive-core` | `saas/lib/cos/README.md`, `cos-core/brain.md`, `docs/cos-recognition-and-lifeline.md` |
| **Browser Agent** — assisted setup that drives a provider's own screens | `docs/browser-provider-sdk.md` (SDK) | GAP: compliance/legal doc not yet written |
| **Render Module** — voiceover and render pipeline | `saas/render-core`, `saas/render-host` | No dedicated doc yet; see the code |
| **Campaign Studio (BYOK)** — one-prompt campaign generation on the user's own AI keys | `saas/lib/agency`, `saas/app/agency` | `saas/docs/user-guide.md`, `saas/docs/developer-guide.md`, ONBOARD §12B |
| **Press & Media** — one governed press engine, every channel a plugged-in provider | `saas/press-media-core`, `saas/press-media-host` | `press-media-portable-design.md` (this folder), ONBOARD §12D |

Provider Hub is intentionally available in two modes: authenticated self-service access for SignalBoost users and separately licensed enterprise/white-label deployment for organizations. The current public preview may reuse Campaign Studio's BYOK route until a dedicated self-service Provider Hub route is complete.

## Press & Media at a glance

The newest portable, and the clearest illustration of the pattern:

- **One contract** (`MediaProviderAdapter`) and a registry. Five provider *types*
  — free submission, PR wire, media database, ad platform, direct insertion order —
  each a single adapter file.
- **Brands are configuration.** Adding Business Wire beside EIN Presswire is a
  `provider_registry` row (endpoint, headers, payload template, rate), not code.
- **BYO money.** Paid providers run on the buyer's own account; the buyer's API key is
  vault-encrypted and resolved by `vault://` reference at call time. The platform never
  fronts spend, and paid dispatch holds for owner budget approval.
- **Proof is provider-shaped.** A maybe-URL, a distribution report, an ad report, or a
  tearsheet weeks later — never an invented "published" link.

## Adding a portable to this catalog

1. Build it as `*-core` / `*-host` and prove it on SignalBoost behind the core boundary.
2. Write its design/compliance doc in this folder (or `saas/docs/`) with a
   **Read with ONBOARD.md** header pointing back.
3. Add it to the table above **and** to ONBOARD §12D's documentation map — both
   directions, per the §12D cross-reference rule.

## Specialist agents

The product roadmap for optional portable-specific agents is documented in
`docs/architecture/PORTABLE-SPECIALIST-AGENT-ROADMAP.md`. A specialist is a bounded
worker governed by COS; it is not a second COS brain or an automatic grant of execution
authority.
