// saas/lib/ai/cos/editorialSkillContext.ts
//
// THE EDITOR MUST USE THE LEARNED SKILL LAYER (2026-09-04)
// -------------------------------------------------------
// tryDirectTextTransformation returns from cosFirstAnswerCore BEFORE the enterprise path runs,
// so every editing turn was answered by a static, hand-written prompt: cognitiveSkillsUsed 0,
// cognitiveSkillFunnel empty, enterpriseMemoryStatus not_consulted. retrieveValidatedCognitiveSkills
// — the embedding-ranked, metacognitively-selected skill retriever — had exactly one consumer,
// cosFirstAnswerEnterprise.ts, and the editor was not it.
//
// That is an open learning loop. learnFromTurn() records every editing turn, the skill pipeline
// promotes what it learns, and the editor then reads none of it back. Editing quality could only
// ever improve by someone hand-editing another prompt string, which is why each fix lands and the
// next rough draft comes back just as flat.
//
// This module closes the read side. Skills enter as HOW-TO-EDIT guidance only:
//   - they are never cited in the output — the deliverable is a finished email, and an [SK3] tag
//     inside it is garbage to the person pasting it into Outlook;
//   - stripEditorialSkillLabels() removes any label or skill_key that leaks through anyway, which
//     also keeps internal identifiers off the public Concierge surface, where this editor runs
//     before any disclosure gate;
//   - retrieval is best-effort and time-boxed. A slow or unavailable skill store costs the writer
//     nothing: the turn proceeds exactly as it did before.
//
// cognitiveSkillContext is imported DYNAMICALLY, inside the one async function that needs it.
// That module reaches the Supabase client through '@/lib' path aliases, which the repo's bare
// `node --experimental-strip-types --test` runner cannot resolve; a top-level import would make
// this module — and every test that touches it — unrunnable outside a Next build.

export type EditorialSkillContext = {
  block: string
  ids: string[]
  retrieved: number
  relevant: number
  selected: number
}

export const EMPTY_EDITORIAL_SKILL_CONTEXT: EditorialSkillContext = {
  block: '',
  ids: [],
  retrieved: 0,
  relevant: 0,
  selected: 0,
}

function budgetMs(): number {
  const raw = Number(process.env.EDITORIAL_SKILL_RETRIEVAL_BUDGET_MS || 4000)
  return Number.isFinite(raw) ? Math.max(1000, Math.min(15000, raw)) : 4000
}

/**
 * The retrieval query is the instruction plus the draft. Ranking is semantic, so the draft itself
 * is what makes a correspondence skill outrank an unrelated one; the instruction alone is nearly
 * identical on every uninstructed paste and would rank almost nothing.
 */
export function editorialSkillQuery(instruction: string, editableSource: string): string {
  return [String(instruction || '').trim(), String(editableSource || '').trim()]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 4000)
}

export function editorialSkillBlock(lines: string[]): string {
  if (!lines.length) return ''
  return [
    'VALIDATED PROCEDURAL WRITING SKILLS — HOW TO DO THIS EDIT, NOT FACTS TO INCLUDE:',
    ...lines,
    'Apply any skill above that fits this draft. These are learned editing procedures, not content.',
    'NEVER write [SK1], [SK2], skill_key, a status, a relevance score, or any reference to these skills in the finished text. Return the edited text only.',
  ].join('\n')
}

/** Best-effort, time-boxed skill retrieval for an editing turn. Never throws, never blocks. */
export async function retrieveEditorialSkills(
  instruction: string,
  editableSource: string,
): Promise<EditorialSkillContext> {
  const query = editorialSkillQuery(instruction, editableSource)
  if (!query) return EMPTY_EDITORIAL_SKILL_CONTEXT
  try {
    const { retrieveValidatedCognitiveSkills } = await import('./cognitiveSkillContext.ts')
    const result = await Promise.race([
      retrieveValidatedCognitiveSkills(query),
      new Promise<null>(resolve => setTimeout(() => resolve(null), budgetMs())),
    ])
    if (!result || !result.items.length) {
      return result
        ? { ...EMPTY_EDITORIAL_SKILL_CONTEXT, retrieved: result.retrieved, relevant: result.relevant }
        : EMPTY_EDITORIAL_SKILL_CONTEXT
    }
    return {
      block: editorialSkillBlock(result.items.map(item => item.line)),
      ids: result.items.map(item => item.id),
      retrieved: result.retrieved,
      relevant: result.relevant,
      selected: result.selected,
    }
  } catch (error) {
    console.warn('[cos-editorial-skills] retrieval unavailable; editing without learned skills', error)
    return EMPTY_EDITORIAL_SKILL_CONTEXT
  }
}

const SKILL_LABEL_RE = /\[SK\d{1,2}\]/g
const SKILL_KEY_RE = /\[?skill_key\s*=\s*[^\]\n]{0,240}\]?/gi

/**
 * Remove skill machinery from a finished draft. Applies to the deliverable only, so a genuinely
 * bracketed phrase the writer wrote is untouched unless it is one of these two internal forms.
 */
export function stripEditorialSkillLabels(text: string): string {
  const cleaned = String(text || '')
    .replace(SKILL_LABEL_RE, '')
    .replace(SKILL_KEY_RE, '')
  if (cleaned === String(text || '')) return String(text || '')
  return cleaned
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .trim()
}
