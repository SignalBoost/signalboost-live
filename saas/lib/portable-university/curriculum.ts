// saas/lib/portable-university/curriculum.ts
//
// Buyer-neutral curriculum contract for the portable AI University.
//
// Human-university model:
//   Years 1-2: one mandatory foundation shared by every student.
//   Years 3+: a major plus student/buyer-selected electives.
//   Organization courses: buyer-owned material layered on top without rewriting the product.
//
// The shared core cannot be silently removed from a profile. A buyer may add required courses,
// choose a major, choose electives, and add organization-specific courses. Distillation consumes
// the resolved curriculum snapshot rather than reaching into SignalBoost-specific COS tables.

export const PORTABLE_UNIVERSITY_CURRICULUM_SCHEMA_VERSION = 'portable-university-curriculum.v1' as const
export const PORTABLE_UNIVERSITY_DISTILLATION_SNAPSHOT_VERSION = 'portable-university-distillation-snapshot.v1' as const

export type PortableUniversityCourseStage = 'mandatory_core' | 'major' | 'elective' | 'organization'
export type PortableUniversityYearBand = 'years_1_2' | 'years_3_4' | 'graduate'

export interface PortableUniversityCourse {
  readonly id: string
  readonly title: string
  readonly stage: PortableUniversityCourseStage
  readonly yearBand: PortableUniversityYearBand
  readonly required: boolean
  readonly prerequisites: readonly string[]
  readonly topics: readonly string[]
}

export interface PortableUniversityMajor {
  readonly id: string
  readonly title: string
  readonly requiredCourseIds: readonly string[]
  readonly recommendedElectiveIds: readonly string[]
}

export interface PortableUniversityCurriculumProfile {
  readonly schemaVersion: typeof PORTABLE_UNIVERSITY_CURRICULUM_SCHEMA_VERSION
  readonly profileId: string
  readonly majorId: string
  readonly selectedElectiveIds: readonly string[]
  readonly additionalRequiredCourses: readonly PortableUniversityCourse[]
  readonly organizationCourses: readonly PortableUniversityCourse[]
}

export interface PortableUniversityResolvedCurriculum {
  readonly schemaVersion: typeof PORTABLE_UNIVERSITY_CURRICULUM_SCHEMA_VERSION
  readonly profileId: string
  readonly majorId: string
  readonly mandatoryCore: readonly PortableUniversityCourse[]
  readonly major: readonly PortableUniversityCourse[]
  readonly electives: readonly PortableUniversityCourse[]
  readonly organization: readonly PortableUniversityCourse[]
  readonly allCourses: readonly PortableUniversityCourse[]
}

function frozenStrings(values: readonly string[] = []): readonly string[] {
  return Object.freeze([...values])
}

function course(input: Omit<PortableUniversityCourse, 'prerequisites' | 'topics'> & { prerequisites?: readonly string[]; topics?: readonly string[] }): PortableUniversityCourse {
  return Object.freeze({
    ...input,
    prerequisites: frozenStrings(input.prerequisites),
    topics: frozenStrings(input.topics),
  })
}

