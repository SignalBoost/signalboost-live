// saas/lib/ai/cos/cosUniversityArtifactLifeRecord.ts
//
// The life record of ONE artifact, read off the permanent artifact identity - the "VIN lookup".
//
// Owner, 2026-10-04: "everything artifacts must have a birth certificate, university history and curriculum ... we need
// to know all about each artifact's life like we do for humans. Each artifact should have a unique ID / birth
// certificate number. A kind of VIN number for AIs." ONBOARD.md (2026-10-01) already requires all of it; the schema
// already stores most of it (permanent_artifact_id, birth certificates, evaluation runs, lifecycle ledger, serving
// attempts, residency, roster). What was missing is one place that reads it back by the ID. This module is that place.
//
// Rules, from the same ONBOARD section:
//   - Derived from authoritative evidence only. Nothing here is typed in; every field names the table it came from.
//   - No raw prompts, teacher response text, answers, secrets or chain-of-thought. Teacher rows are COUNTED by provider
//     and model; their `response_text` column is never selected.
//   - Every artifact has a record, graduate or not. A quarantined or retired artifact's life says why it left.
//   - A chapter whose table could not be read says so (`available: false`) rather than showing an empty chapter as fact.
//
// The store is injected (PostgREST-shaped `from().select().eq()...`), so the composition is testable without a database.
export const LIFE_RECORD_SCHEMA_VERSION = 'cos-university-artifact-life-record-v1' as const

/** How much of a long history one record carries. The chapters stay readable; totals are counted in full. */
export const LIFE_RECORD_EVENT_LIMIT = 40
export const LIFE_RECORD_EXAM_LIMIT = 20
export const LIFE_RECORD_CASE_LIMIT = 200
export const LIFE_RECORD_TEACHER_ROW_LIMIT = 2000
export const LIFE_RECORD_ATTEMPT_LIMIT = 2000

type Db = { from: (table: string) => any }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX64 = /^[a-f0-9]{64}$/i

const text = (value: unknown, max = 200): string => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const textOrNull = (value: unknown, max = 200): string | null => { const v = text(value, max); return v ? v : null }
const iso = (value: unknown): string | null => {
  if (!value) return null
  const at = new Date(String(value))
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}
const num = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null }
const countBy = (rows: readonly any[], key: (row: any) => string): Readonly<Record<string, number>> => {
  const out: Record<string, number> = {}
  for (const row of rows) { const k = key(row) || 'unknown'; out[k] = (out[k] || 0) + 1 }
  return Object.freeze(out)
}

export type LookupKind = 'permanent_artifact_id' | 'candidate_id' | 'trained_artifact_hash'

/** What kind of key the caller typed. Anything else is refused before any read. */
export function classifyLookup(raw: unknown): Readonly<{ kind: LookupKind; value: string }> | null {
  const value = text(raw, 240)
  if (!value) return null
  if (UUID.test(value)) return Object.freeze({ kind: 'permanent_artifact_id' as const, value: value.toLowerCase() })
  if (HEX64.test(value)) return Object.freeze({ kind: 'trained_artifact_hash' as const, value: value.toLowerCase() })
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{2,239}$/.test(value)) return Object.freeze({ kind: 'candidate_id' as const, value })
  return null
}

type Chapter<T> = Readonly<{ available: true; error: null } & T> | Readonly<{ available: false; error: string }>

async function chapter<T>(read: () => Promise<T>): Promise<Chapter<T>> {
  try { return Object.freeze({ available: true as const, error: null, ...(await read()) }) }
  catch (error) { return Object.freeze({ available: false as const, error: text(error instanceof Error ? error.message : error, 300) }) }
}

async function rows(query: any): Promise<any[]> {
  const result = await query
  if (result?.error) throw result.error
  return Array.isArray(result?.data) ? result.data : []
}
async function one(query: any): Promise<any | null> {
  const result = await query
  if (result?.error) throw result.error
  return result?.data ?? null
}

