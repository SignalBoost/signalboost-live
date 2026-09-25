// saas/lib/cos-core/layers/learning/sourceFabric.ts
//
// Canonical plug-in contract for sources that can teach COS/University and, when rights permit,
// contribute training material. Source transport and training rights are intentionally separate.

import type { ContinuousLearningSourceAdapter, LearningSourceDocument } from './cycle.ts'
import type { LearningConnectorResult } from './connectors.ts'
import type { KnowledgeGap } from './index.ts'

export type UniversitySourceTransport =
  | 'native_api'
  | 'semantic_index'
  | 'dataset'
  | 'feed'
  | 'mirror'
  | 'mcp'

export type UniversitySourceCapability =
  | 'discovery'
  | 'metadata'
  | 'abstract'
  | 'full_text'
  | 'external_embeddings'
  | 'internal_reembedding'
  | 'working_agent_rag'
  | 'university_study'
  | 'university_projects'
  | 'weight_distillation_candidate'

export type UniversitySourceRightsMode =
  | 'reference_only'
  | 'rights_per_item'
  | 'cc0'
  | 'public_domain'

export type UniversitySourceManifest = Readonly<{
  id: string
  name: string
  sourceKind: LearningSourceDocument['sourceKind']
  transport: UniversitySourceTransport
  capabilities: readonly UniversitySourceCapability[]
  rightsMode: UniversitySourceRightsMode
  vectorSpace?: string | null
  costClass: 'free' | 'configured'
  enabledByDefault: boolean
}>

export type UniversitySourcePlugin = Readonly<{
  manifest: UniversitySourceManifest
  createAdapter(): ContinuousLearningSourceAdapter
}>

export type UniversityMcpLearningPort = Readonly<{
  search(input: Readonly<{ query: string; limit: number }>): Promise<readonly LearningConnectorResult[]>
}>

const REQUIRED_CAPABILITIES = Object.freeze([
  'working_agent_rag',
  'university_study',
  'university_projects',
] satisfies readonly UniversitySourceCapability[])

export function validateUniversitySourceManifest(manifest: UniversitySourceManifest): UniversitySourceManifest {
  const id = String(manifest.id || '').trim()
  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(id)) throw new Error('university_source_invalid_id')
  if (!String(manifest.name || '').trim()) throw new Error('university_source_missing_name')
  if (!manifest.capabilities.includes('discovery')) throw new Error('university_source_missing_discovery_capability')
  for (const capability of REQUIRED_CAPABILITIES) {
    if (!manifest.capabilities.includes(capability)) throw new Error(`university_source_missing_${capability}`)
  }
  if (manifest.capabilities.includes('weight_distillation_candidate')
    && !['rights_per_item', 'cc0', 'public_domain'].includes(manifest.rightsMode)) {
    throw new Error('university_source_distillation_without_rights_policy')
  }
  return Object.freeze({
    ...manifest,
    id,
    name: String(manifest.name).trim(),
    capabilities: Object.freeze([...new Set(manifest.capabilities)]),
    vectorSpace: manifest.vectorSpace ?? null,
  })
}

export function bindUniversitySourcePlugin(plugin: UniversitySourcePlugin): ContinuousLearningSourceAdapter {
  const manifest = validateUniversitySourceManifest(plugin.manifest)
  const adapter = plugin.createAdapter()
  if (adapter.id !== manifest.id) throw new Error(`university_source_adapter_id_mismatch:${manifest.id}`)
  if (adapter.kind !== manifest.sourceKind) throw new Error(`university_source_kind_mismatch:${manifest.id}`)
  return adapter
}

/**
 * Generic read-only MCP source adapter. The MCP host is responsible for authentication/tool
 * allowlisting. University still owns relevance, confidence, provenance, rights, deduplication,
 * embeddings, academic use and training eligibility after results arrive.
 */
export function createUniversityMcpSourcePlugin(input: Readonly<{
  manifest: UniversitySourceManifest
  port: UniversityMcpLearningPort
  maxResults?: number
}>): UniversitySourcePlugin {
  const manifest = validateUniversitySourceManifest({ ...input.manifest, transport: 'mcp' })
  const maxResults = Math.max(1, Math.min(10, Math.floor(Number(input.maxResults ?? 5))))
  return Object.freeze({
    manifest,
    createAdapter() {
      return {
        kind: manifest.sourceKind,
        id: manifest.id,
        async acquire(gap: KnowledgeGap): Promise<LearningSourceDocument[]> {
          const query = gap.discoveryQuery?.trim() || [gap.subject, gap.question].filter(Boolean).join(' ').trim()
          if (!query) return []
          const rows = await input.port.search({ query, limit: maxResults })
          return [...rows]
            .slice(0, maxResults)
            .map(row => ({
              sourceKind: manifest.sourceKind,
              sourceUri: String(row.uri || '').trim(),
              sourceTitle: row.title,
              observedAt: row.observedAt ?? new Date().toISOString(),
              subject: gap.subject,
              text: String(row.text || '').trim(),
              license: row.license,
              evidence: row.evidence?.filter(Boolean),
            }))
            .filter(row => Boolean(row.sourceUri && row.text))
        },
      }
    },
  })
}

