// saas/app/dashboard/hub/outreach-approvals/page.tsx
'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Language = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
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
  de: { title: 'Outreach-Genehmigungen', subtitle: 'Prüfen Sie die Anbieteraktionen, die COS als Infrastruktur-PRs vorbereitet hat (einschließlich Outreach-E-Mail-Versand). Getrennt von der Kunden-Outreach-Warteschlange. Nichts wird ausgeführt, bis Sie genehmigen und mergen.', refresh: 'Aktualisieren', loading: 'Genehmigungen werden geladen…', empty: 'Keine offenen Genehmigungen.', loadError: 'Genehmigungen konnten nicht geladen werden.', mergeError: 'Die Genehmigung konnte nicht gemergt werden.', closeError: 'Die Genehmigung konnte nicht geschlossen werden.', risk: 'Risiko', steps: 'Geplante Schritte', provider: 'Anbieter', template: 'Vorlage', payload: 'Nutzlast', merge: 'Genehmigen / Mergen', merging: 'Wird gemergt…', close: 'Schließen', closing: 'Wird geschlossen…', confirmTitle: 'Dadurch werden die aufgeführten Anbieteraktionen live ausgeführt. Bestätigen Sie, dass Sie jede Nutzlast geprüft haben.', confirm: 'Live-Merge bestätigen', cancel: 'Abbrechen', risks: { low: 'Niedrig', medium: 'Mittel', high: 'Hoch' } },
  fr: { title: 'Approbations de prospection', subtitle: 'Examinez les actions fournisseur que COS a préparées sous forme de PR d’infrastructure (y compris les envois d’e-mails de prospection). Distinct de la file de prospection client. Rien ne s’exécute tant que vous n’avez pas approuvé et fusionné.', refresh: 'Actualiser', loading: 'Chargement des approbations…', empty: 'Aucune approbation en attente.', loadError: 'Impossible de charger les approbations.', mergeError: 'Impossible de fusionner l’approbation.', closeError: 'Impossible de clôturer l’approbation.', risk: 'risque', steps: 'Étapes prévues', provider: 'Fournisseur', template: 'Modèle', payload: 'Charge utile', merge: 'Approuver / Fusionner', merging: 'Fusion…', close: 'Fermer', closing: 'Clôture…', confirmTitle: 'Cette opération exécute en production les actions fournisseur listées. Confirmez que vous avez examiné chaque charge utile.', confirm: 'Confirmer la fusion en production', cancel: 'Annuler', risks: { low: 'Faible', medium: 'Moyen', high: 'Élevé' } },
  it: { title: 'Approvazioni outreach', subtitle: 'Controlla le azioni del provider che COS ha preparato come PR di infrastruttura (inclusi gli invii di email di outreach). Separato dalla coda di outreach dei clienti. Nulla viene eseguito finché non approvi ed esegui il merge.', refresh: 'Aggiorna', loading: 'Caricamento delle approvazioni…', empty: 'Nessuna approvazione aperta.', loadError: 'Impossibile caricare le approvazioni.', mergeError: 'Impossibile eseguire il merge dell’approvazione.', closeError: 'Impossibile chiudere l’approvazione.', risk: 'rischio', steps: 'Passaggi pianificati', provider: 'Provider', template: 'Modello', payload: 'Payload', merge: 'Approva / Merge', merging: 'Merge in corso…', close: 'Chiudi', closing: 'Chiusura…', confirmTitle: 'Questa operazione esegue live le azioni del provider elencate. Conferma di aver controllato ogni payload.', confirm: 'Conferma merge live', cancel: 'Annulla', risks: { low: 'Bassa', medium: 'Medio', high: 'Alto' } },
  ja: { title: 'アウトリーチの承認', subtitle: 'COS がインフラ PR として準備したプロバイダーアクション(アウトリーチメールの送信を含む)を確認してください。顧客向けアウトリーチキューとは別です。承認してマージするまで何も実行されません。', refresh: '更新', loading: '承認を読み込み中…', empty: '未処理の承認はありません。', loadError: '承認を読み込めませんでした。', mergeError: '承認をマージできませんでした。', closeError: '承認をクローズできませんでした。', risk: 'リスク', steps: '予定されている手順', provider: 'プロバイダー', template: 'テンプレート', payload: 'ペイロード', merge: '承認 / マージ', merging: 'マージ中…', close: '閉じる', closing: 'クローズ中…', confirmTitle: '一覧のプロバイダーアクションが本番で実行されます。すべてのペイロードを確認したことを確認してください。', confirm: '本番マージを確認', cancel: 'キャンセル', risks: { low: '低', medium: '中', high: '高' } },
  ko: { title: '아웃리치 승인', subtitle: 'COS가 인프라 PR로 준비한 공급자 작업(아웃리치 이메일 발송 포함)을 검토하세요. 고객 아웃리치 대기열과는 별개입니다. 승인하고 병합하기 전에는 아무것도 실행되지 않습니다.', refresh: '새로 고침', loading: '승인 불러오는 중…', empty: '열린 승인이 없습니다.', loadError: '승인을 불러올 수 없습니다.', mergeError: '승인을 병합할 수 없습니다.', closeError: '승인을 닫을 수 없습니다.', risk: '위험', steps: '계획된 단계', provider: '제공업체', template: '템플릿', payload: '페이로드', merge: '승인 / 병합', merging: '병합 중…', close: '닫기', closing: '닫는 중…', confirmTitle: '나열된 공급자 작업이 실제로 실행됩니다. 모든 페이로드를 검토했는지 확인하세요.', confirm: '실제 병합 확인', cancel: '취소', risks: { low: '낮음', medium: '보통', high: '높음' } },
  ar: { title: 'موافقات التواصل', subtitle: 'راجع إجراءات المزوّد التي جهّزها COS كطلبات PR للبنية التحتية (بما في ذلك إرسال رسائل التواصل عبر البريد الإلكتروني). منفصلة عن قائمة انتظار التواصل مع العملاء. لن يُنفَّذ أي شيء حتى توافق وتدمج.', refresh: 'تحديث', loading: 'جارٍ تحميل الموافقات…', empty: 'لا توجد موافقات مفتوحة.', loadError: 'تعذّر تحميل الموافقات.', mergeError: 'تعذّر دمج الموافقة.', closeError: 'تعذّر إغلاق الموافقة.', risk: 'المخاطر', steps: 'الخطوات المخططة', provider: 'المزوّد', template: 'القالب', payload: 'الحمولة', merge: 'موافقة / دمج', merging: 'جارٍ الدمج…', close: 'إغلاق', closing: 'جارٍ الإغلاق…', confirmTitle: 'سيؤدي هذا إلى تنفيذ إجراءات المزوّد المدرجة مباشرةً. أكّد أنك راجعت كل حمولة.', confirm: 'تأكيد الدمج المباشر', cancel: 'إلغاء', risks: { low: 'منخفض', medium: 'متوسط', high: 'مرتفع' } },
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
          <ol style={{ display: 'grid', gap: 12, paddingInlineStart: 24 }}>
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