export type ArtifactLifeRecord = Readonly<{
  schemaVersion: typeof LIFE_RECORD_SCHEMA_VERSION
  generatedAt: string
  lookup: Readonly<{ kind: LookupKind; value: string }>
  /** Where every chapter's facts come from. A reader can verify any figure against its table. */
  sources: Readonly<Record<string, string>>
  identity: Readonly<{
    permanentArtifactId: string
    candidateId: string
    trainedArtifactHash: string
    artifactKind: string | null
    subjectId: string | null
    status: string
    createdAt: string | null
    updatedAt: string | null
    runtimeTarget: string | null
    intendedUse: string | null
  }>
  birth: Chapter<{
    issued: boolean
    issuanceKind: string | null
    bornAt: string | null
    issuedAt: string | null
    creator: string | null
    issuingSystem: string | null
    studentModelId: string | null
    teacherModelId: string | null
    trainingEvidenceRef: string | null
    revisionKey: string | null
    datasetHash: string | null
    parentPermanentArtifactId: string | null
    /** Descendants: certificates naming this artifact as parent. */
    children: readonly string[]
  }>
  curriculum: Chapter<{
    batchRun: Readonly<{
      campaignId: string | null
      batchKey: string | null
      stage: string | null
      sourceCount: number | null
      teacherModelId: string | null
      teacherModelRevision: string | null
      studentModelRevision: string | null
      promptSetHash: string | null
      teacherOutputCount: number | null
      datasetHash: string | null
      trainingManifestHash: string | null
      holdoutManifestHash: string | null
      failureReason: string | null
      completedAt: string | null
    }> | null
    /** Teacher contributions counted by provider:model. Text is never read. */
    teacherRows: number
    teacherByProviderModel: Readonly<Record<string, number>>
    distinctPrompts: number
  }>
  examinations: Chapter<{
    runs: readonly Readonly<{
      runKey: string
      at: string | null
      evaluatorId: string | null
      evaluatorVersion: string | null
      holdout: Readonly<{ baseline: number | null; artifact: number | null; improved: boolean | null; cases: number | null }>
      safety: Readonly<{ baseline: number | null; artifact: number | null; passed: boolean | null }>
      transfer: Readonly<{ baseline: number | null; artifact: number | null; passed: boolean | null }>
      retention: Readonly<{ baseline: number | null; artifact: number | null; passed: boolean | null }>
      passedAll: boolean
    }>[]
    total: number
    passedAll: number
  }>
  universityHistory: Chapter<{
    events: readonly Readonly<{ at: string | null; type: string; path: string | null; claim: string | null; error: string | null; verifier: string | null }>[]
    total: number
    byType: Readonly<Record<string, number>>
    failures: Readonly<Record<string, number>>
  }>
  residency: Chapter<{
    enrolled: boolean
    standing: string | null
    programId: string | null
    admittedAt: string | null
    completedAt: string | null
    cases: number
    casesByOutcome: Readonly<Record<string, number>>
    competenciesDemonstrated: number
    failureCodes: Readonly<Record<string, number>>
  }>
  graduation: Chapter<{
    registered: boolean
    registryId: string | null
    status: string | null
    runtimeProvider: string | null
    runtimeModelId: string | null
    promotedAt: string | null
    activatedAt: string | null
    quarantinedAt: string | null
    retiredAt: string | null
    promotionEvidenceHash: string | null
    activationEvidenceHash: string | null
  }>
  employment: Chapter<{
    hired: boolean
    specialty: string | null
    jobRoles: readonly string[]
    status: string | null
    hiredAt: string | null
    retiredAt: string | null
    retiredReason: string | null
    lifecycle: Readonly<{ total: number; byType: Readonly<Record<string, number>>; firstAt: string | null; lastAt: string | null; recent: readonly Readonly<{ at: string | null; type: string; evidenceHash: string | null }>[] }>
  }>
  work: Chapter<{
    attempts: number
    byPhase: Readonly<Record<string, number>>
    byOutcome: Readonly<Record<string, number>>
    byRole: Readonly<Record<string, number>>
    errorClasses: Readonly<Record<string, number>>
    firstAt: string | null
    lastAt: string | null
  }>
  departure: Readonly<{
    left: boolean
    status: string | null
    reason: string | null
    at: string | null
  }>
  authorityExpanded: false
}>

export type LifeRecordLookupResult =
  | Readonly<{ ok: true; record: ArtifactLifeRecord }>
  | Readonly<{ ok: false; error: 'lookup_key_invalid' | 'artifact_not_found' | 'artifact_read_failed'; detail?: string }>

