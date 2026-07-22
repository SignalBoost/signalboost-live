Order is deliberate. Cost is known before money moves; money is reserved before
the provider is called; the provider is called before storage is touched. A
failure anywhere after reservation refunds the reservation.

## Contracts

A host satisfies `RenderHost`:

```ts
interface RenderHost {
  wallet: WalletAdapter                                  // reserve / refund
  storage: StorageAdapter                                // persist → { url }
  log: RenderLogAdapter                                  // structured events
  resolvePlatformKey(providerId: string): string | null  // platform-funded key
}
```

A provider satisfies `RenderExecutor`:

```ts
interface RenderExecutor {
  providerId: string
  kind: 'voice' | 'video' | 'image'
  estimateCostCents(input: RenderInput): number
  produce(input: RenderInput, apiKey: string): Promise<RenderProduced>
}
```

Adding a provider is adding one executor and importing it. Nothing else changes.

## Funding modes

**`{ mode: 'wallet' }`** — platform key, user's credits. `resolvePlatformKey`
supplies the key; `WalletAdapter.reserve` holds credits before production and
refunds on failure.

**`{ mode: 'byok', apiKey }`** — the user's own key, the user's own provider bill.
No credit reservation, no platform spend, and the paid-provider approval gate does
not apply because the platform is not spending anything (ONBOARD §12B).

## The paid-provider approval gate

```ts
if (funding.mode === 'wallet' && providerCostCents > 0 && !input.paidProviderApprovalId) {
  return { ok: false, code: 'approval_required', ... }
}
```

This is the cost-control gate added 2026-07-16: platform money cannot leave without
a server-side approval reference. It fires **before** reservation and before the
provider call, so a blocked render costs nothing.

> **KNOWN DEFECT — the credits path is currently unusable.**
> No production code supplies `paidProviderApprovalId`; it appears only in
> `saas/tests/renderCore.node.test.ts`. Since any non-empty text costs at least one
> cent, **every** wallet-funded render returns `approval_required`. Only BYOK works.
> `/api/agency/render/voice` compounds this by not mapping `approval_required` in
> its status switch, so the gate surfaces as HTTP **502** — a governance stop
> reported as a provider failure.
>
> The gate is right; the issuer is missing. Resolving it is an owner decision:
> either mint an approval reference server-side once the wallet reservation
> succeeds (treating the credit hold as the payment confirmation, which restores
> self-serve), or keep credits disabled and make the UI BYOK-only with honest
> copy. Do not "fix" this by removing the gate.

## Result codes

| Code | Meaning | Money moved |
| --- | --- | --- |
| `no_executor` | No provider registered for that id | No |
| `approval_required` | Wallet-funded paid render without approval reference | No |
| `no_key` | No platform key, or BYOK key missing | No |
| `insufficient_funds` | Wallet reservation refused | No |
| `daily_cap` | Per-user daily limit reached | No |
| `provider_failed` | Provider call or persistence failed | Reserved, then refunded |
| `error` | Reservation error | No |

`charged: true` means a reservation succeeded — not that settlement is final.

## SignalBoost host implementation

`saas/render-host/signalboostHost.ts`:

- **Wallet** → `chargeForRender` / `refundRender` (`lib/credits/renderCredits`),
  mapping `insufficient_credits` → `insufficient_funds` and `daily_cap` through.
- **Storage** → the COSA render bucket, object path
  `renders/{providerId}/{kind}/{timestamp}.{ext}`, returning a **7-day signed URL**.
- **Keys** → `ELEVENLABS_API_KEY` for `elevenlabs`; every other provider returns
  null, so an unconfigured provider fails at `no_key` rather than silently.

## Providers today

Exactly one: **ElevenLabs voice** (`render-core/executors/elevenlabs-voice.ts`).
`eleven_multilingual_v2` by default, cost `ceil(chars / 1000 × ELEVENLABS_CENTS_PER_1K_CHARS)`
(default 18). `RenderKind` declares `video` and `image`, but **no video or image
executor exists** — those are contract surface, not capability.

## Integration points

| Surface | Notes |
| --- | --- |
| `POST /api/agency/render/voice` | Auth required; 5000-char limit; `useByok` selects funding |
| `saas/components/agency/VoiceStudio.tsx` | The `/agency` UI trigger |

Executors register by **import side-effect**. The route's
`import '@/render-core/executors/elevenlabs-voice'` is load-bearing — remove it as
an unused import and every render fails `no_executor`. Any new entry point must
import the executors it intends to use.

## Environment

| Variable | Required for | Notes |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | Wallet-funded voice | Backend only. Never exposed. |
| `ELEVENLABS_CENTS_PER_1K_CHARS` | Cost estimation | Defaults to `18` |

BYOK keys live per-user in `user_provider_keys`, AES-256-GCM via `lib/vault/crypto`,
service-role access only (ONBOARD §12B).

## Buyer extraction

1. Copy `render-core/`. Do not modify it.
2. Implement `WalletAdapter` (or a no-op for BYOK-only), `StorageAdapter`, and
   `resolvePlatformKey`.
3. Import the executors you want.
4. Call `runRender(host, actor, input, funding)`.

Costs are yours. The module never fronts provider spend for a buyer.

## Known limitations

- The credits path is blocked by the missing approval issuer (above).
- Storage URLs are signed for 7 days. Anything needing a durable reference must
  keep the object path, not the URL — the COSA video pipeline already prefers
  `metadata.video.brandDebug.objectPath` for exactly this reason (ONBOARD §4).
- A failing refund is swallowed (`catch { }`), so a provider failure plus a refund
  failure leaves a user charged for nothing produced. It is logged, not reconciled.
- The executor registry is module-global and mutable; two executors sharing a
  `providerId` silently overwrite.
- Cost is an estimate. Actual provider billing is not reconciled against it.

## Tests

```bash
node --test tests/renderCore.node.test.ts tests/renderCredits.node.test.ts
```

Covers reserve-before-produce ordering, the approval gate blocking before any
spend, insufficient funds never reaching the provider, BYOK skipping reservation,
refund on provider failure, and unknown-provider handling.
