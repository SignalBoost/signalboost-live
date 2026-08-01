// saas/press-media-core/discovery.ts
//
// FINDING PUBLICATIONS — the portable side.
//
// Every dispatch path in this portable requires a target that already has a contact:
// free_submission needs an editor address, media_database verifies a contact it is
// handed, pr_wire needs a distribution list. None of them can answer "which outlets
// should we approach in Brazil?". A buyer with no answer to that has a working
// dispatcher and nothing to dispatch to.
//
// So discovery is an injected port with two sources, and both are supported because a
// buyer will have one or the other, rarely both:
//
//   1. ports.discovery — whatever the host wired. On the SignalBoost platform that is
//      its own regional publisher search; in a buyer's stack it may be a web-search
//      key, a curated internal list, or a scraper they already own.
//   2. A connected media database (Cision, Muck Rack, Meltwater, Prowly, Agility) —
//      the enterprise case, where the buyer already pays for exactly this data.
//
// When neither exists the answer is an honest refusal that NAMES what to connect. It
// never invents a publication: a fabricated outlet sends a real email under the
// buyer's name to an address nobody verified, which is this portable's worst failure
// mode and the reason the acceptance harness checks for it.

import type { PortBundle, DiscoveryQuery, DiscoveryResult, PublicationLead, MediaTarget } from './types.ts'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

function normalizeLead(lead: PublicationLead): PublicationLead | null {
  const publication = String(lead?.publication || '').replace(/\s+/g, ' ').trim().slice(0, 160)
  const contact = String(lead?.contact || '').trim().slice(0, 400)
  if (!publication || !contact) return null
  const method = lead?.method === 'online_form' ? 'online_form' : 'email'
  // An email-method lead must actually carry an email, or the dispatcher will fail at
  // send time with a confusing provider error instead of a clear validation one.
  if (method === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) return null
  if (method === 'online_form' && !/^https?:\/\//i.test(contact)) return null
  return { publication, contact, method, sourceUrl: lead?.sourceUrl, targetType: lead?.targetType }
}

function dedupe(leads: PublicationLead[]): PublicationLead[] {
  const seen = new Set<string>()
  const out: PublicationLead[] = []
  for (const lead of leads) {
    const key = lead.contact.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(lead)
  }
  return out
}

/**
 * Find publications worth approaching, using whatever source the host supplied.
 *
 * Returns leads only — it contacts nobody and queues nothing. Turning a lead into a
 * campaign stays a separate, human-approved step.
 */
export async function findPublications(
  ports: PortBundle,
  query: DiscoveryQuery,
): Promise<DiscoveryResult> {
  const region = String(query?.region || '').trim()
  if (!region) return { ok: false, leads: [], error: 'A region is required, e.g. "United States" or "Brasil".' }

  const limit = Math.max(1, Math.min(Number(query?.limit) || DEFAULT_LIMIT, MAX_LIMIT))

  if (!ports.discovery) {
    return {
      ok: false,
      leads: [],
      error: 'No discovery source is connected. Connect a media database (Cision, Muck Rack, Meltwater, Prowly, Agility PR) or supply a discovery port, or add target publications by hand.',
    }
  }

  let result: DiscoveryResult
  try {
    result = await ports.discovery.findPublications({ ...query, region, limit })
  } catch (error: any) {
    return { ok: false, leads: [], error: `Discovery failed: ${String(error?.message || error || 'unknown error')}` }
  }

  const leads = dedupe((result?.leads || []).map(normalizeLead).filter(Boolean) as PublicationLead[]).slice(0, limit)

  if (!leads.length) {
    return {
      ok: false,
      leads: [],
      examined: result?.examined,
      error: result?.error || `No publications with a usable editorial contact were found in ${region}.`,
    }
  }
  return { ok: true, leads, examined: result?.examined }
}

/**
 * Convert a lead into the target shape the adapters already accept.
 *
 * Kept separate from findPublications on purpose: a lead is a suggestion, a target is
 * something the engine will actually send to, and a human decides which leads cross
 * that line.
 */
export function leadToTarget(lead: PublicationLead): MediaTarget {
  return {
    mediaTargetType: lead.targetType || 'digital_press',
    publicationName: lead.publication,
    editorEmail: lead.method === 'email' ? lead.contact : undefined,
    submitFormUrl: lead.method === 'online_form' ? lead.contact : undefined,
    sourceUrl: lead.sourceUrl,
  }
}