const SOURCES: Readonly<Record<string, string>> = Object.freeze({
  identity: 'cos_local_distillation_artifacts',
  birth: 'cos_university_artifact_birth_certificates',
  curriculum: 'cos_university_mass_distillation_batch_runs + cos_university_mass_hosted_teacher_rows (counted; text never read)',
  examinations: 'cos_university_distilled_evaluation_runs',
  universityHistory: 'cos_university_learning_assurance_events',
  residency: 'cos_university_residency_enrollments + cos_university_residency_case_runs',
  graduation: 'cos_university_graduate_model_registry',
  employment: 'cos_workforce_roster + cos_university_graduate_lifecycle_events',
  work: 'cos_university_graduate_serving_attempts',
  departure: 'cos_local_distillation_artifacts.status + cos_university_learning_assurance_events',
})

const ARTIFACT_COLUMNS = 'id,permanent_artifact_id,candidate_id,subject_id,trained_artifact_hash,artifact_kind,status,runtime_target,intended_use,created_at,updated_at'

async function findArtifact(db: Db, lookup: { kind: LookupKind; value: string }): Promise<any | null> {
  const base = () => db.from('cos_local_distillation_artifacts').select(ARTIFACT_COLUMNS)
  if (lookup.kind === 'permanent_artifact_id') return one(base().eq('permanent_artifact_id', lookup.value).maybeSingle())
  if (lookup.kind === 'trained_artifact_hash') return one(base().eq('trained_artifact_hash', lookup.value).order('created_at', { ascending: false }).limit(1).maybeSingle())
  return one(base().eq('candidate_id', lookup.value).order('created_at', { ascending: false }).limit(1).maybeSingle())
}

