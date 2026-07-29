// saas/lib/ai/cos/sourceRouter.ts
//
// JUDGMENT (v1 = deterministic term match over the beliefs in cosBeliefs.ts).
// Decides which source of truth COS must consult before answering. The
// knowledge lives in the beliefs; this file only iterates and scores them, so
// adding a source never changes this logic. v2 swaps the matcher for the model.

import type { CosSourceRouting } from './reasoningTypes.ts';
import { SOURCE_BELIEFS, CURRENT_FACT_SIGNALS } from './cosBeliefs.ts';

const PROSPECT_DISCOVERY_PATTERN = /potential buyers?|design partners?|prospect list|find (?:companies|businesses|prospects)|cloud-focused msp|managed cloud-service provider|devops (?:and |&)??sre|qualification score|linkedin profile/;

export function routeCosSource(objective: string): CosSourceRouting {
  const text = ` ${(objective || '').toLowerCase().trim()} `;

  if (text.trim().length === 0) {
    return { requiredSource: 'no_tool_required', mustUseTool: false, reason: 'Empty objective.' };
  }

  // Discovery of companies that do not already exist in SignalBoost must use
  // the public web. This explicit precedence prevents incidental words such as
  // "customers" or "partners" inside a research brief from routing the whole
  // request to internal metrics or the saved-lead pipeline.
  if (PROSPECT_DISCOVERY_PATTERN.test(text)) {
    return {
      requiredSource: 'live_public_website',
      mustUseTool: true,
      reason: 'New-company and buyer discovery requires current public-web research; internal customer, affiliate, and saved-lead records are not the source of truth.',
    };
  }

  for (const belief of SOURCE_BELIEFS) {
    if (belief.signals.length === 0) continue; // skip fallbacks
    if (belief.signals.some((s) => text.includes(s))) {
      const liveNote = belief.liveFactsOnly
        ? ' COS must fetch this live and may not answer from memory.'
        : '';
      return {
        requiredSource: belief.id,
        mustUseTool: belief.mustUseTool,
        reason: `Routed to "${belief.id}": ${belief.describes}${liveNote}`,
      };
    }
  }

  if (CURRENT_FACT_SIGNALS.some((s) => text.includes(s))) {
    return {
      requiredSource: 'live_public_website',
      mustUseTool: true,
      reason: 'Asks for a current fact but no specific source matched; defaulting to the live public web.',
    };
  }

  return {
    requiredSource: 'no_tool_required',
    mustUseTool: false,
    reason: 'General strategy question; no current fact required.',
  };
}