export const PORTABLE_UNIVERSITY_MANDATORY_CORE: readonly PortableUniversityCourse[] = Object.freeze([
  course({ id: 'core-reasoning-evidence', title: 'Reasoning, Evidence, and Critical Evaluation', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['reasoning', 'source evaluation', 'uncertainty', 'fact versus inference'] }),
  course({ id: 'core-quantitative-literacy', title: 'Mathematics, Statistics, and Quantitative Literacy', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['probability', 'statistics', 'estimation', 'measurement'] }),
  course({ id: 'core-research-methods', title: 'Research Methods and Reproducibility', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['research design', 'provenance', 'replication', 'holdout evaluation'] }),
  course({ id: 'core-communication-hmi', title: 'Communication and Human-Machine Interaction', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['clear communication', 'multilingual interaction', 'human factors', 'accessibility'] }),
  course({ id: 'core-computing-systems', title: 'Computing and Systems Foundations', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['software', 'APIs', 'networks', 'databases', 'distributed systems'] }),
  course({ id: 'core-data-literacy', title: 'Data Literacy and Information Management', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['data quality', 'lineage', 'privacy', 'retrieval', 'knowledge representation'] }),
  course({ id: 'core-security-governance', title: 'Security, Governance, and Operational Boundaries', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['least privilege', 'auditability', 'authorization', 'safe failure', 'governance'] }),
  course({ id: 'core-ethics-human-control', title: 'Ethics, Human Control, and Responsible AI', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['human oversight', 'rights', 'fairness', 'privacy', 'consequential decisions'] }),
  course({ id: 'core-systems-thinking', title: 'Systems Thinking, Reliability, and Failure Analysis', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['systems thinking', 'observability', 'failure modes', 'recovery', 'feedback loops'] }),
  course({ id: 'core-learning-evaluation', title: 'Learning, Exams, Retention, and Self-Evaluation', stage: 'mandatory_core', yearBand: 'years_1_2', required: true, topics: ['study strategy', 'exams', 'retention', 'transfer', 'verified outcomes'] }),
])