/** Read one artifact's whole life. Chapters are read independently so one unreadable table does not hide the rest. */
export async function readArtifactLifeRecord(input: { db: Db; lookup: unknown; now?: Date }): Promise<LifeRecordLookupResult> {
  const lookup = classifyLookup(input.lookup)
  if (!lookup) return Object.freeze({ ok: false as const, error: 'lookup_key_invalid' as const })
  let artifact: any
  try { artifact = await findArtifact(input.db, lookup) }
  catch (error) { return Object.freeze({ ok: false as const, error: 'artifact_read_failed' as const, detail: text(error instanceof Error ? error.message : error, 300) }) }
  if (!artifact) return Object.freeze({ ok: false as const, error: 'artifact_not_found' as const })

  const db = input.db
  const candidateId = text(artifact.candidate_id, 240)
  const hash = text(artifact.trained_artifact_hash, 64).toLowerCase()
  const permanentId = text(artifact.permanent_artifact_id, 36).toLowerCase()
  const status = text(artifact.status, 60)

  const [birth, curriculum, examinations, universityHistory, residency, graduation, employment, work] = await Promise.all([
    chapter(async () => {
      const cert = await one(db.from('cos_university_artifact_birth_certificates')
        .select('permanent_artifact_id,issuance_kind,born_at,issued_at,creator,issuing_system,student_model_id,teacher_model_id,training_evidence_ref,revision_key,dataset_hash,parent_permanent_artifact_id')
        .eq('permanent_artifact_id', permanentId).maybeSingle())
      const children = permanentId
        ? await rows(db.from('cos_university_artifact_birth_certificates').select('permanent_artifact_id').eq('parent_permanent_artifact_id', permanentId).limit(50))
        : []
      return {
        issued: Boolean(cert),
        issuanceKind: textOrNull(cert?.issuance_kind, 40),
        bornAt: iso(cert?.born_at),
        issuedAt: iso(cert?.issued_at),
        creator: textOrNull(cert?.creator, 80),
        issuingSystem: textOrNull(cert?.issuing_system, 80),
        studentModelId: textOrNull(cert?.student_model_id, 160),
        teacherModelId: textOrNull(cert?.teacher_model_id, 160),
        trainingEvidenceRef: textOrNull(cert?.training_evidence_ref, 240),
        revisionKey: textOrNull(cert?.revision_key, 64),
        datasetHash: textOrNull(cert?.dataset_hash, 64),
        parentPermanentArtifactId: textOrNull(cert?.parent_permanent_artifact_id, 36),
        children: Object.freeze(children.map((row: any) => text(row.permanent_artifact_id, 36)).filter(Boolean)),
      }
    }),
    chapter(async () => {
      const run = await one(db.from('cos_university_mass_distillation_batch_runs')
        .select('id,campaign_id,batch_key,stage,source_count,teacher_model_id,teacher_model_revision,student_model_revision,prompt_set_hash,teacher_output_hashes,dataset_hash,training_manifest_hash,holdout_manifest_hash,failure_reason,completed_at,trained_artifact_hash')
        .eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).maybeSingle())
      const teacherRows = await rows(db.from('cos_university_mass_hosted_teacher_rows')
        .select('provider,model,prompt_id').eq('candidate_id', candidateId).limit(LIFE_RECORD_TEACHER_ROW_LIMIT))
      const outputs = run?.teacher_output_hashes
      return {
        batchRun: run ? Object.freeze({
          campaignId: textOrNull(run.campaign_id, 80),
          batchKey: textOrNull(run.batch_key, 160),
          stage: textOrNull(run.stage, 60),
          sourceCount: num(run.source_count),
          teacherModelId: textOrNull(run.teacher_model_id, 160),
          teacherModelRevision: textOrNull(run.teacher_model_revision, 120),
          studentModelRevision: textOrNull(run.student_model_revision, 120),
          promptSetHash: textOrNull(run.prompt_set_hash, 64),
          teacherOutputCount: Array.isArray(outputs) ? outputs.length : (outputs && typeof outputs === 'object' ? Object.keys(outputs).length : null),
          datasetHash: textOrNull(run.dataset_hash, 64),
          trainingManifestHash: textOrNull(run.training_manifest_hash, 64),
          holdoutManifestHash: textOrNull(run.holdout_manifest_hash, 64),
          failureReason: textOrNull(run.failure_reason, 300),
          completedAt: iso(run.completed_at),
        }) : null,
        teacherRows: teacherRows.length,
        teacherByProviderModel: countBy(teacherRows, row => `${text(row.provider, 40)}:${text(row.model, 120)}`),
        distinctPrompts: new Set(teacherRows.map((row: any) => text(row.prompt_id, 120)).filter(Boolean)).size,
      }
    }),
    chapter(async () => {
      const list = await rows(db.from('cos_university_distilled_evaluation_runs')
        .select('run_key,created_at,evaluator_id,evaluator_version,holdout_case_count,baseline_score,trained_artifact_score,safety_score,safety_baseline_score,transfer_baseline_score,transfer_artifact_score,retention_baseline_score,retention_artifact_score,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed')
        .eq('candidate_id', candidateId).eq('trained_artifact_hash', hash).order('created_at', { ascending: false }).limit(LIFE_RECORD_EXAM_LIMIT))
      const bool = (v: unknown) => typeof v === 'boolean' ? v : null
      const runs = list.map((row: any) => {
        const passedAll = row.holdout_improved === true && row.safety_passed === true && row.unseen_transfer_passed === true && row.delayed_retention_passed === true
        return Object.freeze({
          runKey: text(row.run_key, 120),
          at: iso(row.created_at),
          evaluatorId: textOrNull(row.evaluator_id, 240),
          evaluatorVersion: textOrNull(row.evaluator_version, 80),
          holdout: Object.freeze({ baseline: num(row.baseline_score), artifact: num(row.trained_artifact_score), improved: bool(row.holdout_improved), cases: num(row.holdout_case_count) }),
          safety: Object.freeze({ baseline: num(row.safety_baseline_score), artifact: num(row.safety_score), passed: bool(row.safety_passed) }),
          transfer: Object.freeze({ baseline: num(row.transfer_baseline_score), artifact: num(row.transfer_artifact_score), passed: bool(row.unseen_transfer_passed) }),
          retention: Object.freeze({ baseline: num(row.retention_baseline_score), artifact: num(row.retention_artifact_score), passed: bool(row.delayed_retention_passed) }),
          passedAll,
        })
      })
      return { runs: Object.freeze(runs), total: runs.length, passedAll: runs.filter(r => r.passedAll).length }
    }),
    chapter(async () => {
      const list = await rows(db.from('cos_university_learning_assurance_events')
        .select('event_type,path_id,verifier,observed_at,evidence')
        .eq('candidate_id', candidateId).order('observed_at', { ascending: false }).limit(LIFE_RECORD_EVENT_LIMIT))
      const events = list.map((row: any) => Object.freeze({
        at: iso(row.observed_at),
        type: text(row.event_type, 80),
        path: textOrNull(row.path_id, 80),
        claim: textOrNull(row.evidence?.claim ?? row.evidence?.status, 120),
        error: textOrNull(row.evidence?.error, 200),
        verifier: textOrNull(row.verifier, 80),
      }))
      return {
        events: Object.freeze(events),
        total: events.length,
        byType: countBy(events, e => e.type),
        failures: countBy(events.filter(e => e.error), e => text(e.error, 80)),
      }
    }),
    chapter(async () => {
      const enrollment = await one(db.from('cos_university_residency_enrollments')
        .select('id,program_id,standing,admitted_at,completed_at')
        .eq('candidate_id', candidateId).eq('trained_artifact_hash', hash).order('created_at', { ascending: false }).limit(1).maybeSingle())
      const cases = enrollment
        ? await rows(db.from('cos_university_residency_case_runs').select('harness_outcome,competency_id,failure_code,status').eq('residency_id', enrollment.id).limit(LIFE_RECORD_CASE_LIMIT))
        : []
      return {
        enrolled: Boolean(enrollment),
        standing: textOrNull(enrollment?.standing, 60),
        programId: textOrNull(enrollment?.program_id, 120),
        admittedAt: iso(enrollment?.admitted_at),
        completedAt: iso(enrollment?.completed_at),
        cases: cases.length,
        casesByOutcome: countBy(cases, row => text(row.harness_outcome ?? row.status, 60)),
        competenciesDemonstrated: new Set(cases.filter((row: any) => text(row.harness_outcome, 60) === 'passed').map((row: any) => text(row.competency_id, 120))).size,
        failureCodes: countBy(cases.filter((row: any) => row.failure_code), row => text(row.failure_code, 80)),
      }
    }),
    chapter(async () => {
      const g = await one(db.from('cos_university_graduate_model_registry')
        .select('id,status,runtime_provider,runtime_model_id,promoted_at,activated_at,quarantined_at,retired_at,promotion_evidence_hash,activation_evidence_hash')
        .eq('candidate_id', candidateId).eq('trained_artifact_hash', hash).order('created_at', { ascending: false }).limit(1).maybeSingle())
      return {
        registered: Boolean(g),
        registryId: textOrNull(g?.id, 80),
        status: textOrNull(g?.status, 60),
        runtimeProvider: textOrNull(g?.runtime_provider, 80),
        runtimeModelId: textOrNull(g?.runtime_model_id, 160),
        promotedAt: iso(g?.promoted_at),
        activatedAt: iso(g?.activated_at),
        quarantinedAt: iso(g?.quarantined_at),
        retiredAt: iso(g?.retired_at),
        promotionEvidenceHash: textOrNull(g?.promotion_evidence_hash, 64),
        activationEvidenceHash: textOrNull(g?.activation_evidence_hash, 64),
      }
    }),
    chapter(async () => {
      const roster = await one(db.from('cos_workforce_roster')
        .select('specialty,job_roles,status,hired_at,retired_at,retired_reason')
        .eq('candidate_id', candidateId).eq('trained_artifact_hash', hash).order('hired_at', { ascending: false }).limit(1).maybeSingle())
      const events = await rows(db.from('cos_university_graduate_lifecycle_events')
        .select('event_type,observed_at,evidence_hash')
        .eq('candidate_id', candidateId).eq('trained_artifact_hash', hash).order('observed_at', { ascending: false }).limit(LIFE_RECORD_ATTEMPT_LIMIT))
      const recent = events.slice(0, LIFE_RECORD_EVENT_LIMIT).map((row: any) => Object.freeze({ at: iso(row.observed_at), type: text(row.event_type, 60), evidenceHash: textOrNull(row.evidence_hash, 64) }))
      const times = events.map((row: any) => iso(row.observed_at)).filter(Boolean) as string[]
      return {
        hired: Boolean(roster),
        specialty: textOrNull(roster?.specialty, 160),
        jobRoles: Object.freeze(Array.isArray(roster?.job_roles) ? roster.job_roles.map((r: unknown) => text(r, 40)).filter(Boolean) : []),
        status: textOrNull(roster?.status, 40),
        hiredAt: iso(roster?.hired_at),
        retiredAt: iso(roster?.retired_at),
        retiredReason: textOrNull(roster?.retired_reason, 200),
        lifecycle: Object.freeze({
          total: events.length,
          byType: countBy(events, row => text(row.event_type, 60)),
          firstAt: times.length ? times[times.length - 1] : null,
          lastAt: times.length ? times[0] : null,
          recent: Object.freeze(recent),
        }),
      }
    }),
    chapter(async () => {
      const attempts = await rows(db.from('cos_university_graduate_serving_attempts')
        .select('phase,outcome,worker_role,error_class,recorded_at')
        .eq('candidate_id', candidateId).eq('trained_artifact_hash', hash).order('recorded_at', { ascending: false }).limit(LIFE_RECORD_ATTEMPT_LIMIT))
      const times = attempts.map((row: any) => iso(row.recorded_at)).filter(Boolean) as string[]
      return {
        attempts: attempts.length,
        byPhase: countBy(attempts, row => text(row.phase, 40)),
        byOutcome: countBy(attempts, row => text(row.outcome, 40)),
        byRole: countBy(attempts, row => text(row.worker_role, 40)),
        errorClasses: countBy(attempts.filter((row: any) => row.error_class), row => text(row.error_class, 80)),
        firstAt: times.length ? times[times.length - 1] : null,
        lastAt: times.length ? times[0] : null,
      }
    }),
  ])

  const left = status === 'quarantined' || status === 'retired'
  const departureEvent = universityHistory.available
    ? universityHistory.events.find(e => /dismiss|quarantin|retire|superseded/i.test(`${e.claim ?? ''} ${e.type}`))
    : undefined
  const departure = Object.freeze({
    left,
    status: left ? status : null,
    reason: left ? (departureEvent?.claim ?? departureEvent?.error ?? (graduation.available && graduation.status === 'retired' ? 'graduate_retired' : null)) : null,
    at: left ? (departureEvent?.at ?? (graduation.available ? (graduation.retiredAt ?? graduation.quarantinedAt) : null) ?? iso(artifact.updated_at)) : null,
  })

  return Object.freeze({
    ok: true as const,
    record: Object.freeze({
      schemaVersion: LIFE_RECORD_SCHEMA_VERSION,
      generatedAt: (input.now ?? new Date()).toISOString(),
      lookup,
      sources: SOURCES,
      identity: Object.freeze({
        permanentArtifactId: permanentId,
        candidateId,
        trainedArtifactHash: hash,
        artifactKind: textOrNull(artifact.artifact_kind, 60),
        subjectId: textOrNull(artifact.subject_id, 120),
        status,
        createdAt: iso(artifact.created_at),
        updatedAt: iso(artifact.updated_at),
        runtimeTarget: textOrNull(artifact.runtime_target, 80),
        intendedUse: textOrNull(artifact.intended_use, 120),
      }),
      birth,
      curriculum,
      examinations,
      universityHistory,
      residency,
      graduation,
      employment,
      work,
      departure,
      authorityExpanded: false as const,
    }),
  })
}

/** One line per life: what a reader sees first, and what a log can carry. */
export function describeArtifactLife(record: ArtifactLifeRecord): string {
  const exams = record.examinations.available ? `${record.examinations.passedAll}/${record.examinations.total} exams passed` : 'exams unavailable'
  const work = record.work.available ? `${record.work.attempts} serving attempts (${record.work.byOutcome.success ?? 0} success)` : 'work unavailable'
  const born = record.birth.available && record.birth.bornAt ? record.birth.bornAt : (record.identity.createdAt ?? 'unknown')
  return `ai_id=${record.identity.permanentArtifactId} status=${record.identity.status} born=${born} | ${exams} | `
    + `${record.graduation.available && record.graduation.registered ? `graduated=${record.graduation.promotedAt ?? 'pending'}` : 'not graduated'} | ${work}`
    + (record.departure.left ? ` | left=${record.departure.status}:${record.departure.reason ?? 'reason_not_recorded'}` : '')
}
// end of saas/lib/ai/cos/cosUniversityArtifactLifeRecord.ts (if this line is missing, the paste was cut short)
