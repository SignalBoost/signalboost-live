> **Read with [ONBOARD.md](../ONBOARD.md)** — repo operating doctrine & documentation
> index (§12D). This is the design for the Press & Media portable's provider-adapter
> framework; build against this contract, not ad hoc.

# Press & Media Portable — Provider-Adapter Design

## 1. Vision
**One governed engine; every channel is a plugged-in provider.** Free press, PR wires,
ad platforms, print/broadcast — each is an *adapter* behind the same workflow. A buyer
(SignalBoost, or a 500-company enterprise) **connects their own provider accounts** and
the engine drives them. BYO-provider, plug-and-play, per the onboarding doctrine
(ONBOARD §12C). SignalBoost runs it on **free** providers (no resources needed); a
resourced buyer flips on **paid** ones — same engine, no code change.

**Plug-and-play principle:** a new provider = a config/adapter that implements the
contract below. The engine, approval queue, spend gate, and notify **never change**.
That is what lets hundreds of companies connect their own media providers without anyone
touching the core.

## 2. The shared workflow (channel-agnostic)
```
brief → AI generates the ad/release to the channel's spec → OWNER APPROVAL
      → (SPEND GATE if paid) → dispatch via provider adapter
      → provider-shaped PROOF → two-stage NOTIFY (owner emailed)
```
Only the **dispatch** and **proof** shapes differ per provider; everything else is shared.

## 3. The adapter contract (every provider implements this)
```ts
type ProviderType = 'free_submission' | 'pr_wire' | 'media_database' | 'ad_platform' | 'direct_io'
type CostModel    = 'free' | 'per_release' | 'budget' | 'insertion_order'
type ProofType    = 'maybe_url' | 'distribution_report' | 'ad_report' | 'tearsheet' | 'none'
type DispatchState= 'submitted' | 'scheduled' | 'published' | 'rejected' | 'failed'

interface MediaProviderAdapter {
  describe(): { id: string; label: string; type: ProviderType; cost: CostModel; proof: ProofType; needs: string[] }
  connect(config): Promise<{ ok: boolean; error?: string }>          // 3-path onboarding (API key / OAuth / manual)
  generate(brief, spec): Promise<{ creative: string }>               // AI drafts to the channel spec (shared core)
  validateTarget(target): Promise<{ ok: boolean; reason?: string }>  // real editor/form for free; booking params for paid
  estimateCost(campaign): Promise<{ amount: number; currency: string }> // feeds the spend gate
  dispatch(campaign): Promise<{ state: DispatchState; ref: string }> // submit / publish / book
  fetchProof(ref): Promise<{ proofType: ProofType; payload: unknown; pending: boolean }> // may be async/polled
}
```
The engine calls these; it never knows or cares *which* provider it is talking to.

## 4. The five adapter types (build the TYPE; brands are config)
| Type | Real-world providers | Cost | Onboarding | Proof |
|---|---|---|---|---|
| **free_submission** *(reference)* | HARO/Connectively, direct submit forms, free community/trade press | free | none / manual | maybe-URL |
| **pr_wire** | Business Wire, PR Newswire, GlobeNewswire, EIN Presswire, PRWeb | per release | API key | distribution report |
| **media_database** | Cision, Muck Rack, Meltwater, Prowly, Agility PR | subscription | API key | (feeds `validateTarget` with verified contacts) |
| **ad_platform** | Google Ads, LinkedIn Ads, Meta Ads, Taboola, Outbrain | budget | OAuth + budget | real-time ad report |
| **direct_io** | publisher ad-sales / media-buying agency (print, IT magazine, TV, radio) | insertion order | manual | tearsheet / affidavit |

A big buyer typically already owns **Cision + Business Wire + Google/LinkedIn Ads** — they
just connect the ones they have; each slots into one of these five types.

## 5. Free press = the reference adapter (build first)
`free_submission` implements the **full contract at zero cost**, proving the whole loop
(generate → approve → dispatch → proof-if-published) with no billing and no external
review. Its implementation *is* the contract every paid adapter then follows — adding
Business Wire becomes "implement five methods," not "start over."

## 6. Governed pieces (shared, reuse what exists)
- **AI ad-generation** — reuse the existing generator plumbing; the adapter supplies the channel `spec`.
- **Provider registry + 3-path onboarding** — API / manual / browser-agent (ONBOARD §12C), same as the Social Connector.
- **Owner approval queue** — reuse the Press Outreach Studio's pending queue.
- **Spend gate** — free bypasses; anything with cost hits **owner budget-approval** (approval-gated-spending doctrine). `estimateCost` + a budget ceiling.
- **Two-stage notify** — email **"submitted/scheduled to X"** immediately, and **"published at [URL / report / tearsheet]"** only when the provider confirms. **Never fabricate an instant URL** (the confabulation trap we just closed).

## 7. Data model (extends the existing `press_campaigns`)
Already present: `automation_mode` (free vs paid), `media_target_type`, `status`, owner-approval flow.
Add: `provider_id`, `provider_type`, `cost_estimate`, `spend_approved_at`, `dispatch_ref`,
`dispatch_state`, `proof_type`, `proof_payload`, `scheduled_at`. (Design only — not built yet.)

## 8. Honest constraints (bake in from day one)
- **Proof is provider-shaped** — no universal instant URL. Free = maybe-URL; wire = report; ad platform = real-time report; print = tearsheet weeks later.
- **Paid = BYO money** — real billing lives on the buyer's provider account; the portable never fronts spend.
- **Real targets only** — discovery must return *verified* outlets (real editor email or submit form); never invent a publication (existing doctrine).
- **Some types are inherently manual** — print/TV/radio are insertion-order workflows; the adapter models the workflow + tearsheet state, not an API.

## 9. Build order
1. **Adapter contract + provider registry** (the framework).
2. **`free_submission` reference adapter** + AI-gen + approval + two-stage notify (zero cost, proves the loop).
3. **`pr_wire` adapter** (first paid; best "report back" fit).
4. **`ad_platform` adapter** (most automatable paid).
5. **`direct_io` adapter** (print/TV/radio, IO + tearsheet).
6. **`media_database` adapter** (verified-contact discovery, feeds the others).

## 10. Where it lives
A dedicated **Press & Media** portable (or a module of Marketing + Sales), catalogued in
`docs/portables/README.md` and indexed from ONBOARD §12D like every other portable.
