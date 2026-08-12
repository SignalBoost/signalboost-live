import type { ContinuousLearningSourceKind } from './index'

export type LearningRightsMode = 'full_text_allowed' | 'facts_and_summary_only'

export type LearningSourceProfile = {
  id: string
  label: string
  kind: ContinuousLearningSourceKind
  rightsMode: LearningRightsMode
  minimumConfidence: number
  examples: string[]
}

/**
 * Source policy is explicit and auditable. COS may learn from these source classes,
 * but copyrighted/closed material is retained as facts, provenance and compact summaries
 * rather than as a shadow copy of the original work.
 */
export const CONTINUOUS_LEARNING_SOURCE_CATALOG: LearningSourceProfile[] = [
  {
    id: 'youtube-transcripts',
    label: 'YouTube and educational video transcripts',
    kind: 'video_transcript',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.74,
    examples: ['official vendor channels', 'university lectures', 'technical conference talks'],
  },
  {
    id: 'libraries-public-domain',
    label: 'Libraries and public-domain books',
    kind: 'library_material',
    rightsMode: 'full_text_allowed',
    minimumConfidence: 0.76,
    examples: ['public-domain books', 'institutional repositories', 'open educational resources'],
  },
  {
    id: 'libraries-copyrighted',
    label: 'Licensed or copyrighted library material',
    kind: 'library_material',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.78,
    examples: ['licensed books', 'library abstracts', 'publisher-provided excerpts'],
  },
  {
    id: 'scientific-journals',
    label: 'Scientific journals and research literature',
    kind: 'scientific_journal',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.82,
    examples: ['peer-reviewed journals', 'preprint servers', 'open-access papers'],
  },
  {
    id: 'news',
    label: 'Reputable newspapers and newswires',
    kind: 'news_article',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.78,
    examples: ['major newspapers', 'financial press', 'newswires'],
  },
  {
    id: 'official-docs',
    label: 'Official documentation and standards',
    kind: 'official_documentation',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.86,
    examples: ['vendor documentation', 'government publications', 'standards bodies'],
  },
  {
    id: 'datasets',
    label: 'Public and licensed datasets',
    kind: 'public_dataset',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.82,
    examples: ['government open data', 'research datasets', 'licensed business datasets'],
  },
  {
    id: 'public-web',
    label: 'Approved public web sources',
    kind: 'approved_public_web',
    rightsMode: 'facts_and_summary_only',
    minimumConfidence: 0.76,
    examples: ['company sites', 'industry associations', 'public technical resources'],
  },
]

export function learningSourceProfile(id: string): LearningSourceProfile | null {
  return CONTINUOUS_LEARNING_SOURCE_CATALOG.find((profile) => profile.id === id) ?? null
}

/**
 * The confidence a candidate of this source kind must reach before it is admitted as knowledge.
 *
 * These numbers were declared here from the start and never read by anything — admission used a
 * single global 0.72 for every source, so an official-documentation claim and a news blurb were
 * held to the same bar despite this catalogue saying 0.86 and 0.78. Several kinds appear under
 * more than one profile (library material is listed both public-domain and licensed), so the
 * MOST PERMISSIVE floor wins: the candidate only has to satisfy some approved profile for its
 * kind, not every one of them.
 *
 * Returns null for a kind the catalogue does not describe, which leaves the global policy floor
 * as the only gate rather than inventing a number for it.
 */
export function minimumConfidenceForKind(kind: ContinuousLearningSourceKind): number | null {
  const floors = CONTINUOUS_LEARNING_SOURCE_CATALOG
    .filter((profile) => profile.kind === kind)
    .map((profile) => profile.minimumConfidence)
    .filter((value) => Number.isFinite(value))
  return floors.length ? Math.min(...floors) : null
}
