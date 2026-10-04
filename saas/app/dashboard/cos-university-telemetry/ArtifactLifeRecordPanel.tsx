// saas/app/dashboard/cos-university-telemetry/ArtifactLifeRecordPanel.tsx
//
// The VIN lookup on the University telemetry page: type a permanent artifact ID (or candidate ID / artifact hash) and
// read the artifact's whole life, chapter by chapter, each chapter naming its source table. Read-only.
'use client'

import { useState } from 'react'
import type { ArtifactLifeRecord } from '@/lib/ai/cos/cosUniversityArtifactLifeRecord'
import type { CosUniversityLifeRecordCopy } from '@/lib/i18n/cosUniversityLifeRecordCopy'

const LIFE_URL = '/api/admin/cos-university-artifact-life'

type Response = { ok?: boolean; error?: string; summary?: string; record?: ArtifactLifeRecord }

const when = (value: string | null | undefined): string => {
  if (!value) return '—'
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? value : at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}
const short = (value: string | null | undefined, n = 20): string => !value ? '—' : value.length > n ? `${value.slice(0, n)}…` : value
const score = (value: number | null): string => value === null ? '—' : value.toFixed(3)
const counts = (record: Readonly<Record<string, number>>): string => {
  const entries = Object.entries(record)
  return entries.length ? entries.sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ') : '—'
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-xs">
      <span className="opacity-60">{label}:</span>
      <span className={mono ? 'font-mono' : ''} style={{ overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

function Chapter({ title, source, available, error, unavailableLabel, sourcesLabel, children }: {
  title: string; source: string; available: boolean; error: string | null; unavailableLabel: string; sourcesLabel: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="font-semibold">{title}</div>
      <div className="mb-2 text-[10px] opacity-50">{sourcesLabel}: {source}</div>
      {available ? children : <p className="text-xs" role="alert">{unavailableLabel}{error ? ` · ${error}` : ''}</p>}
    </div>
  )
}

export default function ArtifactLifeRecordPanel({ copy }: { copy: CosUniversityLifeRecordCopy }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState('')
  const [record, setRecord] = useState<ArtifactLifeRecord | null>(null)

  async function lookup() {
    const id = key.trim()
    if (!id) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(`${LIFE_URL}?id=${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' })
      const body = await response.json().catch(() => ({})) as Response
      if (!response.ok || body.ok !== true || !body.record) {
        setRecord(null)
        setSummary('')
        setMessage(body.error === 'lookup_key_invalid' ? copy.invalidKey : body.error === 'artifact_not_found' ? copy.notFound : (body.error || copy.requestFailed))
        return
      }
      setRecord(body.record)
      setSummary(body.summary || '')
    } catch (err) {
      setRecord(null)
      setMessage(err instanceof Error ? err.message : copy.requestFailed)
    } finally {
      setBusy(false)
    }
  }

  const r = record
  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">{copy.title}</h2>
      <p className="mt-1 text-xs opacity-65">{copy.explanation}</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void lookup() }}>
        <label className="text-xs opacity-75" htmlFor="university-artifact-life-key">
          {copy.inputLabel}
          <input id="university-artifact-life-key" type="text" value={key} placeholder={copy.inputPlaceholder} spellCheck={false}
            onChange={event => setKey(event.target.value)} disabled={busy}
            className="mt-1 block w-[28rem] max-w-full rounded-md border bg-transparent px-3 py-2 font-mono text-sm" />
        </label>
        <button type="submit" disabled={busy || !key.trim()} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{busy ? copy.looking : copy.lookup}</button>
      </form>
      {message ? <p className="mt-3 text-sm" role="alert">{message}</p> : null}
      {summary ? <p className="mt-3 font-mono text-xs" style={{ overflowWrap: 'anywhere' }}>{summary}</p> : null}

      {r ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Chapter title={copy.identity} source={r.sources.identity} available error={null} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            <Row label={copy.identityId} value={r.identity.permanentArtifactId || '—'} mono />
            <Row label={copy.identityCandidate} value={r.identity.candidateId} mono />
            <Row label={copy.identityHash} value={r.identity.trainedArtifactHash} mono />
            <Row label={copy.identityKind} value={r.identity.artifactKind || '—'} />
            <Row label={copy.identitySubject} value={r.identity.subjectId || '—'} />
            <Row label={copy.identityStatus} value={r.identity.status} />
            <Row label={copy.identityCreated} value={when(r.identity.createdAt)} />
          </Chapter>

          <Chapter title={copy.birth} source={r.sources.birth} available={r.birth.available} error={r.birth.available ? null : r.birth.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.birth.available && !r.birth.issued ? <p className="text-xs">{copy.birthNotIssued}</p> : null}
            {r.birth.available && r.birth.issued ? (
              <>
                <Row label={copy.birthIssuance} value={r.birth.issuanceKind || '—'} />
                <Row label={copy.birthBornAt} value={when(r.birth.bornAt)} />
                <Row label={copy.birthCreator} value={`${r.birth.creator || '—'} / ${r.birth.issuingSystem || '—'}`} />
                <Row label={copy.birthStudentModel} value={r.birth.studentModelId || '—'} mono />
                <Row label={copy.birthTeacherModel} value={r.birth.teacherModelId || '—'} mono />
                <Row label={copy.birthParent} value={r.birth.parentPermanentArtifactId || '—'} mono />
                <Row label={copy.birthChildren} value={r.birth.children.length ? r.birth.children.join(', ') : '—'} mono />
                <Row label={copy.birthDataset} value={short(r.birth.datasetHash, 24)} mono />
                <Row label={copy.birthRevision} value={short(r.birth.revisionKey, 24)} mono />
              </>
            ) : null}
          </Chapter>

          <Chapter title={copy.curriculum} source={r.sources.curriculum} available={r.curriculum.available} error={r.curriculum.available ? null : r.curriculum.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.curriculum.available ? (
              <>
                {r.curriculum.batchRun ? (
                  <>
                    <Row label={copy.curriculumStage} value={r.curriculum.batchRun.stage || '—'} />
                    <Row label={copy.curriculumSources} value={r.curriculum.batchRun.sourceCount === null ? '—' : String(r.curriculum.batchRun.sourceCount)} />
                    <Row label={copy.curriculumTeacher} value={`${r.curriculum.batchRun.teacherModelId || '—'}${r.curriculum.batchRun.teacherModelRevision ? ' @ ' + short(r.curriculum.batchRun.teacherModelRevision, 16) : ''}`} mono />
                    <Row label={copy.curriculumTeacherOutputs} value={r.curriculum.batchRun.teacherOutputCount === null ? '—' : String(r.curriculum.batchRun.teacherOutputCount)} />
                    {r.curriculum.batchRun.failureReason ? <Row label={copy.curriculumFailure} value={r.curriculum.batchRun.failureReason} /> : null}
                  </>
                ) : <p className="text-xs">{copy.curriculumNoRun}</p>}
                <Row label={copy.curriculumTeacherRows} value={String(r.curriculum.teacherRows)} />
                <Row label={copy.curriculumDistinctPrompts} value={String(r.curriculum.distinctPrompts)} />
                <Row label={copy.curriculumByProvider} value={counts(r.curriculum.teacherByProviderModel)} mono />
              </>
            ) : null}
          </Chapter>

          <Chapter title={copy.examinations} source={r.sources.examinations} available={r.examinations.available} error={r.examinations.available ? null : r.examinations.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.examinations.available ? (
              r.examinations.total === 0 ? <p className="text-xs">{copy.examinationsNone}</p> : (
                <>
                  <p className="text-xs">{r.examinations.total} {copy.examinationsSummary}: {r.examinations.passedAll}</p>
                  <div className="mt-2 space-y-2">
                    {r.examinations.runs.map(run => (
                      <div key={run.runKey} className="rounded border p-2 text-[11px]">
                        <div className="font-mono opacity-70">{when(run.at)} · {short(run.evaluatorId, 36)} · {copy.examAll}: {run.passedAll ? copy.examPassed : copy.examFailed}</div>
                        <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 sm:grid-cols-4">
                          <span>{copy.examHoldout}: {score(run.holdout.baseline)} → {score(run.holdout.artifact)} · {run.holdout.improved ? copy.examPassed : copy.examFailed}</span>
                          <span>{copy.examSafety}: {score(run.safety.baseline)} → {score(run.safety.artifact)} · {run.safety.passed ? copy.examPassed : copy.examFailed}</span>
                          <span>{copy.examTransfer}: {score(run.transfer.baseline)} → {score(run.transfer.artifact)} · {run.transfer.passed ? copy.examPassed : copy.examFailed}</span>
                          <span>{copy.examRetention}: {score(run.retention.baseline)} → {score(run.retention.artifact)} · {run.retention.passed ? copy.examPassed : copy.examFailed}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : null}
          </Chapter>

          <Chapter title={copy.history} source={r.sources.universityHistory} available={r.universityHistory.available} error={r.universityHistory.available ? null : r.universityHistory.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.universityHistory.available ? (
              r.universityHistory.total === 0 ? <p className="text-xs">{copy.historyNone}</p> : (
                <>
                  <Row label="" value={counts(r.universityHistory.byType)} mono />
                  {Object.keys(r.universityHistory.failures).length ? <Row label={copy.historyFailures} value={counts(r.universityHistory.failures)} mono /> : null}
                  <div className="mt-2 max-h-48 space-y-0.5 overflow-auto font-mono text-[11px]">
                    {r.universityHistory.events.map((e, i) => (
                      <div key={`${e.at}-${i}`} style={{ overflowWrap: 'anywhere' }}>{when(e.at)} · {e.type}{e.path ? ` · ${e.path}` : ''}{e.claim ? ` · ${e.claim}` : ''}{e.error ? ` · ${e.error}` : ''}</div>
                    ))}
                  </div>
                </>
              )
            ) : null}
          </Chapter>

          <Chapter title={copy.residency} source={r.sources.residency} available={r.residency.available} error={r.residency.available ? null : r.residency.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.residency.available ? (
              !r.residency.enrolled ? <p className="text-xs">{copy.residencyNotEnrolled}</p> : (
                <>
                  <Row label={copy.residencyStanding} value={`${r.residency.standing || '—'} · ${r.residency.programId || '—'}`} />
                  <Row label={copy.residencyCases} value={`${r.residency.cases} · ${counts(r.residency.casesByOutcome)}`} mono />
                  <Row label={copy.residencyCompetencies} value={String(r.residency.competenciesDemonstrated)} />
                  {Object.keys(r.residency.failureCodes).length ? <Row label={copy.historyFailures} value={counts(r.residency.failureCodes)} mono /> : null}
                </>
              )
            ) : null}
          </Chapter>

          <Chapter title={copy.graduation} source={r.sources.graduation} available={r.graduation.available} error={r.graduation.available ? null : r.graduation.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.graduation.available ? (
              !r.graduation.registered ? <p className="text-xs">{copy.graduationNone}</p> : (
                <>
                  <Row label={copy.graduationStatus} value={r.graduation.status || '—'} />
                  <Row label={copy.graduationRuntime} value={`${r.graduation.runtimeProvider || '—'} · ${r.graduation.runtimeModelId || '—'}`} mono />
                  <Row label={copy.graduationPromoted} value={when(r.graduation.promotedAt)} />
                  <Row label={copy.graduationActivated} value={when(r.graduation.activatedAt)} />
                </>
              )
            ) : null}
          </Chapter>

          <Chapter title={copy.employment} source={r.sources.employment} available={r.employment.available} error={r.employment.available ? null : r.employment.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.employment.available ? (
              <>
                {!r.employment.hired ? <p className="text-xs">{copy.employmentNotHired}</p> : (
                  <>
                    <Row label={copy.employmentSpecialty} value={r.employment.specialty || '—'} />
                    <Row label={copy.employmentRoles} value={r.employment.jobRoles.join(' · ') || '—'} />
                    <Row label={copy.employmentHired} value={`${when(r.employment.hiredAt)} · ${r.employment.status || '—'}${r.employment.retiredReason ? ' · ' + r.employment.retiredReason : ''}`} />
                  </>
                )}
                <Row label={copy.employmentLifecycle} value={`${r.employment.lifecycle.total} · ${counts(r.employment.lifecycle.byType)}`} mono />
              </>
            ) : null}
          </Chapter>

          <Chapter title={copy.work} source={r.sources.work} available={r.work.available} error={r.work.available ? null : r.work.error} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {r.work.available ? (
              r.work.attempts === 0 ? <p className="text-xs">{copy.workNone}</p> : (
                <>
                  <Row label={copy.workAttempts} value={`${r.work.attempts} · ${counts(r.work.byPhase)}`} mono />
                  <Row label={copy.workOutcomes} value={counts(r.work.byOutcome)} mono />
                  <Row label={copy.workRoles} value={counts(r.work.byRole)} mono />
                  {Object.keys(r.work.errorClasses).length ? <Row label={copy.workErrors} value={counts(r.work.errorClasses)} mono /> : null}
                  <Row label={copy.workFirst} value={when(r.work.firstAt)} />
                  <Row label={copy.workLast} value={when(r.work.lastAt)} />
                </>
              )
            ) : null}
          </Chapter>

          <Chapter title={copy.departure} source={r.sources.departure} available error={null} unavailableLabel={copy.chapterUnavailable} sourcesLabel={copy.sources}>
            {!r.departure.left ? <p className="text-xs">{copy.departureStillHere}</p> : (
              <>
                <Row label={copy.departureLeft} value={`${r.departure.status} · ${when(r.departure.at)}`} />
                <Row label={copy.departureReason} value={r.departure.reason || copy.departureReasonUnknown} />
              </>
            )}
          </Chapter>
        </div>
      ) : null}
    </section>
  )
}
// end of saas/app/dashboard/cos-university-telemetry/ArtifactLifeRecordPanel.tsx (if this line is missing, the paste was cut short)
