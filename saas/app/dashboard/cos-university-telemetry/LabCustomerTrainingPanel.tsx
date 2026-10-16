// saas/app/dashboard/cos-university-telemetry/LabCustomerTrainingPanel.tsx
//
// Customer LAB: your provider keys → choose teacher + training provider → train → progress → download.
// Keys are typed once, sent to the server, encrypted, and never shown again. No graduation is required to download.
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fmt, type LabCustomerTrainingCopy } from '@/lib/i18n/labCustomerTrainingCopy'
import { ADD_KEY_OPTION, providerOptions, sortProviders, type ProviderOption } from '@/lib/lab/labProviderOptions'
import { cleanPastedKey, detectProviderFromKey } from '@/lib/lab/labKeyEntry'
import { LAB_OPEN_SOURCES } from '@/lib/lab/labOpenSources'
import { previewLabDataset, previewLabPrompts } from '@/lib/lab/labDatasetPreflight'
import LabCustomerModelPassport from './LabCustomerModelPassport.tsx'
import LabCustomerResponseComparison from './LabCustomerResponseComparison.tsx'
import LabCustomerTrainingAdvisor from './LabCustomerTrainingAdvisor.tsx'
import LabCustomerRunTimeline from './LabCustomerRunTimeline.tsx'
import LabCustomerFailureGuidance from './LabCustomerFailureGuidance.tsx'
import LabOrganizationDiagnostics from './LabOrganizationDiagnostics.tsx'
import LabCustomerHoldoutEvaluation from './LabCustomerHoldoutEvaluation.tsx'

type Org = { organizationId: string; organizationName: string; experimentId: string; projectName: string; role: string }
type CatalogEntry = { kind: string; name: string; supports: Record<string, boolean>; unsupported: Record<string, string>; keyHelp: string }
type Credential = { id: string; providerKind: string; label: string; endpoint: string | null; createdAt: string }
type Run = {
  runId: string; stage: string; progressPercent: number; statusMessage: string | null; teacherProviderKind: string; teacherModel: string
  baseModel: string; hfJobUrl: string | null; artifactRepo: string | null
  artifactRevision: string | null; artifactHash?: string | null; failureCode: string | null; createdAt: string
  computeProviderKind?: string; tunedModelId?: string | null
}
type ModelOption = { id: string; label: string }
type TeacherModelOption = { id: string }
// Build marker shown in the header (an identifier, not translatable copy).
const LAB_UI_VERSION = 'LAB UI v2026.10.12.10'
// Providers whose training jobs are polled through the training route (no worker callback).
const POLLED_TRAINING = new Set(['together', 'fireworks'])
// Training providers whose base-model list is public, so it shows before a key is saved.
const PUBLIC_MODEL_DIRECTORY = new Set(['huggingface'])
const DATASET_PREFLIGHT_LABELS: Record<string, string[]> = {
  en: ["Dataset preflight (local, no provider calls)","Unique prompts","Invalid rows","Exact duplicates","Conflicting answers","Overlong fields","Beyond 128-item limit","Ready for review","Fix issues before training","Review source licenses and personal data before training."],
  es: ["Revisión previa de datos (local, sin llamadas externas)","Preguntas únicas","Filas inválidas","Duplicados exactos","Respuestas contradictorias","Campos demasiado largos","Más del límite de 128","Listo para revisar","Corrija los problemas antes de entrenar","Revise licencias y datos personales."],
  pt: ["Pré-verificação dos dados (local, sem chamadas externas)","Perguntas únicas","Linhas inválidas","Duplicatas exatas","Respostas conflitantes","Campos longos demais","Acima do limite de 128","Pronto para revisão","Corrija os problemas antes do treino","Verifique licenças e dados pessoais."],
  pl: ["Wstępna kontrola danych (lokalna, bez połączeń)","Unikalne pytania","Błędne wiersze","Identyczne duplikaty","Sprzeczne odpowiedzi","Zbyt długie pola","Powyżej limitu 128","Gotowe do przeglądu","Popraw dane przed treningiem","Sprawdź licencje i dane osobowe."],
  ru: ["Предпроверка данных (локально, без запросов)","Уникальные запросы","Ошибочные строки","Точные дубликаты","Противоречивые ответы","Длинные поля","Сверх лимита 128","Готово к проверке","Исправьте ошибки до обучения","Проверьте лицензии и персональные данные."],
  de: ["Datensatzprüfung (lokal, ohne Anbieteraufrufe)","Eindeutige Fragen","Ungültige Zeilen","Exakte Duplikate","Widersprüchliche Antworten","Zu lange Felder","Über dem Limit von 128","Bereit zur Prüfung","Vor dem Training korrigieren","Lizenzen und personenbezogene Daten prüfen."],
  fr: ["Précontrôle des données (local, sans appel externe)","Questions uniques","Lignes invalides","Doublons exacts","Réponses contradictoires","Champs trop longs","Au-delà de la limite de 128","Prêt à vérifier","Corriger avant l'entraînement","Vérifiez licences et données personnelles."],
  it: ["Controllo dati (locale, senza chiamate esterne)","Domande uniche","Righe non valide","Duplicati esatti","Risposte in conflitto","Campi troppo lunghi","Oltre il limite di 128","Pronto per la verifica","Correggi prima dell'addestramento","Verifica licenze e dati personali."],
  ja: ["データ事前確認（ローカル・外部呼び出しなし）","固有の質問","無効な行","完全な重複","矛盾する回答","長すぎる項目","128件の上限超過","確認できます","学習前に修正してください","ライセンスと個人情報を確認してください。"],
  ko: ["데이터 사전 검사(로컬, 외부 호출 없음)","고유 질문","잘못된 행","완전 중복","상충하는 답변","너무 긴 필드","128개 제한 초과","검토 준비 완료","학습 전에 수정하세요","라이선스와 개인정보를 확인하세요."],
  ar: ["فحص البيانات المسبق (محلي، دون اتصال خارجي)","أسئلة فريدة","صفوف غير صالحة","تكرارات متطابقة","إجابات متعارضة","حقول طويلة جدًا","تجاوز حد 128","جاهز للمراجعة","صحح المشاكل قبل التدريب","راجع التراخيص والبيانات الشخصية."],
}
const BASE_MODEL_ID: Record<string, RegExp> = {
  huggingface: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, together: /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
  fireworks: /^accounts\/[a-z0-9-]+\/models\/[A-Za-z0-9_.-]+$/,
}

