// saas/lib/concierge/deliveredVisual.ts
//
// A chart or image COS delivers with an answer is part of that answer. The live response carries
// it as `visual.previewUrl`; History stores only text unless the visual is recorded with the turn.
// Production 2026-10-16: COS charted VNCE, but the Concierge showed the answer from History (and
// reopened chats always come from History), so the chart was missing.
//
// The visual is recorded in the assistant message's provenance under `delivered_visual` (the same
// record that already carries `suggested_followups`) and read back by History recovery and resume.
// Only an inline image data URL or an owner-scoped Builder preview path is accepted.

const DATA_URL_RE = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i
const OWNER_SCOPED_PREVIEW_RE = /^\/api\/builder\/workspaces\/[0-9a-f-]+\/files\/.+\?preview=1$/i
const FILENAME_RE = /^[a-z0-9._-]{1,120}$/i
/** Inline charts are a few hundred KB; anything near this cap is not a chart we produced. */
export const MAX_DELIVERED_VISUAL_URL_CHARS = 4_000_000

export type DeliveredVisual = { previewUrl: string; filename: string }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function safeDeliveredVisual(value: unknown): DeliveredVisual | null {
  const visual = record(value)
  const previewUrl = typeof visual?.previewUrl === 'string' ? visual.previewUrl : ''
  const accepted = OWNER_SCOPED_PREVIEW_RE.test(previewUrl)
    || (previewUrl.length <= MAX_DELIVERED_VISUAL_URL_CHARS && DATA_URL_RE.test(previewUrl))
  if (!accepted) return null
  const filename = typeof visual?.filename === 'string' && FILENAME_RE.test(visual.filename) ? visual.filename : 'visual.png'
  return { previewUrl, filename }
}

/** Provenance to store with the turn: the original record plus the visual the user received. */
export function provenanceWithDeliveredVisual(provenance: unknown, visual: unknown): unknown {
  const delivered = safeDeliveredVisual(visual)
  if (!delivered) return provenance ?? null
  return { ...(record(provenance) ?? {}), delivered_visual: delivered }
}

/** The visual recorded with a stored assistant message, if any. */
export function deliveredVisualFromProvenance(provenance: unknown): DeliveredVisual | null {
  return safeDeliveredVisual(record(provenance)?.delivered_visual)
}
