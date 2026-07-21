// saas/press-media-core/types.ts
// Press & Media portable — host-agnostic contract. NO Next.js / Supabase / provider-SDK
// imports here: adapters receive host services via injected Ports, so the same engine
// runs on any host and a buyer can plug in their own providers.
// Design: docs/portables/press-media-portable-design.md

export type ProviderType = 'free_submission' | 'pr_wire' | 'media_database' | 'ad_platform' | 'direct_io'
export type CostModel = 'free' | 'per_release' | 'budget' | 'insertion_order'
export type ProofType = 'maybe_url' | 'distribution_report' | 'ad_report' | 'tearsheet' | 'none'
export type DispatchState = 'submitted' | 'scheduled' | 'published' | 'rejected' | 'failed'
export type MediaTargetType = 'digital_press' | 'newspaper_print' | 'magazine_print' | 'trade_press' | 'broadcast'

export interface ProviderDescriptor {
  id: string
  label: string
  type: ProviderType
  cost: CostModel
  proof: ProofType
  needs: string[]                    // what the buyer must supply to connect, e.g. ['editor_email'] | ['api_key'] | ['oauth','budget']
  supportsTargets: MediaTargetType[]
}

export interface CampaignBrief {
  goal: string                       // e.g. "promote the platform's products to free IT magazines"
  audience?: string
  ctaUrl?: string
  language?: string
}

export interface MediaTarget {
  mediaTargetType: MediaTargetType
  publicationName?: string
  editorEmail?: string
  submitFormUrl?: string
  [k: string]: unknown
}

export interface GenerateSpec {
  format: 'press_release' | 'display_ad' | 'native_article' | 'classified'
  maxChars?: number
  tone?: string
  notes?: string
}

export interface MediaCampaign {
  id: string
  providerId: string
  target: MediaTarget
  creative: string                   // the AI-generated ad / release
  brief: CampaignBrief
  metadata?: Record<string, unknown>
}

export interface ConnectResult { ok: boolean; error?: string }
export interface TargetCheck { ok: boolean; reason?: string }
export interface CostEstimate { amount: number; currency: string }
export interface DispatchResult { state: DispatchState; ref: string; detail?: string }
export interface ProofResult { proofType: ProofType; payload: unknown; pending: boolean }

// ── Injected host services (Ports). Adapters depend on these, never on concrete SDKs. ──
export interface AiPort {
  generate(brief: CampaignBrief, spec: GenerateSpec): Promise<{ creative: string }>
}
export interface EmailPort {
  send(input: { to: string; subject: string; html: string }): Promise<{ ok: boolean }>
}
export interface OwnerNotifyPort {
  // Two-stage notify: 'submitted'/'scheduled' now, 'published' once the provider confirms.
  notifyOwner(stage: DispatchState, campaign: MediaCampaign, proof?: ProofResult): Promise<void>
}
export interface HttpPort {
  fetchJson(url: string, init?: unknown): Promise<unknown>   // for wire / ad-platform API adapters
}
// Config-driven provider execution. The host wraps the platform's canonical universal runner
// (provider_registry rows + secret resolution), so a paid adapter never hand-rolls HTTP or
// touches a key — it names a registered action and the host runs it. Adding a wire brand is a
// provider_registry row, not code. `action` is a provider_registry action_id.
export interface RunnerResult { ok: boolean; status: number; outputs: Record<string, unknown>; ref?: string; error?: string }
export interface RunnerProviderConfig { connected: boolean; priceCents: number; currency: string }
export interface RunnerPort {
  run(providerId: string, action: string, variables: Record<string, unknown>): Promise<RunnerResult>
  loadConfig(providerId: string): Promise<RunnerProviderConfig | null>
}
export interface PortBundle {
  ai: AiPort
  email: EmailPort
  notify: OwnerNotifyPort
  http?: HttpPort
  runner?: RunnerPort                // config-driven execution for paid providers (universal runner)
  config?: Record<string, string>    // the buyer's connected credentials for this provider
}

// ── The contract EVERY provider implements. The engine calls these and never knows
//    which provider it is talking to — that is what makes new providers plug-and-play. ──
export interface MediaProviderAdapter {
  describe(): ProviderDescriptor
  connect(config: Record<string, string>, ports: PortBundle): Promise<ConnectResult>
  generate(brief: CampaignBrief, ports: PortBundle): Promise<{ creative: string }>
  validateTarget(target: MediaTarget, ports: PortBundle): Promise<TargetCheck>
  estimateCost(campaign: MediaCampaign, ports: PortBundle): Promise<CostEstimate>
  dispatch(campaign: MediaCampaign, ports: PortBundle): Promise<DispatchResult>
  fetchProof(ref: string, ports: PortBundle): Promise<ProofResult>
}