export const PORTABLE_UNIVERSITY_MAJOR_COURSES: readonly PortableUniversityCourse[] = Object.freeze([
  course({ id: 'major-software-engineering', title: 'Advanced Software Engineering', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-computing-systems'], topics: ['architecture', 'testing', 'debugging', 'APIs', 'distributed systems'] }),
  course({ id: 'major-cyber-defense', title: 'Cyber Defense and Security Engineering', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-security-governance'], topics: ['secure coding', 'vulnerability analysis', 'incident response', 'defensive remediation'] }),
  course({ id: 'major-agent-systems', title: 'AI Agent Systems', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-reasoning-evidence', 'core-computing-systems'], topics: ['planning', 'tool use', 'RAG', 'multi-agent coordination', 'evaluation'] }),
  course({ id: 'major-ml-data', title: 'Machine Learning and Data Engineering', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-data-literacy', 'core-quantitative-literacy'], topics: ['datasets', 'model evaluation', 'fine-tuning', 'embeddings', 'drift'] }),
  course({ id: 'major-enterprise-commercial', title: 'Enterprise Commercial Execution', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-communication-hmi'], topics: ['sales', 'marketing', 'pricing', 'pipeline', 'verified outcomes'] }),
  course({ id: 'major-enterprise-governance', title: 'Enterprise Governance and Compliance', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-security-governance'], topics: ['procurement', 'privacy', 'audit evidence', 'risk', 'compliance'] }),
  course({ id: 'major-robotics-edge-ai', title: 'Robotics, Edge AI, and Sensor Systems', stage: 'major', yearBand: 'years_3_4', required: true, prerequisites: ['core-computing-systems', 'core-quantitative-literacy'], topics: ['edge inference', 'sensor fusion', 'digital twins', 'operator safety'] }),
])

export const PORTABLE_UNIVERSITY_ELECTIVE_COURSES: readonly PortableUniversityCourse[] = Object.freeze([
  course({ id: 'elective-cognitive-science', title: 'Cognitive Science and Human Decision-Making', stage: 'elective', yearBand: 'years_3_4', required: false, prerequisites: ['core-communication-hmi'] }),
  course({ id: 'elective-computational-creativity', title: 'Computational Creativity, Arts, and AI Ethics', stage: 'elective', yearBand: 'years_3_4', required: false, prerequisites: ['core-ethics-human-control'] }),
  course({ id: 'elective-space-science', title: 'Space Science and Scientific Computing', stage: 'elective', yearBand: 'years_3_4', required: false, prerequisites: ['core-quantitative-literacy'] }),
  course({ id: 'elective-applied-physics', title: 'Applied Physics and Advanced Engineering', stage: 'elective', yearBand: 'years_3_4', required: false, prerequisites: ['core-quantitative-literacy'] }),
  course({ id: 'elective-industrial-hmi', title: 'Industrial HMI and Operational Safety', stage: 'elective', yearBand: 'years_3_4', required: false, prerequisites: ['core-communication-hmi', 'core-security-governance'] }),
  course({ id: 'elective-ai-systems-safety', title: 'AI Systems, Reliability, and Safety', stage: 'elective', yearBand: 'years_3_4', required: false, prerequisites: ['core-systems-thinking', 'core-ethics-human-control'] }),
])

export const PORTABLE_UNIVERSITY_MAJORS: readonly PortableUniversityMajor[] = Object.freeze([
  Object.freeze({ id: 'software_engineering', title: 'Software Engineering', requiredCourseIds: frozenStrings(['major-software-engineering']), recommendedElectiveIds: frozenStrings(['elective-ai-systems-safety', 'elective-industrial-hmi']) }),
  Object.freeze({ id: 'cyber_defense', title: 'Cyber Defense', requiredCourseIds: frozenStrings(['major-cyber-defense']), recommendedElectiveIds: frozenStrings(['elective-ai-systems-safety']) }),
  Object.freeze({ id: 'agent_systems', title: 'Agent Systems', requiredCourseIds: frozenStrings(['major-agent-systems']), recommendedElectiveIds: frozenStrings(['elective-cognitive-science', 'elective-ai-systems-safety']) }),
  Object.freeze({ id: 'ml_data_engineering', title: 'ML and Data Engineering', requiredCourseIds: frozenStrings(['major-ml-data']), recommendedElectiveIds: frozenStrings(['elective-ai-systems-safety']) }),
  Object.freeze({ id: 'enterprise_commercial', title: 'Enterprise Commercial', requiredCourseIds: frozenStrings(['major-enterprise-commercial']), recommendedElectiveIds: frozenStrings(['elective-cognitive-science']) }),
  Object.freeze({ id: 'enterprise_governance', title: 'Enterprise Governance', requiredCourseIds: frozenStrings(['major-enterprise-governance']), recommendedElectiveIds: frozenStrings(['elective-ai-systems-safety']) }),
  Object.freeze({ id: 'robotics_edge_ai', title: 'Robotics and Edge AI', requiredCourseIds: frozenStrings(['major-robotics-edge-ai']), recommendedElectiveIds: frozenStrings(['elective-industrial-hmi', 'elective-applied-physics']) }),
])

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PROFILE_ID = /^[a-z0-9][a-z0-9._:-]{0,119}$/

function assertCourse(value: PortableUniversityCourse, expectedStage?: PortableUniversityCourseStage): void {
  if (!value || !ID.test(value.id) || !value.title.trim()) throw new Error('invalid_university_course')
  if (expectedStage && value.stage !== expectedStage) throw new Error('invalid_university_course_stage')
  if (!Object.isFrozen(value.prerequisites) || !Object.isFrozen(value.topics)) throw new Error('university_course_arrays_must_be_frozen')
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)]
}

export function createPortableUniversityCurriculumProfile(input: {
  profileId: string
  majorId: string
  selectedElectiveIds?: readonly string[]
  additionalRequiredCourses?: readonly PortableUniversityCourse[]
  organizationCourses?: readonly PortableUniversityCourse[]
}): PortableUniversityCurriculumProfile {
  const profileId = String(input.profileId || '').trim()
  if (!PROFILE_ID.test(profileId)) throw new Error('invalid_university_profile_id')
  const major = PORTABLE_UNIVERSITY_MAJORS.find(item => item.id === input.majorId)
  if (!major) throw new Error('unknown_university_major')

  const electiveIds = unique((input.selectedElectiveIds ?? []).map(value => String(value).trim()).filter(Boolean))
  const electiveCatalog = new Set(PORTABLE_UNIVERSITY_ELECTIVE_COURSES.map(item => item.id))
  if (electiveIds.some(id => !electiveCatalog.has(id))) throw new Error('unknown_university_elective')

  const additionalRequiredCourses = (input.additionalRequiredCourses ?? []).map(item => {
    assertCourse(item)
    if (!item.required) throw new Error('additional_required_course_must_be_required')
    return item
  })
  const organizationCourses = (input.organizationCourses ?? []).map(item => {
    assertCourse(item, 'organization')
    return item
  })

  const occupied = new Set([
    ...PORTABLE_UNIVERSITY_MANDATORY_CORE.map(item => item.id),
    ...PORTABLE_UNIVERSITY_MAJOR_COURSES.map(item => item.id),
    ...PORTABLE_UNIVERSITY_ELECTIVE_COURSES.map(item => item.id),
  ])
  for (const item of [...additionalRequiredCourses, ...organizationCourses]) {
    if (occupied.has(item.id)) throw new Error('university_course_id_conflict')
    occupied.add(item.id)
  }

  return Object.freeze({
    schemaVersion: PORTABLE_UNIVERSITY_CURRICULUM_SCHEMA_VERSION,
    profileId,
    majorId: major.id,
    selectedElectiveIds: Object.freeze(electiveIds),
    additionalRequiredCourses: Object.freeze([...additionalRequiredCourses]),
    organizationCourses: Object.freeze([...organizationCourses]),
  })
}

export function resolvePortableUniversityCurriculum(profile: PortableUniversityCurriculumProfile): PortableUniversityResolvedCurriculum {
  if (profile.schemaVersion !== PORTABLE_UNIVERSITY_CURRICULUM_SCHEMA_VERSION) throw new Error('unsupported_university_curriculum_schema')
  const major = PORTABLE_UNIVERSITY_MAJORS.find(item => item.id === profile.majorId)
  if (!major) throw new Error('unknown_university_major')

  const majorById = new Map(PORTABLE_UNIVERSITY_MAJOR_COURSES.map(item => [item.id, item] as const))
  const electiveById = new Map(PORTABLE_UNIVERSITY_ELECTIVE_COURSES.map(item => [item.id, item] as const))
  const majorCourses = major.requiredCourseIds.map(id => majorById.get(id)).filter((item): item is PortableUniversityCourse => Boolean(item))
  if (majorCourses.length !== major.requiredCourseIds.length) throw new Error('incomplete_university_major_catalog')

  const electives = profile.selectedElectiveIds.map(id => electiveById.get(id)).filter((item): item is PortableUniversityCourse => Boolean(item))
  if (electives.length !== profile.selectedElectiveIds.length) throw new Error('unknown_university_elective')

  const mandatoryCore = Object.freeze([...PORTABLE_UNIVERSITY_MANDATORY_CORE, ...profile.additionalRequiredCourses])
  const allCourses = Object.freeze([...mandatoryCore, ...majorCourses, ...electives, ...profile.organizationCourses])
  const ids = allCourses.map(item => item.id)
  if (new Set(ids).size !== ids.length) throw new Error('duplicate_university_course')

  return Object.freeze({
    schemaVersion: PORTABLE_UNIVERSITY_CURRICULUM_SCHEMA_VERSION,
    profileId: profile.profileId,
    majorId: profile.majorId,
    mandatoryCore,
    major: Object.freeze(majorCourses),
    electives: Object.freeze(electives),
    organization: Object.freeze([...profile.organizationCourses]),
    allCourses,
  })
}

export function createDistillationCurriculumSnapshot(profile: PortableUniversityCurriculumProfile) {
  const resolved = resolvePortableUniversityCurriculum(profile)
  return Object.freeze({
    schemaVersion: PORTABLE_UNIVERSITY_DISTILLATION_SNAPSHOT_VERSION,
    profileId: resolved.profileId,
    majorId: resolved.majorId,
    courseIds: Object.freeze(resolved.allCourses.map(item => item.id)),
    courses: Object.freeze(resolved.allCourses.map(item => Object.freeze({
      id: item.id,
      title: item.title,
      stage: item.stage,
      yearBand: item.yearBand,
      required: item.required,
    }))),
  })
}
