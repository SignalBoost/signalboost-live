// saas/render-core/siem-log.ts
//
// Reference adapter: ship the render module's audit events to a buyer's SIEM through
// the shared portable-audit primitive, with ZERO change to the render engine. The
// engine already emits through an injected RenderLogAdapter (see types.ts / engine.ts:
// render.approval_required, render.approval_issued, render.reserve_failed, render.ok,
// render.provider_failed) — every one a money/authorization event a SOC must audit.
//
// Host-agnostic: RenderLogAdapter is a render-core type and @/portable-audit is a
// zero-dependency peer primitive, so this file names no platform, reads no env, and
// holds no credentials. A buyer's host uses createSiemRenderLog(...) as RenderHost.log.

import type { RenderLogAdapter } from './types'
import {
  createSiemAuditSink,
  type PortableAuditEvent,
  type SiemAuditSinkConfig,
  type SiemSeverity,
} from '@/portable-audit'

const DATASET = 'render'

// Render event → SOC severity. Spending money and issuing an approval are notable;
// a required-but-missing approval or a failed reservation is a warning; a provider
// failure (money reserved, asset not produced) is high.
const SEVERITY: Record<string, SiemSeverity> = {
  'render.ok': 'notice',
  'render.approval_issued': 'notice',
  'render.approval_required': 'warning',
  'render.reserve_failed': 'warning',
  'render.provider_failed': 'high',
}
function severityFor(eventType: string): SiemSeverity {
  return SEVERITY[eventType] ?? 'info'
}

export interface SiemRenderLogOptions {
  // The buyer's SIEM config (transport + format + product/tenant tags). `severityFor`
  // is supplied internally; any on this config is ignored.
  siem: Omit<SiemAuditSinkConfig, 'severityFor'>
  // Optional: also forward to another RenderLogAdapter (e.g. the host's console log).
  delegate?: RenderLogAdapter
}

export function createSiemRenderLog(opts: SiemRenderLogOptions): RenderLogAdapter {
  const sink = createSiemAuditSink({ product: 'Render', ...opts.siem, severityFor })
  let seq = 0
  return {
    // RenderLogAdapter.log is synchronous; the SIEM sink is async. Audit export is
    // therefore fire-and-forget — it never blocks or fails a render (the sink also
    // swallows transport errors by default). The delegate still runs synchronously.
    log(event: string, data: Record<string, unknown>): void {
      const providerId = typeof data?.providerId === 'string' ? data.providerId : undefined
      const ev: PortableAuditEvent = {
        eventId: `rnd_${Date.now()}_${(seq++).toString(36)}`,
        eventType: event,
        occurredAt: new Date().toISOString(),
        dataset: DATASET,
        category: 'process',
        subjectId: providerId,
        payload: data,
      }
      void sink.record(ev)
      opts.delegate?.log(event, data)
    },
  }
}
