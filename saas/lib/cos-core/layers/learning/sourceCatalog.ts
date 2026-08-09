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
