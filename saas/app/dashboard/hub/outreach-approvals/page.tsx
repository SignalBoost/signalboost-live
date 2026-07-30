// saas/app/dashboard/hub/outreach-approvals/page.tsx
'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru'
type Risk = 'low' | 'medium' | 'high'
type Step = { provider: string; templateId: string; label: string; payload: Record<string, unknown> }
type InfrastructurePr = { id: string; title: string; summary: string; status: string; risk: Risk; steps: Step[] }
type Copy = {
  title: string; subtitle: string; refresh: string; loading: string; empty: string; loadError: string
  mergeError: string; closeError: string; risk: string; steps: string; provider: string; template: string
  payload: string; merge: string; merging: string; close: string; closing: string; confirmTitle: string
  confirm: string; cancel: string; risks: Record<Risk, string>
}

const COPY: Record<Language, Copy> = {
  en: { title: uiText('outreachApprovals.title'), subtitle: uiText('outreachApprovals.subtitle'), refresh: uiText('outreachApprovals.refresh'), loading: uiText('outreachApprovals.loading'), empty: uiText('outreachApprovals.empty'), loadError: uiText('outreachApprovals.loadError'), mergeError: uiText('outreachApprovals.mergeError'), closeError: uiText('outreachApprovals.closeError'), risk: uiText('outreachApprovals.risk'), steps: uiText('outreachApprovals.steps'), provider: uiText('outreachApprovals.provider'), template: uiText('outreachApprovals.template'), payload: uiText('outreachApprovals.payload'), merge: uiText('outreachApprovals.merge'), merging: uiText('outreachApprovals.merging'), close: uiText('outreachApprovals.close'), closing: uiText('outreachApprovals.closing'), confirmTitle: uiText('outreachApprovals.confirmTitle'), confirm: uiText('outreachApprovals.confirm'), cancel: uiText('outreachApprovals.cancel'), risks: { low: uiText('outreachApprovals.risks.low'), medium: uiText('outreachApprovals.risks.medium'), high: uiText('outreachApprovals.risks.high') } },
  es: { title: 'Aprobaciones de prospección', subtitle: 'Revisa las acciones de proveedor que COS preparó como PR de infraestructura (incluidos los envíos de correo de prospección). Independiente de la Cola de Prospección de clientes. Nada se ejecuta hasta que apruebes y fusiones.', refresh: 'Actualizar', loading: 'Cargando aprobaciones…', empty: 'No hay aprobaciones abiertas.', loadError: 'No se pudieron cargar las aprobaciones.', mergeError: 'No se pudo fusionar la aprobación.', closeError: 'No se pudo cerrar la aprobación.', risk: 'riesgo', steps: 'Pasos previstos', provider: 'Proveedor', template: 'Plantilla', payload: 'Carga útil', merge: 'Aprobar / Fusionar', merging: 'Fusionando…', close: 'Cerrar', closing: 'Cerrando…', confirmTitle: 'Esto ejecuta en vivo las acciones de proveedor indicadas. Confirma que revisaste cada carga útil.', confirm: 'Confirmar fusión en vivo', cancel: 'Cancelar', risks: { low: 'Bajo', medium: 'Medio', high: 'Alto' } },
  pt: { title: 'Aprovações de prospecção', subtitle: 'Revise as ações de provedor que o COS preparou como PR de infraestrutura (incluindo envios de e-mail de prospecção). Separado da Fila de Prospecção de clientes. Nada é executado até você aprovar e mesclar.', refresh: 'Atualizar', loading: 'Carregando aprovações…', empty: 'Não há aprovações abertas.', loadError: 'Não foi possível carregar as aprovações.', mergeError: 'Não foi possível mesclar a aprovação.', closeError: 'Não foi possível fechar a aprovação.', risk: 'risco', steps: 'Etapas planejadas', provider: 'Provedor', template: 'Modelo', payload: 'Carga útil', merge: 'Aprovar / Mesclar', merging: 'Mesclando…', close: 'Fechar', closing: 'Fechando…', confirmTitle: 'Isso executa ao vivo as ações de provedor listadas. Confirme que revisou cada carga útil.', confirm: 'Confirmar mesclagem ao vivo', cancel: 'Cancelar', risks: { low: 'Baixo', medium: 'Médio', high: 'Alto' } },
  pl: { title: 'Zatwierdzenia outreach', subtitle: 'Sprawdź działania dostawców przygotowane przez COS jako PR infrastruktury (w tym wysyłki e-maili outreach). Oddzielne od Kolejki Outreach dla klientów. Nic nie zostanie wykonane przed zatwierdzeniem i scaleniem.', refresh: 'Odśwież', loading: 'Ładowanie zatwierdzeń…', empty: 'Brak otwartych zatwierdzeń.', loadError: 'Nie udało się wczytać zatwierdzeń.', mergeError: 'Nie udało się scalić zatwierdzenia.', closeError: 'Nie udało się zamknąć zatwierdzenia.', risk: 'ryzyko', steps: 'Planowane kroki', provider: 'Dostawca', template: 'Szablon', payload: 'Dane', merge: 'Zatwierdź / Scal', merging: 'Scalanie…', close: 'Zamknij', closing: 'Zamykanie…', confirmTitle: 'Spowoduje to wykonanie na żywo wymienionych działań dostawców. Potwierdź sprawdzenie wszystkich danych.', confirm: 'Potwierdź scalenie na żywo', cancel: 'Anuluj', risks: { low: 'Niskie', medium: 'Średnie', high: 'Wysokie' } },
  ru: { title: 'Одобрение аутрича', subtitle: 'Проверьте действия провайдеров, подготовленные COS как инфраструктурный PR (включая отправку писем аутрича). Это отдельно от очереди аутрича для клиентов. Ничего не выполняется до одобрения и слияния.', refresh: 'Обновить', loading: 'Загрузка одобрений…', empty: 'Нет открытых одобрений.', loadError: 'Не удалось загрузить одобрения.', mergeError: 'Не удалось выполнить слияние.', closeError: 'Не удалось закрыть одобрение.', risk: 'риск', steps: 'Запланированные шаги', provider: 'Провайдер', template: 'Шаблон', payload: 'Данные', merge: 'Одобрить / Слить', merging: 'Слияние…', close: 'Закрыть', closing: 'Закрытие…', confirmTitle: 'Указанные действия провайдеров будут выполнены в рабочей среде. Подтвердите проверку всех данных.', confirm: 'Подтвердить слияние', cancel: 'Отмена', risks: { low: 'Низкий', medium: 'Средний', high: 'Высокий' } },
}