export const UNIVERSITY_SOURCE_MANIFESTS = Object.freeze([
  validateUniversitySourceManifest({
    id: 'openalex',
    name: 'OpenAlex',
    sourceKind: 'scientific_journal',
    transport: 'semantic_index',
    capabilities: ['discovery','metadata','abstract','external_embeddings','internal_reembedding','working_agent_rag','university_study','university_projects','weight_distillation_candidate'],
    rightsMode: 'rights_per_item',
    vectorSpace: 'openalex_gte_large_en_v1',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'semantic_scholar',
    name: 'Semantic Scholar / S2ORC',
    sourceKind: 'scientific_journal',
    transport: 'semantic_index',
    capabilities: ['discovery','metadata','abstract','external_embeddings','internal_reembedding','working_agent_rag','university_study','university_projects'],
    rightsMode: 'reference_only',
    vectorSpace: 'semantic_scholar_specter2_proximity_v2',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'europe_pmc',
    name: 'Europe PMC',
    sourceKind: 'scientific_journal',
    transport: 'native_api',
    capabilities: ['discovery','metadata','abstract','full_text','internal_reembedding','working_agent_rag','university_study','university_projects','weight_distillation_candidate'],
    rightsMode: 'rights_per_item',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'crossref',
    name: 'Crossref',
    sourceKind: 'scientific_journal',
    transport: 'native_api',
    capabilities: ['discovery','metadata','abstract','internal_reembedding','working_agent_rag','university_study','university_projects'],
    rightsMode: 'reference_only',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'open_library',
    name: 'Open Library',
    sourceKind: 'library_material',
    transport: 'native_api',
    capabilities: ['discovery','metadata','internal_reembedding','working_agent_rag','university_study','university_projects'],
    rightsMode: 'reference_only',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'project_gutenberg_pd',
    name: 'Project Gutenberg full text',
    sourceKind: 'library_material',
    transport: 'mirror',
    capabilities: ['discovery','metadata','full_text','internal_reembedding','working_agent_rag','university_study','university_projects','weight_distillation_candidate'],
    rightsMode: 'public_domain',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'hf_nist_cc0',
    name: 'Hugging Face · NIST CC0',
    sourceKind: 'public_dataset',
    transport: 'dataset',
    capabilities: ['discovery','full_text','external_embeddings','internal_reembedding','working_agent_rag','university_study','university_projects','weight_distillation_candidate'],
    rightsMode: 'cc0',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'hf_github_cc0',
    name: 'Hugging Face · GitHub CC0',
    sourceKind: 'public_dataset',
    transport: 'dataset',
    capabilities: ['discovery','full_text','internal_reembedding','working_agent_rag','university_study','university_projects','weight_distillation_candidate'],
    rightsMode: 'cc0',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'hf_arxiv_cc0',
    name: 'Hugging Face · arXiv metadata',
    sourceKind: 'public_dataset',
    transport: 'dataset',
    capabilities: ['discovery','metadata','internal_reembedding','working_agent_rag','university_study','university_projects'],
    rightsMode: 'reference_only',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'reference',
    name: 'Wikipedia / Wikimedia',
    sourceKind: 'approved_public_web',
    transport: 'native_api',
    capabilities: ['discovery','full_text','internal_reembedding','working_agent_rag','university_study','university_projects'],
    rightsMode: 'reference_only',
    costClass: 'free',
    enabledByDefault: true,
  }),
  validateUniversitySourceManifest({
    id: 'official_docs',
    name: 'Official technical documentation',
    sourceKind: 'official_documentation',
    transport: 'feed',
    capabilities: ['discovery','full_text','internal_reembedding','working_agent_rag','university_study','university_projects'],
    rightsMode: 'reference_only',
    costClass: 'free',
    enabledByDefault: true,
  }),
] as const)

export function universitySourceManifest(adapterId: string): UniversitySourceManifest | null {
  return UNIVERSITY_SOURCE_MANIFESTS.find(item => item.id === String(adapterId || '').trim()) ?? null
}

export function universitySourceSupports(adapterId: string, capability: UniversitySourceCapability): boolean {
  return universitySourceManifest(adapterId)?.capabilities.includes(capability) === true
}
