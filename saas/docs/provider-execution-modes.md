# Console Hub Provider Execution Modes

Console Hub exposes provider actions only through Provider Hub and the reviewed provider-template capability registry. Provider implementations must not be exposed directly to portable products or customer-facing code.

## Governed modes

### Direct API

Direct API is the only mode that may submit a provider mutation. It continues through the authenticated Hub action routes (`/api/hub/action` or `/api/hub/action/engine`) and preserves the existing validation, permission, confirmation, approval, audit, and verification pipeline.

### Governed AI infrastructure PR

This mode stages an exact, bounded proposal through the dedicated COSA PR staging route. It does not execute the provider or infrastructure mutation. The resulting proposal remains reviewable and requires the normal GitHub and owner approval controls before any separately governed application.

### Browser Agent assistance

This mode creates only a dry-run or browser-task package through the dedicated Browser Agent packaging route. It is available only when the template has a separately reviewed browser adapter ID and approved HTTPS origin.

Production/provider browser execution is not enabled by this mode. Owner approval, Browser Runtime approval, checkpoint approvals, target and payload binding, stale-session rejection, redacted evidence, audit logging, and deterministic verification remain separate mandatory controls.

Playwright is an internal CI, browser-verification, and future Browser Runtime implementation tool. It is not a customer feature and must not be exposed as a provider execution option.

### Direct configuration

Direct configuration is the non-automated reliability floor. It renders bounded, copyable, redacted operator instructions and does not call a provider API, create a pull request, or launch a browser.

## Capability and selection rules

Each provider template declares reviewed supported modes and one preferred mode. Unsupported or unreviewed modes are hidden rather than displayed as disabled placeholders.

The default governed preference order is:

`Direct API → Governed AI infrastructure PR → reviewed Browser Agent assistance → Direct configuration`

Legacy templates remain backward compatible with conservative Direct API and Direct configuration behavior, subject to the reviewed capability gate. Browser Agent is never inferred merely because a provider has a website.

## Preview and result contract

Before submission, the governed preview identifies:

- template ID;
- provider abstraction;
- selected mode;
- exact target;
- bounded and redacted payload;
- approval requirement;
- expected deterministic verification;
- whether the selected route can mutate provider state.

Terminal results identify the mode actually used and provide a redacted audit record. Literal credentials, tokens, cookies, authorization headers, secret-bearing URLs, raw page HTML, and unredacted screenshots are rejected or redacted.

## Portable and Provider Hub boundary

Every portable routes provider access through Provider Hub. Portables must not call OpenAI, Anthropic, Google, Stripe, or any other provider directly. Provider Hub is the single provider abstraction and preserves tenant isolation, buyer-owned credentials and spend, white-label deployment, reviewed capabilities, approval boundaries, auditability, and manual reliability fallback.

## Localization

Customer-facing execution-mode labels must remain available and audited in English, Spanish, Portuguese, Polish, and Russian. Internal contract identifiers remain stable and untranslated.

## Safety status

The four-mode routing, capability discovery, preview, governed staging, Browser Agent dry-run packaging, Direct configuration no-request behavior, reviewed execution selector, client planner, and legacy Provider Action form handoff were implemented through the bounded PR series associated with Issue #586.

This documentation does not enable new provider mutations, production browser execution, credential exposure, automatic infrastructure application, or approval bypass.