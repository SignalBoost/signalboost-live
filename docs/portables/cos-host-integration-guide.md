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

Each engine entry point accepts its port as an argument that **defaults to SignalBoost's
adapter**. A buyer constructs their adapters once and passes them in from their own host
wiring; nothing in the engine is edited.

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

- [ ] Implements an adapter for each port above against their own stack.
- [ ] Populates their company record so generation is grounded (else output carries visible placeholders).
- [ ] Sets `PORTABLE_BRAND_NAME` / `PORTABLE_BRAND_URL` (and `PORTABLE_SOLD_COPY` for a blank copy).
- [ ] Provides model access (`CosAiPort` / `CosImagePort`) with credentials from their own vault.
- [ ] Writes their own host routes / entry points. The platform's API routes are a reference **test rig**, not part of the shipped portable.
- [ ] Runs the build and the test suite in their environment — the real correctness gate.
- [ ] Runs a security review of the model-access and audit adapters (the ports guarantee no engine data path leaves their infrastructure; the review confirms the adapters honor that).

## What is explicitly *not* in the portable

- **Host routes and dashboards.** These are SignalBoost's platform surface (the test rig). A buyer wires their own.
- **The platform's Supabase / Next.js deployment.** That is the development environment, not the product.
- **Batch generation.** Host-only, as above.

---

*Status: the engine's data, decision-audit, object-storage, and model-access dependencies
are all behind injected ports as of this writing. "Enterprise-ready" for any given buyer
still requires that buyer's own adapters, company record, host wiring, and a passing build
plus security review in their environment — verified, not assumed.*