export default function LabCustomerTrainingPanel({ copy, language = 'en' }: { copy: LabCustomerTrainingCopy; language?: string }) {
  const explain = (code: string) => copy.errors[code] ?? fmt(copy.unknownError, { code })
  const [orgs, setOrgs] = useState<Org[]>([])
  const [orgKey, setOrgKey] = useState('')
  const activeOrgRef = useRef('')
  const [catalog, setCatalog] = useState<CatalogEntry[]>([])
  const [credentials, setCredentials] = useState<Credential[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [workspaceLoad, setWorkspaceLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  // key form
  const [keyKind, setKeyKind] = useState('')
  // True while the provider was chosen from the pasted key, so a later paste may re-detect it.
  const [keyKindDetected, setKeyKindDetected] = useState(false)
  const [keyValue, setKeyValue] = useState('')
  const [keyEndpoint, setKeyEndpoint] = useState('')
  // run form
  const [teacherProviderKind, setTeacherProviderKind] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [teacherModel, setTeacherModel] = useState('')
  const [teacherModelChoice, setTeacherModelChoice] = useState('')
  const [computeId, setComputeId] = useState('')
  const [baseModel, setBaseModel] = useState('')
  const [modelSelection, setModelSelection] = useState('')
  const [modelSuggestions, setModelSuggestions] = useState<ModelOption[]>([])
  const [modelsError, setModelsError] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [teacherModels, setTeacherModels] = useState<TeacherModelOption[]>([])
  const [teacherModelsLoading, setTeacherModelsLoading] = useState(false)
  const [teacherModelsError, setTeacherModelsError] = useState(false)
  const [prompts, setPrompts] = useState('')
  const [source, setSource] = useState<'examples' | 'teacher' | 'open_sources'>('examples')
  // Open sources: a topic plus the sources to search (all ticked by default, so most people only type the topic).
  const [openTopic, setOpenTopic] = useState('')
  const [openPicked, setOpenPicked] = useState<string[]>(() => LAB_OPEN_SOURCES.map(item => item.id))
  const [openNote, setOpenNote] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null)
  const [examples, setExamples] = useState('')
  const [files, setFiles] = useState<Record<string, { path: string; size: number }[]>>({})
  // The customer confirms on every start that their own providers bill them for this run (the platform does not price it).
  const [billingConfirmed, setBillingConfirmed] = useState(false)

  const [organizationId, experimentId] = orgKey.split('|')
  const org = orgs.find(item => `${item.organizationId}|${item.experimentId}` === orgKey)
  const canManage = org?.role === 'owner' || org?.role === 'admin'
  const entry = (kind: string) => catalog.find(item => item.kind === kind)
  const computeCredentials = credentials.filter(item => entry(item.providerKind)?.supports['training.execute'])
  const [computeProviderKind, setComputeProviderKind] = useState('')
  const selectedComputeCredentials = computeCredentials.filter(item => item.providerKind === computeProviderKind)
  const teacherCredentials = credentials.filter(item => entry(item.providerKind)?.supports['teacher.generate'])
  // Dropdowns list only providers this workspace has a saved key for, so every option can actually be used.
  const connectedKinds = new Set(credentials.map(item => item.providerKind))
  // Every provider is listed alphabetically ("Other" last). Only providers that can do the job AND have a saved key
  // can be selected; the rest stay visible, disabled, with the reason, so the list never looks empty or broken.
  const sortedCatalog = sortProviders(catalog, language)
  const teacherOptions = providerOptions(catalog, connectedKinds, 'teacher.generate', language)
  const trainingOptions = providerOptions(catalog, connectedKinds, 'training.execute', language)
  const optionLabel = (item: ProviderOption) => item.blocked ? `${item.name} ${copy.teacherOnly}` : item.hasKey ? item.name : `${item.name} ${copy.addKeyFirst}`
  // Picking a provider with exactly one saved account selects that account, so the next dropdown is ready.
  const onlyAccount = (kind: string) => { const matches = credentials.filter(item => item.providerKind === kind); return matches.length === 1 ? matches[0].id : '' }
  // A key can be added right where it is needed: the account dropdown opens this inline form for its provider.
  const [inlineKey, setInlineKey] = useState<{ target: 'teacher' | 'training'; kind: string } | null>(null)
  const [inlineValue, setInlineValue] = useState('')
  const [inlineEndpoint, setInlineEndpoint] = useState('')
  // Save results are shown next to the Save button that was clicked, not at the top of the panel.
  const [keyFeedback, setKeyFeedback] = useState<{ where: 'section1' | 'teacher' | 'training'; kind: 'status' | 'alert'; text: string } | null>(null)
  const feedbackFor = (where: 'section1' | 'teacher' | 'training') => keyFeedback?.where === where &&
    <p role={keyFeedback.kind} className={`text-xs ${keyFeedback.kind === 'alert' ? 'text-amber-200' : 'text-emerald-300'}`}>{keyFeedback.text}</p>
  // Why Save is disabled, in words, so the button never looks dead.
  const keyFormProblem = (value: string, endpoint: string, kind: string) =>
    !cleanPastedKey(value) ? copy.keyFormNeeds : kind === 'openai_compatible' && !endpoint.trim() ? copy.keyEndpointNeeded : null
  const providerName = (kind: string) => entry(kind)?.name ?? kind
  // Paste the key: if its prefix names one provider, that provider is selected (unless the person chose one by hand).
  const onKeyPasted = (raw: string) => {
    setKeyValue(raw)
    const detected = detectProviderFromKey(raw)
    if (detected && catalog.some(item => item.kind === detected) && (!keyKind || keyKindDetected)) { setKeyKind(detected); setKeyKindDetected(true) }
  }
  const savedText = (check: unknown) => check === 'valid' ? copy.keySaved : copy.keyUnverified
  const openInlineKey = (target: 'teacher' | 'training', kind: string) => { setInlineKey(kind ? { target, kind } : null); setInlineValue(''); setInlineEndpoint('') }
  // Choosing a provider with no saved account opens the key form at once; with exactly one, that account is selected.
  const pickProvider = (target: 'teacher' | 'training', kind: string) => {
    const account = onlyAccount(kind)
    if (target === 'teacher') setTeacherId(account); else setComputeId(account)
    openInlineKey(target, kind && !credentials.some(item => item.providerKind === kind) ? kind : '')
  }
  const baseModelValid = Boolean(BASE_MODEL_ID[computeProviderKind]?.test(baseModel))
  const selectedTeacherCredentials = teacherCredentials.filter(item => item.providerKind === teacherProviderKind)
  const promptPreview = useMemo(() => previewLabPrompts(prompts), [prompts])
  const promptCount = promptPreview.uniquePrompts
  const exampleCount = useMemo(() => examples.split('\n').filter(line => { try { const o = JSON.parse(line); return o?.prompt && o?.response } catch { return false } }).length, [examples])
  const preflight = useMemo(() => previewLabDataset(examples), [examples])
  const preflightLabels = DATASET_PREFLIGHT_LABELS[language] ?? DATASET_PREFLIGHT_LABELS.en
  const itemCount = source === 'teacher' ? promptCount : preflight.uniquePrompts

  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/lab/experiments', { credentials: 'include', cache: 'no-store' }).catch(() => null)
      const body = await response?.json().catch(() => null)
      if (!response?.ok || !body?.ok || !Array.isArray(body.experiments)) {
        setWorkspaceLoad('error')
        setMessage({ kind: 'alert', text: fmt(copy.loadFailed, { code: body?.error || 'network' }) })
        return
      }
      const list: Org[] = body.experiments
      setOrgs(list)
      if (list[0]) { activeOrgRef.current = list[0].organizationId; setOrgKey(`${list[0].organizationId}|${list[0].experimentId}`) }
      setWorkspaceLoad('ready')
    })()
  }, [copy])

  async function initializeWorkspace() {
    setBusy(true)
    try {
      const response = await fetch('/api/lab/workspace', { method: 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationName: copy.defaultWorkspaceName }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error || 'lab_request_failed')
      setOrgs([body.workspace])
      setWorkspaceLoad('ready')
      activeOrgRef.current = body.workspace.organizationId
      setOrgKey(`${body.workspace.organizationId}|${body.workspace.experimentId}`)
    } catch (error) {
      setMessage({ kind: 'alert', text: fmt(copy.loadFailed, { code: error instanceof Error ? error.message : 'lab_request_failed' }) })
    } finally { setBusy(false) }
  }

  const load = useCallback(async () => {
    if (!organizationId || activeOrgRef.current !== organizationId) return
    const [providers, training] = await Promise.all([
      fetch(`/api/lab/providers?organizationId=${organizationId}`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => null),
      fetch(`/api/lab/training?organizationId=${organizationId}`, { credentials: 'include', cache: 'no-store' }).then(r => r.json()).catch(() => null),
    ])
    if (activeOrgRef.current !== organizationId) return
    if (providers?.ok) { setCatalog(providers.catalog); setCredentials(providers.credentials) }
    if (training?.ok) setRuns(training.runs)
    if (!providers?.ok || !training?.ok) setMessage({ kind: 'alert', text: fmt(copy.loadFailed, { code: providers?.error || training?.error || 'network' }) })
  }, [organizationId, copy])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    let cancelled = false
    if (!teacherProviderKind || !teacherId || !organizationId) { setTeacherModels([]); setTeacherModelsError(false); return }
    setTeacherModels([]); setTeacherModelsError(false); setTeacherModelsLoading(true)
    void fetch(`/api/lab/teacher-models?provider=${encodeURIComponent(teacherProviderKind)}&organizationId=${encodeURIComponent(organizationId)}&credentialId=${encodeURIComponent(teacherId)}`, { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(body => {
        if (cancelled) return
        const models: TeacherModelOption[] = body?.ok && Array.isArray(body.models) ? body.models.filter((m: any) => typeof m?.id === 'string').map((m: any) => ({ id: m.id })) : []
        setTeacherModels(models); setTeacherModelsError(!body?.ok || models.length === 0)
      })
      .catch(() => { if (!cancelled) { setTeacherModels([]); setTeacherModelsError(true) } })
      .finally(() => { if (!cancelled) setTeacherModelsLoading(false) })
    return () => { cancelled = true }
  }, [organizationId, teacherProviderKind, teacherId])
  useEffect(() => {
    let cancelled = false
    // Hugging Face's public model directory needs no key; Together and Fireworks list models only to a signed-in key.
    if (!computeProviderKind || !organizationId || (!computeId && !PUBLIC_MODEL_DIRECTORY.has(computeProviderKind))) { setModelSuggestions([]); setModelsError(false); return }
    setModelSuggestions([]); setModelsError(false); setModelsLoading(true)
    void fetch(`/api/lab/models?provider=${encodeURIComponent(computeProviderKind)}&organizationId=${encodeURIComponent(organizationId)}${computeId ? `&credentialId=${encodeURIComponent(computeId)}` : ''}`, { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(body => {
        if (cancelled) return
        const models: ModelOption[] = body?.ok && Array.isArray(body.models) ? body.models.filter((m: any) => typeof m?.id === 'string').map((m: any) => ({ id: m.id, label: String(m.label ?? m.id) })) : []
        setModelSuggestions(models); setModelsError(!body?.ok || models.length === 0)
      })
      .catch(() => { if (!cancelled) { setModelSuggestions([]); setModelsError(true) } })
      .finally(() => { if (!cancelled) setModelsLoading(false) })
    return () => { cancelled = true }
  }, [organizationId, computeProviderKind, computeId])
  useEffect(() => {
    const active = runs.filter(run => !['completed', 'failed', 'cancelled'].includes(run.stage))
    if (!active.length) return
    const timer = setInterval(() => {
      void (async () => {
        // Together / Fireworks jobs report back only when asked: owners and admins poll them; everyone else just reloads.
        if (canManage) {
          await Promise.all(active.filter(run => POLLED_TRAINING.has(run.computeProviderKind ?? '')).map(run =>
            fetch('/api/lab/training', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ action: 'refresh', organizationId, runId: run.runId }) }).catch(() => null)))
        }
        await load()
      })()
    }, 15_000)
    return () => clearInterval(timer)
  }, [runs, load, canManage, organizationId])

  async function call(url: string, method: string, body: unknown) {
    setBusy(true); setMessage(null)
    try {
      const response = await fetch(url, { method, credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw Object.assign(new Error(json.error || 'request_failed'), { problems: json.problems })
      return json
    } finally { setBusy(false) }
  }

  async function saveKey() {
    const requestedOrg = organizationId
    setKeyFeedback(null)
    try {
      const saved = await call('/api/lab/providers', 'POST', { organizationId, providerKind: keyKind, secret: cleanPastedKey(keyValue), endpoint: keyEndpoint.trim() })
      if (activeOrgRef.current !== requestedOrg) return
      setKeyValue(''); setKeyEndpoint(''); setKeyKindDetected(false)
      setKeyFeedback({ where: 'section1', kind: 'status', text: savedText(saved.check) })
      await load()
    } catch (error: any) { if (activeOrgRef.current === requestedOrg) setKeyFeedback({ where: 'section1', kind: 'alert', text: fmt(copy.keyNotSaved, { code: explain(error.message) }) }) }
  }

  async function saveInlineKey() {
    if (!inlineKey) return
    const requestedOrg = organizationId
    const { target, kind } = inlineKey
    setKeyFeedback(null)
    try {
      const saved = await call('/api/lab/providers', 'POST', { organizationId, providerKind: kind, secret: cleanPastedKey(inlineValue), endpoint: inlineEndpoint.trim() })
      if (activeOrgRef.current !== requestedOrg) return
      await load()
      if (activeOrgRef.current !== requestedOrg) return
      if (target === 'teacher') { setTeacherId(saved.credentialId); setTeacherModel(''); setTeacherModelChoice('') }
      else { setComputeId(saved.credentialId); setBaseModel(''); setModelSelection('') }
      setBillingConfirmed(false)
      openInlineKey(target, '')
      setKeyFeedback({ where: target, kind: 'status', text: savedText(saved.check) })
    } catch (error: any) { if (activeOrgRef.current === requestedOrg) setKeyFeedback({ where: target, kind: 'alert', text: fmt(copy.keyNotSaved, { code: explain(error.message) }) }) }
  }

  async function revokeKey(credentialId: string) {
    const requestedOrg = organizationId
    try { await call('/api/lab/providers', 'DELETE', { organizationId, credentialId }); if (activeOrgRef.current === requestedOrg) await load() }
    catch (error: any) { if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.keyRemoveFailed, { code: explain(error.message) }) }) }
  }

  async function findOpenSources() {
    const requestedOrg = organizationId
    setOpenNote({ kind: 'status', text: copy.openFinding })
    try {
      const found = await call('/api/lab/open-sources', 'POST', { organizationId, topic: openTopic, sources: openPicked })
      if (activeOrgRef.current !== requestedOrg) return
      setExamples(found.jsonl ?? ''); setBillingConfirmed(false)
      const missing = LAB_OPEN_SOURCES.filter(item => found.perSource?.[item.id] === 'unavailable').map(item => item.name)
      const line = fmt(Number(found.count) >= 20 ? copy.openFound : copy.openTooFew, { n: Number(found.count) || 0 })
      setOpenNote({ kind: Number(found.count) >= 20 ? 'status' : 'alert', text: missing.length ? `${line} ${fmt(copy.openUnavailableLine, { sources: missing.join(', ') })}` : line })
    } catch (error: any) {
      if (activeOrgRef.current === requestedOrg) setOpenNote({ kind: 'alert', text: explain(error.message) })
    }
  }

  async function startRun() {
    if (!billingConfirmed) return
    setBillingConfirmed(false)
    const requestedOrg = organizationId
    setMessage({ kind: 'status', text: copy.starting })
    try {
      await call('/api/lab/training', 'POST', {
        action: 'start', organizationId, experimentId, source: source === 'open_sources' ? 'examples' : source, examples, teacherCredentialId: teacherId, teacherModel,
        computeCredentialId: computeId, computeProviderKind, baseModel, prompts, providerBillingConfirmed: billingConfirmed,
      })
      if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'status', text: copy.started })
    } catch (error: any) {
      if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.notStarted, { reason: copy.errors[error.message] ?? (error.problems?.length ? error.problems.join(' ') : error.message) }) })
    }
    if (activeOrgRef.current === requestedOrg) await load()
  }

  async function refreshRun(runId: string) {
    const requestedOrg = organizationId
    try { await call('/api/lab/training', 'POST', { action: 'refresh', organizationId, runId }); if (activeOrgRef.current === requestedOrg) await load() }
    catch (error: any) { if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.statusFailed, { code: explain(error.message) }) }) }
  }

  async function cancelRun(runId: string) {
    const requestedOrg = organizationId
    try { await call('/api/lab/training', 'POST', { action: 'cancel', organizationId, runId }); if (activeOrgRef.current === requestedOrg) await load() }
    catch (error: any) { if (activeOrgRef.current === requestedOrg) setMessage({ kind: 'alert', text: fmt(copy.cancelFailed, { code: explain(error.message) }) }) }
  }

  async function download(runId: string) {
    const requestedOrg = organizationId
    try {
      const response = await fetch(`/api/lab/training/download?organizationId=${requestedOrg}&runId=${runId}`, { credentials: 'include', cache: 'no-store' })
      const json = await response.json().catch(() => null)
      if (activeOrgRef.current !== requestedOrg) return
      if (response.ok && json?.ok && Array.isArray(json.files)) {
        setFiles(current => ({ ...current, [runId]: json.files }))
      } else {
        setMessage({ kind: 'alert', text: fmt(copy.downloadUnavailable, { code: explain(json?.error || 'network') }) })
      }
    } catch {
      if (activeOrgRef.current === requestedOrg) {
        setMessage({ kind: 'alert', text: fmt(copy.downloadUnavailable, { code: explain('network') }) })
      }
    }
  }
  const fileUrl = (runId: string, path: string) => `/api/lab/training/download?organizationId=${organizationId}&runId=${runId}&path=${encodeURIComponent(path)}`

  const inlineKeyForm = (target: 'teacher' | 'training') => inlineKey?.target === target && (
    <div className="mt-2 space-y-2 rounded border border-white/20 p-2">
      <input aria-label={copy.keyPh} className="w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" type="password" autoComplete="off" placeholder={copy.keyPh} value={inlineValue} onChange={event => setInlineValue(event.target.value)} />
      {(() => { const detected = detectProviderFromKey(inlineValue); return detected && detected !== inlineKey.kind ? <p className="text-xs text-amber-200">{fmt(copy.keyLooksLike, { name: providerName(detected) })}</p> : null })()}
      {inlineKey.kind === 'openai_compatible' && <input aria-label={copy.endpointPh} className="w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={copy.endpointPh} value={inlineEndpoint} onChange={event => setInlineEndpoint(event.target.value)} />}
      <p className="text-xs opacity-70">{entry(inlineKey.kind)?.keyHelp}</p>
      <div className="flex gap-3">
        <button type="button" className="rounded border px-3 py-1" disabled={busy || keyFormProblem(inlineValue, inlineEndpoint, inlineKey.kind) !== null} onClick={() => { void saveInlineKey() }}>{copy.saveKey}</button>
        <button type="button" className="underline" disabled={busy} onClick={() => openInlineKey(target, '')}>{copy.cancel}</button>
      </div>
      {keyFormProblem(inlineValue, inlineEndpoint, inlineKey.kind) && <p className="text-xs text-slate-300">{keyFormProblem(inlineValue, inlineEndpoint, inlineKey.kind)}</p>}
    </div>
  )

  if (!orgs.length) return (
    <section className="rounded-lg border p-4 text-sm" dir={language === 'ar' ? 'rtl' : undefined}>
      {workspaceLoad === 'loading' ? <p role="status" aria-busy="true">…</p> : null}
      {workspaceLoad === 'error' ? <p role="alert">{message?.text ?? fmt(copy.loadFailed, { code: 'network' })}</p> : null}
      {workspaceLoad === 'ready' ? <><p>{copy.noOrg}</p><button type="button" disabled={busy} onClick={() => { void initializeWorkspace() }} className="mt-3 rounded border px-3 py-2">{copy.workspaceButton}</button>{message ? <p role="alert">{message.text}</p> : null}</> : null}
    </section>
  )
  const teacherEntry = entry(credentials.find(item => item.id === teacherId)?.providerKind || '')

  return (
    <section className="space-y-6 rounded-lg border p-4" lang={language} dir={language === 'ar' ? 'rtl' : undefined}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">{copy.title}</h2><span className="text-xs text-slate-400">{LAB_UI_VERSION}</span></div>
        {orgs.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm"><span>{copy.workspaceSelectorLabel}</span>
        <select aria-label={copy.workspaceSelectorLabel} className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-sm text-white" value={orgKey} onChange={event => { const next = event.target.value; activeOrgRef.current = next.split('|')[0]; setCredentials([]); setRuns([]); setFiles({}); setCatalog([]); setKeyValue(''); setKeyKindDetected(false); setKeyEndpoint(''); setTeacherId(''); setTeacherProviderKind(''); setTeacherModel(''); setTeacherModelChoice(''); setComputeId(''); setComputeProviderKind(''); setBaseModel(''); setModelSelection(''); setMessage(null); setOrgKey(next) }}>
          {orgs.map(item => <option key={`${item.organizationId}|${item.experimentId}`} value={`${item.organizationId}|${item.experimentId}`}>{item.organizationName === item.projectName ? item.organizationName : `${item.organizationName} · ${item.projectName}`}</option>)}
        </select>
          </label>
        ) : <span aria-label={copy.workspaceSelectorLabel} className="rounded border border-white/20 px-3 py-2 text-sm text-slate-300">{copy.workspaceSelectorLabel}: {org?.organizationName === copy.title ? copy.defaultWorkspaceName : (org?.organizationName || copy.defaultWorkspaceName)}</span>}
      </header>
      {message && <p role={message.kind} className="text-sm">{message.text}</p>}
      {canManage && org && <LabOrganizationDiagnostics key={org.organizationId} organizationId={org.organizationId} language={language} />}

      <div className="space-y-2">
        <h3 className="font-medium">{copy.keysHeading}</h3>
        <ul className="space-y-1 text-sm">
          {credentials.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span>{entry(item.providerKind)?.name ?? item.providerKind} · {item.label}
                {!entry(item.providerKind)?.supports['training.execute'] && <em className="ms-2 opacity-70">{copy.teacherOnly}</em>}</span>
              {canManage && <button className="underline" disabled={busy} onClick={() => revokeKey(item.id)}>{copy.remove}</button>}
            </li>
          ))}
          {!credentials.length && <li className="opacity-70">{copy.noKeys}</li>}
        </ul>
        {canManage && (
          <div className="grid gap-2 sm:grid-cols-2">
            <select aria-label={copy.keysHeading} className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={keyKind} onChange={event => { setKeyKind(event.target.value); setKeyKindDetected(false) }}>
              <option value="">{copy.choose}</option>
              <optgroup label="Available adapters">{sortedCatalog.map(item => <option key={item.kind} value={item.kind}>{item.name}</option>)}</optgroup>
            </select>
            <input aria-label={copy.keyPh} className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" type="password" autoComplete="off" placeholder={copy.keyPh} value={keyValue} onChange={event => onKeyPasted(event.target.value)} />
            {keyKindDetected && keyKind && <p className="text-xs text-emerald-300 sm:col-span-2">{fmt(copy.keyDetected, { name: providerName(keyKind) })}</p>}
            {keyKind === 'openai_compatible' && <input className="rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={copy.endpointPh} value={keyEndpoint} onChange={event => setKeyEndpoint(event.target.value)} />}
            <p className="text-xs opacity-70 sm:col-span-2">{entry(keyKind)?.keyHelp} {entry(keyKind)?.unsupported['training.execute']}</p>
            <button className="rounded border px-3 py-1 sm:col-span-2" disabled={busy || !catalog.some(item => item.kind === keyKind) || keyFormProblem(keyValue, keyEndpoint, keyKind) !== null} onClick={saveKey}>{copy.saveKey}</button>
            {keyKind && keyFormProblem(keyValue, keyEndpoint, keyKind) && <p className="text-xs text-slate-300 sm:col-span-2">{keyFormProblem(keyValue, keyEndpoint, keyKind)}</p>}
            <div className="sm:col-span-2">{feedbackFor('section1')}</div>
          </div>
        )}
      </div>

      {canManage && (
        <div className="space-y-2">
          <h3 className="font-medium">{copy.chooseHeading}</h3>
          <LabCustomerTrainingAdvisor language={language} catalog={catalog} connectedKinds={connectedKinds} selectedKind={computeProviderKind} ready={source === 'teacher' ? promptCount >= 20 && promptCount <= 128 : preflight.ready} />
          <div className="flex gap-4 text-sm">
            <label><input type="radio" checked={source === 'examples'} onChange={() => { setSource('examples'); setBillingConfirmed(false) }} /> {copy.useExamples}</label>
            <label><input type="radio" checked={source === 'teacher'} onChange={() => { setSource('teacher'); setBillingConfirmed(false) }} /> {copy.askTeacher}</label>
            <label><input type="radio" checked={source === 'open_sources'} onChange={() => { setSource('open_sources'); setBillingConfirmed(false) }} /> {copy.useOpenSources}</label>
          </div>
          {source === 'open_sources' && (
            <div className="grid gap-2 rounded border border-white/20 p-2 sm:grid-cols-2">
              <p className="text-xs text-slate-300 sm:col-span-2">{copy.openSourcesHelp}</p>
              <label className="text-sm">{copy.openTopic}
                <input aria-label={copy.openTopic} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" maxLength={120} placeholder={copy.openTopicPh} value={openTopic} onChange={event => setOpenTopic(event.target.value)} />
              </label>
              <fieldset className="text-sm">
                <legend>{copy.openSourcesPick}</legend>
                {LAB_OPEN_SOURCES.map(item => (
                  <label key={item.id} className="me-3 inline-flex items-center gap-1">
                    <input type="checkbox" checked={openPicked.includes(item.id)} onChange={event => setOpenPicked(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} /> {item.name}
                  </label>
                ))}
              </fieldset>
              <div className="sm:col-span-2">
                <button className="rounded border px-3 py-1" disabled={busy || openTopic.trim().length < 3 || !openPicked.length} onClick={findOpenSources}>{copy.openFind}</button>
                {openTopic.trim().length < 3 && <span className="ms-2 text-xs text-slate-400">{copy.errors.lab_open_sources_topic_invalid}</span>}
                {openTopic.trim().length >= 3 && !openPicked.length && <span className="ms-2 text-xs text-slate-400">{copy.errors.lab_open_sources_none_selected}</span>}
                {openNote && <p role={openNote.kind} className={`mt-1 text-xs ${openNote.kind === 'alert' ? 'text-amber-200' : 'text-slate-300'}`}>{openNote.text}</p>}
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {source === 'teacher' && <>
            <label className="text-sm">{copy.teacherProviderLabel}
              <select aria-label={copy.teacherProviderLabel} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={teacherProviderKind} onChange={event => { setTeacherProviderKind(event.target.value); setBillingConfirmed(false); pickProvider('teacher', event.target.value); setTeacherModel(''); setTeacherModelChoice('') }}>
                <option value="">{copy.chooseTeacherProvider}</option>
                {teacherOptions.map(item => <option key={item.kind} value={item.kind} disabled={item.blocked !== null}>{optionLabel(item)}</option>)}
              </select>
            </label>
            <label className="text-sm">{copy.teacherKey}
              <select aria-label={copy.teacherKey} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={inlineKey?.target === 'teacher' ? ADD_KEY_OPTION : teacherId} disabled={!teacherProviderKind} onChange={event => { if (event.target.value === ADD_KEY_OPTION) { openInlineKey('teacher', teacherProviderKind); return } openInlineKey('teacher', ''); setTeacherId(event.target.value); setTeacherModel(''); setTeacherModelChoice(''); setBillingConfirmed(false) }}>
                <option value="">{teacherProviderKind ? copy.chooseTeacherAccount : copy.chooseProviderFirst}</option>
                {selectedTeacherCredentials.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                {teacherProviderKind && canManage && <option value={ADD_KEY_OPTION}>{copy.addKeyOption}</option>}
              </select>
              {teacherProviderKind && !selectedTeacherCredentials.length && inlineKey?.target !== 'teacher' && <span className="mt-1 block text-xs text-amber-200">{copy.connectTeacherFirst}</span>}
              {inlineKeyForm('teacher')}
              {feedbackFor('teacher')}
            </label>
            <label className="text-sm">{copy.teacherModel}
              <select aria-label={copy.teacherModel} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={teacherModelChoice} disabled={!teacherProviderKind || !teacherId} onChange={event => { setTeacherModelChoice(event.target.value); setTeacherModel(event.target.value === 'custom' ? '' : event.target.value); setBillingConfirmed(false) }}>
                <option value="">{teacherModelsLoading ? copy.loadingModels : !teacherProviderKind ? copy.chooseProviderFirst : !teacherId ? copy.chooseAccountFirst : copy.choose}</option>
                {teacherModels.map(model => <option key={model.id} value={model.id}>{model.id}</option>)}
                <option value="custom">{copy.customModelLabel}</option>
              </select>
              {teacherModelsError && <span role="alert" className="mt-1 block text-xs text-amber-200">{copy.modelDirectoryUnavailable}</span>}
              {teacherModelChoice === 'custom' && <input aria-label={copy.teacherModel} className="mt-2 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={copy.modelPh} value={teacherModel} onChange={event => { setTeacherModel(event.target.value); setBillingConfirmed(false) }} />}
            </label>
            </>}
            <label className="text-sm">{copy.trainingProviderLabel}
              <select aria-label={copy.trainingProviderLabel} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={computeProviderKind} onChange={event => { setComputeProviderKind(event.target.value); setBillingConfirmed(false); pickProvider('training', event.target.value); setBaseModel(''); setModelSelection('') }}>
                <option value="">{copy.chooseTrainingProvider}</option>
                {trainingOptions.map(item => <option key={item.kind} value={item.kind} disabled={item.blocked !== null}>{optionLabel(item)}</option>)}
              </select>
            </label>
            <label className="text-sm">{copy.trainingAccount}
              <select aria-label={copy.trainingAccount} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={inlineKey?.target === 'training' ? ADD_KEY_OPTION : computeId} disabled={!computeProviderKind} onChange={event => { if (event.target.value === ADD_KEY_OPTION) { openInlineKey('training', computeProviderKind); return } openInlineKey('training', ''); setComputeId(event.target.value); setBaseModel(''); setModelSelection(''); setBillingConfirmed(false) }}>
                <option value="">{computeProviderKind ? copy.chooseTrainingAccount : copy.chooseProviderFirst}</option>
                {selectedComputeCredentials.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                {computeProviderKind && canManage && <option value={ADD_KEY_OPTION}>{copy.addKeyOption}</option>}
              </select>
              {computeProviderKind && !selectedComputeCredentials.length && inlineKey?.target !== 'training' && <span className="mt-1 block text-xs text-amber-200">{copy.connectTrainingFirst}</span>}
              {inlineKeyForm('training')}
              {feedbackFor('training')}
            </label>
            <label className="text-sm">{copy.baseModel}
              <select aria-label={copy.baseModel} className="mt-1 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" value={modelSelection} disabled={!computeProviderKind || (!computeId && !PUBLIC_MODEL_DIRECTORY.has(computeProviderKind))} onChange={event => { setBillingConfirmed(false); const selected = event.target.value; setModelSelection(selected); setBaseModel(selected === 'custom' ? '' : selected) }}>
                <option value="">{modelsLoading ? copy.loadingModels : !computeProviderKind ? copy.chooseProviderFirst : !computeId && !PUBLIC_MODEL_DIRECTORY.has(computeProviderKind) ? copy.chooseAccountFirst : copy.choose}</option>
                {modelSuggestions.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
                <option value="custom">{copy.customModelLabel}</option>
              </select>
              {modelsError && <span role="alert" className="mt-1 block text-xs text-amber-200">{copy.modelDirectoryUnavailable}</span>}
              {modelSelection === 'custom' && <input aria-label={copy.baseModel} className="mt-2 w-full rounded border border-white/30 bg-slate-900 px-2 py-1 text-white" placeholder={computeProviderKind === 'fireworks' ? 'accounts/fireworks/models/model-name' : 'Organization/model-name'} value={baseModel} onChange={event => { setBaseModel(event.target.value); setBillingConfirmed(false) }} />}
              <span className="mt-1 block text-xs text-slate-400">{copy.modelDirectoryHelp}</span>
            </label>
            {source === 'teacher' ? (
              <label className="text-sm sm:col-span-2">{fmt(copy.prompts, { n: promptCount })}
                <textarea className="mt-1 h-40 w-full rounded border px-2 py-1 font-mono text-xs" value={prompts} onChange={event => { setPrompts(event.target.value); setBillingConfirmed(false) }} />
                {prompts.trim() && <div aria-live="polite" className="mt-2 text-xs">
                  <p>{preflightLabels[1]}: {promptPreview.uniquePrompts} · {preflightLabels[3]}: {promptPreview.duplicatePrompts} · {preflightLabels[5]}: {promptPreview.truncatedPrompts}</p>
                  {promptPreview.truncatedPrompts > 0 && <p role="alert" className="text-amber-200">{preflightLabels[8]}</p>}
                </div>}
              </label>
            ) : (
              <label className="text-sm sm:col-span-2">{fmt(copy.examples, { n: exampleCount })}
                <textarea className="mt-1 h-40 w-full rounded border px-2 py-1 font-mono text-xs" value={examples} onChange={event => { setExamples(event.target.value); setBillingConfirmed(false) }} />
                {examples.trim() && <div aria-live="polite" className="mt-2 rounded border border-white/20 p-3 text-xs text-slate-200">
                  <p className="font-semibold">{preflightLabels[0]}</p>
                  <p className="mt-1">{preflightLabels[1]}: {preflight.uniquePrompts} · {preflightLabels[2]}: {preflight.invalidLines} · {preflightLabels[3]}: {preflight.duplicateRows}</p>
                  <p>{preflightLabels[4]}: {preflight.conflictingPrompts} · {preflightLabels[5]}: {preflight.truncatedFields} · {preflightLabels[6]}: {preflight.extraRows}</p>
                  <p className={preflight.ready ? 'text-emerald-300' : 'text-amber-200'}>{preflight.ready ? preflightLabels[7] : preflightLabels[8]}</p>
                  <p className="opacity-70">{preflightLabels[9]}</p>
                </div>}
              </label>
            )}
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={billingConfirmed} onChange={event => setBillingConfirmed(event.target.checked)} /> {copy.billingConfirmation}</label>
          <button className="rounded border px-3 py-1" disabled={busy || !billingConfirmed || !computeProviderKind || !computeId || !baseModelValid || itemCount < 20 || itemCount > 128 || (source === 'teacher' && !promptPreview.ready) || (source !== 'teacher' && !preflight.ready) || (source === 'teacher' && (!teacherProviderKind || !teacherId || !teacherModel))} onClick={startRun}>{copy.start}</button>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-medium">{copy.progressHeading}</h3>
        {!runs.length && <p className="text-sm opacity-70">{copy.noRuns}</p>}
        <ul className="space-y-3">
          {runs.map(run => (
            <li key={run.runId} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{(copy.stages as Record<string, string>)[run.stage] ?? run.stage}</strong>
                <span className="opacity-70">{run.teacherModel} → {run.baseModel} · {new Date(run.createdAt).toLocaleString(language)}</span>
              </div>
              <div className="my-2 h-2 w-full rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${run.progressPercent}%` }} /></div>
              {run.failureCode ? <><p>{explain(run.failureCode)}</p><LabCustomerFailureGuidance code={run.failureCode} language={language} /></> : run.statusMessage && <p>{run.statusMessage}</p>}
              {run.tunedModelId && <p>{fmt(copy.tunedModelLine, { id: run.tunedModelId })}</p>}
              <div className="mt-2 flex flex-wrap gap-3">
                {run.hfJobUrl && <a className="underline" href={run.hfJobUrl} target="_blank" rel="noreferrer">{copy.openJob}</a>}
                {canManage && !['completed', 'failed', 'cancelled'].includes(run.stage) && <button className="underline" disabled={busy} onClick={() => refreshRun(run.runId)}>{copy.checkStatus}</button>}
                {canManage && POLLED_TRAINING.has(run.computeProviderKind ?? '') && !['completed', 'failed', 'cancelled'].includes(run.stage) && <button className="underline" disabled={busy} onClick={() => cancelRun(run.runId)}>{copy.cancelTraining}</button>}
                {run.stage === 'completed' && run.artifactRepo && <button className="underline" onClick={() => download(run.runId)}>{copy.downloadModel}</button>}
              </div>
              <LabCustomerModelPassport run={run} language={language} />
              {org && <LabCustomerRunTimeline key={run.runId} organizationId={org.organizationId} runId={run.runId} language={language} />}
              {run.stage === 'completed' && <LabCustomerHoldoutEvaluation key={run.runId} language={language} runId={run.runId} baseModel={run.baseModel} trainedModel={run.tunedModelId || run.artifactRepo || ""} />}
              {run.stage === 'completed' && (run.tunedModelId || run.artifactRevision) && <LabCustomerResponseComparison key={run.runId} language={language} runId={run.runId} baseModel={run.baseModel} trainedModel={run.tunedModelId || run.artifactRepo || run.artifactRevision || '—'} />}
              {files[run.runId] && (
                <ul className="mt-2 space-y-1">
                  {files[run.runId].map(file => <li key={file.path}><a className="underline" href={fileUrl(run.runId, file.path)}>{file.path}</a> <span className="opacity-70">({(file.size / 1e6).toFixed(1)} {copy.mb})</span></li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
