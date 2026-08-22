// saas/lib/ai/cos/feedbackFreshnessMiss.ts
//
// CLOSE THE LOOP THE 2026-08-22 INCIDENT LEFT OPEN: a user told COS its answer was OUTDATED, and
// nothing downstream learned anything from the word "outdated" specifically. Correction feedback
// already becomes a generalization candidate, but "your information is stale" is a more precise
// signal than "you were wrong" — it means the answer SHOULD have been live-verified or the corpus
// SHOULD hold current material, and neither happened. This module turns that exact signal into the
// two artifacts the existing learning machinery already knows how to consume:
//
//   1. a STUDY GAP ("current, officially sourced state of <topic>") that the daily learning cycle
//      studies like any other queued gap — subject derived from bounded topic terms of the prompt,
//      NEVER the verbatim prompt (the no-raw-prompt discipline of the learning stores holds here),
//   2. nothing else. No classifier is auto-edited, no threshold moves. A human reading the gap's
//      escalation_reason tag ('user_correction_outdated') decides whether the freshness patterns need work.
//
// Detection is deterministic and multilingual across the five platform languages: the user must
// actually SAY the staleness ("outdated", "nieaktualne", "desactualizado", "устарело", "not
// updated", "has changed since") — a plain disagreement is not a freshness miss and files nothing.

export type FreshnessMissAssessment = {
  detected: boolean
  matchedMarker: string | null
  gapSubject: string | null
  gapQuestion: string | null
}

// Staleness vocabulary per platform language. Multi-word phrases first.
const STALENESS_MARKERS: string[] = [
  // en
  'out of date', 'not updated', 'no longer accurate', 'no longer correct', 'no longer true',
  'has changed since', 'outdated', 'old information', 'stale information',
  // pl
  'nieaktualne', 'nieaktualna', 'nieaktualny', 'przestarzałe', 'przestarzała', 'przestarzały',
  'już nieprawdziwe', 'zmieniło się od',
  // es
  'desactualizado', 'desactualizada', 'información antigua', 'ya no es correcto', 'ya no es cierto',
  'ha cambiado desde',
  // pt
  'desatualizado', 'desatualizada', 'informação antiga', 'já não é correto', 'não está atualizado',
  'mudou desde',
  // ru
  'устарело', 'устарела', 'устаревшая информация', 'больше не актуально', 'изменилось с',
  'не обновлено',
].sort((a, b) => b.length - a.length)

const TOPIC_STOP = new Set([
  'what', 'which', 'when', 'where', 'who', 'how', 'does', 'this', 'that', 'with', 'from', 'into',
  'should', 'would', 'could', 'about', 'after', 'before', 'have', 'need', 'want', 'please', 'help',
  'jakie', 'jaki', 'jaka', 'które', 'który', 'czym', 'oraz', 'żeby', 'jest',
  'cuál', 'cual', 'cuáles', 'cuales', 'cómo', 'como', 'qué', 'para', 'donde', 'cuando',
  'quais', 'qual', 'quando', 'onde', 'depois', 'antes',
  'какие', 'какой', 'когда', 'где', 'что', 'чтобы', 'после', 'перед', 'нужно',
])

function topicTerms(prompt: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of String(prompt || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ')) {
    const term = raw.trim()
    if (term.length < 4 || term.length > 30) continue
    if (TOPIC_STOP.has(term) || seen.has(term)) continue
    seen.add(term)
    out.push(term)
  }
  return out.slice(0, 8)
}

/**
 * Judge whether a correction is a FRESHNESS miss. Requires an explicit staleness marker in the
 * correction text; derives a bounded topic subject from the prompt's content terms only — the
 * verbatim prompt never enters the returned gap fields.
 */
export function assessFreshnessMiss(prompt: string, correctionText: string): FreshnessMissAssessment {
  const correction = String(correctionText || '').toLowerCase()
  const none: FreshnessMissAssessment = { detected: false, matchedMarker: null, gapSubject: null, gapQuestion: null }
  if (!correction.trim()) return none

  const marker = STALENESS_MARKERS.find(candidate => correction.includes(candidate))
  if (!marker) return none

  const terms = topicTerms(prompt)
  if (terms.length < 2) return { detected: true, matchedMarker: marker, gapSubject: null, gapQuestion: null }

  const subject = terms.join(' ').slice(0, 160)
  return {
    detected: true,
    matchedMarker: marker,
    gapSubject: subject,
    gapQuestion: `What is the CURRENT, officially sourced state of: ${subject}? A user reported COS's prior answer on this topic as outdated (${new Date().toISOString().slice(0, 10)}); acquire present-day authoritative material and verify what changed.`,
  }
}

/**
 * File the freshness-miss study gap. Insert-only, best-effort, deduplicated on subject by the
 * gap store's own semantics (a same-subject pending gap simply gains another evidence entry when
 * the writer supports it; a plain second row is tolerable and the queue cap bounds the cost).
 */
export async function recordFreshnessMissGap(
  db: any,
  assessment: FreshnessMissAssessment,
): Promise<{ filed: boolean; error?: string }> {
  if (!db || !assessment.detected || !assessment.gapSubject || !assessment.gapQuestion) return { filed: false }
  try {
    const existing = await db
      .from('cos_learning_gaps')
      .select('id')
      .eq('subject', assessment.gapSubject)
      .in('status', ['pending', 'failed'])
      .limit(1)
      .maybeSingle()
    if (existing?.data?.id) return { filed: false }

    const { error } = await db.from('cos_learning_gaps').insert({
      task_id: 'user_feedback',
      subject: assessment.gapSubject,
      question: assessment.gapQuestion,
      capability: 'current_world_freshness',
      status: 'pending',
      escalation_reason: `user_correction_outdated marker:${assessment.matchedMarker}`,
    })
    if (error) return { filed: false, error: String(error.message || error).slice(0, 300) }
    return { filed: true }
  } catch (error) {
    return { filed: false, error: error instanceof Error ? error.message.slice(0, 300) : 'gap insert failed' }
  }
}
