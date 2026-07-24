# COS Portable — Host Integration Guide

**What this is.** The Chief-of-Staff / COSA engine is designed to drop into a buyer's
own stack. Every stateful or external dependency it touches is reached through an
**injected interface (port)**, never a hardcoded SDK, endpoint, or credential. The buyer
brings the infrastructure; the engine brings the behavior and asks the ports.

On SignalBoost's own deployment, each port has a default adapter (Supabase / the platform
model router) and behavior is unchanged. A buyer supplies their own adapter for each port
and the engine code never changes.

---

## The ports a buyer implements

| Port | File | Replaces | Buyer supplies |
|---|---|---|---|
| `CampaignQueueStore` | `lib/cos/campaign-queue/store.ts` | Direct `cos_campaign_queue` reads/writes | An adapter over their datastore (`getById` / `getMetadata` / `update`) |
| `MiningStore` | `lib/cos/mining/storage.ts` | Direct analytics-table access | An adapter over their store (already backend-switchable via `COS_MINING_BACKEND`) |
| `DecisionLogStore` | `lib/ai/cos/decisionStore.ts` | The COS decision/audit trail | An adapter that writes decisions to **their** datastore / SIEM |
| `ObjectStorePort` | `lib/cos/objectStore.ts` | Supabase Storage buckets | An adapter over their object store — S3, Azure Blob, GCS (`put` / `signedUrl` / `ensureContainer`) |
| `CosAiPort` | `lib/cos/aiPort.ts` | The platform model router + platform keys | Text generation via **their** model provider (Azure OpenAI, Bedrock, private gateway) |
| `CosImagePort` | `lib/cos/aiPort.ts` | Direct OpenAI image call + platform key | Image generation via their image model |
| Company facts | `lib/portable/companyIdentity.ts` (kernel: `portable-kernel`) | The platform's organization record | Their company record, so generated content speaks for **their** business |
| `CosBackupRuntimeConfig` (`loadBrain`/`reasoner`/`log`) | `lib/cos-backup/runtime.ts` (contract in `cos-backup-core`) | The local `cos-core/brain.md` snapshot + OpenAI + `cos_decisions` table | Their own approved continuity playbook, model provider, and audit store for Backup COS |

Each engine entry point accepts its port as an argument that **defaults to SignalBoost's
adapter**. A buyer constructs their adapters once and passes them in from their own host
wiring; nothing in the engine is edited.

---

## Chief-of-Staff assistant tool ports (the chat brain)

The Chief-of-Staff / Concierge **chat brain** (`app/api/support/route.ts`) answers the
operator through a set of AI tools in `lib/ai/tools/`. Every tool that reads business data
or calls an external service reaches it through an injected port with a default SignalBoost
adapter, so a buyer's assistant answers from **their** data and keys. Each tool is a single
self-contained module; a buyer calls one setter at host startup to swap it, and the public
tool functions are unchanged — nothing else in the brain is edited.