const card: CSSProperties = { border: '1px solid #334155', borderRadius: 16, background: '#0f172a', padding: 20 }
const button: CSSProperties = { border: '1px solid #64748b', borderRadius: 9, background: '#172033', color: '#f8fafc', padding: '9px 14px', cursor: 'pointer' }

export default function OutreachApprovalsPage() {
  const { lang } = useI18n()
  const copy = COPY[(lang in COPY ? lang : 'en') as Language]
  const [prs, setPrs] = useState<InfrastructurePr[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<Record<string, 'merge' | 'close'>>({})
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError(''); setLoading(true)
    try {
      const response = await fetch('/api/hub/infra-pr', { cache: 'no-store', credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error)
      setPrs((Array.isArray(data.prs) ? data.prs : []).filter((pr: InfrastructurePr) => pr.status === 'open' || pr.status === 'merging'))
    } catch { setError(copy.loadError) } finally { setLoading(false) }
  }, [copy.loadError])

  useEffect(() => { void load() }, [load])

  async function mutate(pr: InfrastructurePr, action: 'merge' | 'close') {
    setBusy(current => ({ ...current, [pr.id]: action })); setError('')
    try {
      // Item actions live under /api/infra-pr/[id] (GET/DELETE) and
      // /api/infra-pr/[id]/merge (POST) — the RBAC-gated engine routes.
      // /api/hub/infra-pr is the LIST endpoint only and has no [id] handlers,
      // so pointing merge/close at it returned 404 and the cockpit could
      // display approvals but never act on them.
      const response = await fetch(`/api/infra-pr/${pr.id}${action === 'merge' ? '/merge' : ''}`, { method: action === 'merge' ? 'POST' : 'DELETE', credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error)
      setConfirming(null); await load()
    } catch { setError(action === 'merge' ? copy.mergeError : copy.closeError) } finally {
      setBusy(current => { const next = { ...current }; delete next[pr.id]; return next })
    }
  }

  return <main style={{ minHeight: '100vh', background: '#08111f', color: '#f8fafc', padding: '32px 20px 80px' }}>
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'start' }}>
        <div><h1 style={{ margin: 0 }}>{copy.title}</h1><p style={{ color: '#94a3b8', maxWidth: 720 }}>{copy.subtitle}</p></div>
        <button type="button" style={button} onClick={() => void load()}>{copy.refresh}</button>
      </header>
      {error ? <p role="alert" style={{ color: '#fda4af' }}>{error}</p> : null}
      {loading ? <p style={{ color: '#94a3b8' }}>{copy.loading}</p> : null}
      {!loading && prs.length === 0 ? <div style={card}>{copy.empty}</div> : null}
      <div style={{ display: 'grid', gap: 18 }}>
        {prs.map(pr => <article key={pr.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div><h2 style={{ margin: 0 }}>{pr.title}</h2>{pr.summary ? <p style={{ color: '#cbd5e1' }}>{pr.summary}</p> : null}</div>
            <strong style={{ color: pr.risk === 'high' ? '#fb7185' : pr.risk === 'medium' ? '#facc15' : '#22d3ee' }}>{copy.risks[pr.risk]} {copy.risk}</strong>
          </div>
          <h3>{copy.steps}</h3>
          <ol style={{ display: 'grid', gap: 12, paddingLeft: 24 }}>
            {(Array.isArray(pr.steps) ? pr.steps : []).map((step, index) => <li key={`${step.templateId}-${index}`}>
              <div><b>{step.label}</b></div>
              <div style={{ color: '#94a3b8' }}>{copy.provider}: <code>{step.provider}</code> · {copy.template}: <code>{step.templateId}</code></div>
              <div style={{ marginTop: 7, color: '#94a3b8' }}>{copy.payload}</div>
              <pre style={{ overflowX: 'auto', borderRadius: 9, background: '#020617', color: '#67e8f9', padding: 12 }}>{JSON.stringify(step.payload, null, 2)}</pre>
            </li>)}
          </ol>
          {confirming === pr.id ? <div style={{ border: '1px solid #fb7185', borderRadius: 10, padding: 14, marginTop: 14 }}>
            <p style={{ marginTop: 0 }}>{copy.confirmTitle}</p>
            <div style={{ display: 'flex', gap: 10 }}><button type="button" disabled={Boolean(busy[pr.id])} style={{ ...button, background: '#be123c' }} onClick={() => void mutate(pr, 'merge')}>{busy[pr.id] === 'merge' ? copy.merging : copy.confirm}</button><button type="button" style={button} onClick={() => setConfirming(null)}>{copy.cancel}</button></div>
          </div> : <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" disabled={Boolean(busy[pr.id]) || pr.status === 'merging'} style={{ ...button, background: '#eab308', color: '#111827' }} onClick={() => setConfirming(pr.id)}>{pr.status === 'merging' ? copy.merging : copy.merge}</button>
            <button type="button" disabled={Boolean(busy[pr.id])} style={button} onClick={() => void mutate(pr, 'close')}>{busy[pr.id] === 'close' ? copy.closing : copy.close}</button>
          </div>}
        </article>)}
      </div>
    </div>
  </main>
}