| Capability | Port | Setter | Buyer supplies |
|---|---|---|---|
| Long-term user memory | `UserMemoryStore` | `setUserMemoryStore` | An adapter over their datastore for the assistant's per-user memory |
| Conversation history | `ConversationHistoryStore` + `Summarizer` | `setConversationHistoryStore` / `setConversationSummarizer` | Their store for searchable chat history, and their model for the rolling summary |
| Business metrics | `BusinessMetricsStore` | `setBusinessMetricsStore` | An adapter returning their subscriptions/accounts and pipeline counts, so "how is my business doing" answers from **their** numbers |
| Partner / affiliate count | `AffiliateStore` | `setAffiliateStore` | An adapter over their partner catalog |
| Web research | `WebSearchPort` | `setWebSearchPort` | Their search provider and key (the SignalBoost default is Brave via `BRAVE_SEARCH_API_KEY`) |
| Video search | `VideoSearchProvider` | `setVideoSearchProvider` | Their media source (the SignalBoost default is the platform's YouTube + Archive.org search) |

Notes:

- Defaults are unchanged SignalBoost behavior — on the seller's deployment nothing is swapped, and each default only loads its heavy client (Supabase, the search/media SDK) when actually used, so a buyer who swaps a port never bundles the one they replaced.
- All brand text these tools emit resolves through `hostBrandName()`, so a buyer's assistant never speaks the seller's brand.
- `getPricing` needs no port (it is static), and the press-campaign tool already runs entirely through the Press & Media portable host.

---

## Configuration

| Flag | Effect |
|---|---|
| `PORTABLE_BRAND_NAME` | The buyer's brand. When set, it drives all host/employer brand slots. |
| `PORTABLE_BRAND_URL` | The buyer's URL for brand overlays and CTAs. |
| `PORTABLE_SOLD_COPY=true` | Marks a deployment as a **blank sold copy**: before the buyer configures a brand, brand slots show a neutral `[YOUR COMPANY]` / `[YOUR PRODUCT]` placeholder — never the seller's name. |

With none of these set (the seller's own deployment), every default is unchanged.

**Factual grounding.** On a buyer/configured deployment, the live copy generator prepends
the company-facts allow-list and the factual-discipline rules to the model prompt, so the
model writes only from supplied facts and marks any missing fact with a visible
`[PLACEHOLDER]` rather than inventing a brand, product, statistic, or quote.

---

## Batch generation — host-only, by design

The campaign-copy **batch** path uses OpenAI's Batch API (a submit-now / poll-later,
discounted endpoint). That contract is provider-specific and is treated as a
SignalBoost-side cost optimization, **not** part of the portable contract. A buyer's
`CosAiPort` serves the same generation in real time — same output, without the batch
discount. The portable therefore runs anywhere; the batch path is an optimization it
degrades gracefully without.

---

## Honest go-live checklist

Adopting the COS is not a badge flip. To reach a genuine enterprise deployment, a buyer:

- [ ] Implements an adapter for each engine port above against their own stack.
- [ ] Implements an adapter for each **assistant tool port** their Chief-of-Staff chat will use (memory, conversation history, business metrics, partner catalog, web search, video search), or accepts the default where a capability isn't needed.
- [ ] Populates their company record so generation is grounded (else output carries visible placeholders).
- [ ] Sets `PORTABLE_BRAND_NAME` / `PORTABLE_BRAND_URL` (and `PORTABLE_SOLD_COPY` for a blank copy).
- [ ] Provides model access (`CosAiPort` / `CosImagePort`, and the conversation `Summarizer`) with credentials from their own vault.
- [ ] Writes their own host routes / entry points. The platform's API routes are a reference **test rig**, not part of the shipped portable.
- [ ] Runs the build and the test suite in their environment — the real correctness gate.
- [ ] Runs a security review of the model-access and audit adapters (the ports guarantee no engine data path leaves their infrastructure; the review confirms the adapters honor that).

## What is explicitly *not* in the portable

- **Host routes and dashboards.** These are SignalBoost's platform surface (the test rig). A buyer wires their own.
- **The platform's Supabase / Next.js deployment.** That is the development environment, not the product.
- **Batch generation.** Host-only, as above.
- **Operator / code tools.** `repoReader`, `repoWriter`, `i18nSweep`, and `infraPRWriter` drive SignalBoost's *own* source repository and infrastructure PRs using SignalBoost credentials. Per Portable Law #6 (SignalBoost-specific adapters stay outside the portable core) they are reference adapters, **not** part of a buyer copy. A buyer who wants repo/infra autonomy for their own Chief-of-Staff supplies their own adapter behind a versioned contract, and it remains approval-controlled (Law #7 — consequential execution stays gated and audited).

---

*Status: the engine's data, decision-audit, object-storage, and model-access dependencies,
and the assistant chat brain's business-data and external-service tools, are all behind
injected ports as of this writing. "Enterprise-ready" for any given buyer still requires
that buyer's own adapters, company record, host wiring, and a passing build plus security
review in their environment — verified, not assumed.*

## Portable Browser Agent Ecosystem

Browser automation is optional host composition, not a COS engine dependency. A buyer selects one session provider, one agent-loop provider, one policy engine, one credential broker, one approval service, one evidence store, and one telemetry sink; web-data, human-control, and scheduler ports are optional. An integrated platform may implement several ports. Every choice is injected through the portable browser contracts; no browser vendor SDK, credential, route, or production execution ships in the portable.

Buyer-supplied ports are `PortableBrowserSessionPort`, `PortableBrowserAgentLoopPort`, `PortableBrowserCredentialPort`, `PortableBrowserPolicyPort`, `PortableBrowserApprovalPort`, `PortableBrowserEvidencePort`, `PortableBrowserTelemetryPort`, `PortableBrowserWebDataPort`, `PortableBrowserHumanControlPort`, and `PortableBrowserSchedulerPort`.

Browser go-live additions:

- [ ] Choose and implement compatible browser adapters and validate the compatibility matrix.
- [ ] Configure identity and credential isolation, exact origin policies, approval rules, evidence retention, human takeover, replay/incident review, and cost/concurrency limits.
- [ ] Test provider suspension and kill switch behavior.
- [ ] Verify no SignalBoost credentials ship with the portable.

---

## Backup COS continuity (`cos-backup-core` / `cos-backup-host`)

The Concierge entry point (`app/api/concierge/route.ts`) shadows every request through a
read-only Backup COS so a degraded Primary response never reaches the user unnoticed. That
continuity layer now has the same port boundary as the rest of the engine:

- **`cos-backup-core/ports.ts`** — host-agnostic contract: `CosReasoner` (ask a model),
  `DecisionLogSink` (record a recovery/divergence event), and `CosBackupRuntimeConfig`
  (bundles both plus an optional brain loader and timeout). Zero imports, zero platform
  assumptions.
- **`lib/cos-backup/runtime.ts`** — `runBackupCos` / `recordCosRecovery` are unchanged and
  remain the default SignalBoost path (local `cos-core/brain.md`, OpenAI, `cos_decisions`).
  Additive host-agnostic variants `runBackupCosWithConfig` / `recordCosRecoveryWithConfig`
  accept a `CosBackupRuntimeConfig` — pass one in and continuity runs on a buyer's own
  approved playbook, model provider, and audit store with no change to this file.
- **`cos-backup-host/signalboostCosBackupHost.ts`** — the reference SignalBoost binding
  (`createSignalBoostCosBackupConfig()`), showing exactly what a buyer's own version of this
  one file needs to supply.
- **`lib/cos-backup/policy.ts`** and **`lib/cos-backup/index.ts`** (divergence detection,
  advisory-only decision comparison) were already dependency-free and needed no change —
  they are enforced staying that way by `tests/cosBackupIntegrity.node.test.ts`.

One caveat worth knowing before licensing this to a buyer: `cos-core/brain.md` (the approved
playbook snapshot) currently states its own identity line ("COS is SignalBoost's private
Chief of Staff…") and is under its own CODEOWNERS review process — this port change does not
edit that file. A buyer supplying their own `loadBrain()` never inherits that line; a buyer
who instead reuses the SignalBoost binding as-is would need that file's identity line
addressed separately (a governance/content edit, not a code coupling issue).
