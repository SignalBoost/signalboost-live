'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const COPY = {
  eyebrow:    { en: uiText('generatedUi.u_8de4e0ea7370e4e6'), es: 'Ventas', pt: 'Vendas', pl: 'Sprzedaż', ru: 'Продажи', de: 'Vertrieb', fr: 'Ventes', it: 'Vendite', ja: '営業', ko: '영업', ar: 'المبيعات' },
  title:      { en: uiText('generatedUi.u_22a3534629d2dcf1'), es: 'Pipeline de Ventas', pt: 'Pipeline de Vendas', pl: 'Pipeline Sprzedaży', ru: 'Пайплайн продаж', de: 'Vertriebspipeline', fr: 'Pipeline commercial', it: 'Pipeline di vendita', ja: 'セールスパイプライン', ko: '영업 파이프라인', ar: 'مسار المبيعات' },
  subtitle:   { en: uiText('generatedUi.u_298a1e10558a1c56'), es: 'Sigue a los prospectos desde el descubrimiento hasta el cierre.', pt: 'Acompanhe os prospects do descobrimento ao cliente.', pl: 'Śledź prospektów od odkrycia do klienta.', ru: 'Отслеживайте потенциальных клиентов от поиска до закрытия.', de: 'Verfolgen Sie Interessenten von der Entdeckung bis zum Kunden.', fr: 'Suivez vos prospects de la découverte jusqu\'à la conversion en client.', it: 'Monitora i potenziali clienti dalla scoperta fino alla conversione in clienti.', ja: '見込み客を発見から顧客化まで追跡します。', ko: '잠재 고객을 발굴부터 고객 전환까지 추적하세요.', ar: 'تتبّع العملاء المحتملين من مرحلة الاكتشاف حتى يصبحوا عملاء.' },
  loading:    { en: uiText('generatedUi.u_c0577197648affd1'), es: 'Cargando pipeline…', pt: 'Carregando pipeline…', pl: 'Ładowanie pipeline…', ru: 'Загрузка пайплайна…', de: 'Pipeline wird geladen…', fr: 'Chargement du pipeline…', it: 'Caricamento pipeline…', ja: 'パイプラインを読み込み中…', ko: '파이프라인 불러오는 중…', ar: 'جارٍ تحميل خط المعالجة…' },
  noLeads:    { en: uiText('generatedUi.u_9bb32a44e756d534'), es: 'Sin leads', pt: 'Sem leads', pl: 'Brak leadów', ru: 'Нет лидов', de: 'Keine Leads', fr: 'Aucun prospect', it: 'Nessun lead', ja: 'リードなし', ko: '리드 없음', ar: 'لا يوجد عملاء محتملون' },
  unnamed:    { en: uiText('generatedUi.u_ec3be783cc7bc215'), es: 'Empresa sin nombre', pt: 'Empresa sem nome', pl: 'Firma bez nazwy', ru: 'Компания без названия', de: 'Unbenanntes Unternehmen', fr: 'Entreprise sans nom', it: 'Azienda senza nome', ja: '名称未設定の会社', ko: '이름 없는 회사', ar: 'شركة بلا اسم' },
  noIndustry: { en: uiText('generatedUi.u_ae4c00e6a9bd0ba4'), es: 'Sin industria', pt: 'Sem indústria', pl: 'Brak branży', ru: 'Без отрасли', de: 'Keine Branche', fr: 'Aucun secteur', it: 'Nessun settore', ja: '業界なし', ko: '업종 없음', ar: 'لا يوجد قطاع' },
  noCountry:  { en: uiText('generatedUi.u_b70285418438b053'), es: 'Sin país', pt: 'Sem país', pl: 'Brak kraju', ru: 'Без страны', de: 'Kein Land', fr: 'Aucun pays', it: 'Nessun paese', ja: '国なし', ko: '국가 없음', ar: 'لا يوجد بلد' },
  noEmail:    { en: uiText('generatedUi.u_2f44d9d0a44fa838'), es: 'Sin email', pt: 'Sem email', pl: 'Brak emaila', ru: 'Без email', de: 'Keine E-Mail', fr: 'Aucun e-mail', it: 'Nessuna email', ja: 'メールなし', ko: '이메일 없음', ar: 'لا يوجد بريد إلكتروني' },
  draft:      { en: uiText('generatedUi.u_d156b8fc2bbacf41'), es: 'Borrador:', pt: 'Rascunho:', pl: 'Szkic:', ru: 'Черновик:', de: 'Entwurf:', fr: 'Brouillon :', it: 'Bozza:', ja: '下書き：', ko: '초안:', ar: 'مسودة:' },
  statuses: {
    discovered:   { en: uiText('generatedUi.u_96a5ba634bfc2ed4'),   es: 'Descubierto',  pt: 'Descoberto',  pl: 'Odkryty',        ru: 'Обнаружен', de: 'Erkannt', fr: 'Découvert', it: 'Rilevato', ja: '検出済み', ko: '검색됨', ar: 'مُكتشَف' },
    approved:     { en: uiText('generatedUi.u_87b42e40c2a290e0'),     es: 'Aprobado',     pt: 'Aprovado',    pl: 'Zatwierdzony',   ru: 'Одобрен', de: 'Genehmigt', fr: 'Approuvé', it: 'Approvato', ja: '承認済み', ko: '승인됨', ar: 'تمت الموافقة' },
    draft_ready:  { en: uiText('generatedUi.u_034d508c85559380'),  es: 'Borrador listo', pt: 'Rascunho pronto', pl: 'Szkic gotowy', ru: 'Черновик готов', de: 'Entwurf bereit', fr: 'Brouillon prêt', it: 'Bozza pronta', ja: '下書き準備完了', ko: '초안 준비됨', ar: 'المسودة جاهزة' },
    sketch_ready: { en: uiText('generatedUi.u_fad8fb09b821a826'), es: 'Esquema listo', pt: 'Esboço pronto', pl: 'Szkic gotowy', ru: 'Эскиз готов', de: 'Skizze bereit', fr: 'Esquisse prête', it: 'Bozza pronta', ja: 'スケッチ準備完了', ko: '스케치 준비됨', ar: 'المخطط جاهز' },
    sent:         { en: uiText('generatedUi.u_c16bc82bf1f04ede'),         es: 'Enviado',      pt: 'Enviado',     pl: 'Wysłany',        ru: 'Отправлен', de: 'Gesendet', fr: 'Envoyé', it: 'Inviato', ja: '送信済み', ko: '발송됨', ar: 'تم الإرسال' },
    replied:      { en: uiText('generatedUi.u_1cd7fa936258e09c'),      es: 'Respondió',    pt: 'Respondeu',   pl: 'Odpowiedział',   ru: 'Ответил', de: 'Beantwortet', fr: 'Répondu', it: 'Risposto', ja: '返信済み', ko: '답장함', ar: 'تم الرد' },
    client:       { en: uiText('generatedUi.u_0c77fe09ab336a3e'),       es: 'Cliente',      pt: 'Cliente',     pl: 'Klient',         ru: 'Клиент', de: 'Kunde', fr: 'Client', it: 'Cliente', ja: 'クライアント', ko: '클라이언트', ar: 'العميل' },
    draft_failed: { en: uiText('generatedUi.u_cf5f027c83afa32e'), es: 'Borrador fallido', pt: 'Rascunho falhou', pl: 'Szkic nieudany', ru: 'Ошибка черновика', de: 'Entwurf fehlgeschlagen', fr: 'Échec du brouillon', it: 'Bozza non riuscita', ja: '下書きに失敗しました', ko: '초안 작성 실패', ar: 'فشلت المسودة' },
  },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

const STATUS_ACCENT: Record<string, string> = {
  discovered: '#7dd3fc', approved: '#86efac', draft_ready: '#fde68a', sketch_ready: '#c4b5fd',
  sent: '#fdba74', replied: '#1af0ff', client: '#4ade80', draft_failed: '#f87171',
}

type Lead = {
  id: string; company?: string; contact_name?: string; email?: string
  industry?: string; country?: string; language?: string; status?: string
  draft_subject?: string; draft_body?: string; last_error?: string
}

const STATUSES = ['discovered', 'approved', 'draft_ready', 'sketch_ready', 'sent', 'replied', 'client', 'draft_failed']

export default function SalesPipelinePage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en'

  const [leads, setLeads]     = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/sales/pipeline')
      .then(r => r.json())
      .then(data => { if (!cancelled) setLeads(data.leads ?? []) })
      .catch(() => { if (!cancelled) setLeads([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const grouped = STATUSES.map(status => ({
    status,
    leads: leads.filter(l => (l.status || 'discovered') === status),
  }))

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 'clamp(18px,4vw,40px) 0 80px', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.18), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)', marginBottom: 22 }}>
        <p className="sb-eyebrow">💼 {c('eyebrow', l)}</p>
        <h1 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '8px 0 10px' }}>{c('title', l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.7, maxWidth: 520, margin: 0 }}>{c('subtitle', l)}</p>
      </div>

      {loading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>{c('loading', l)}</p>}

      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))', gap: 14, overflowX: 'auto', alignItems: 'start' }}>
          {grouped.map(group => {
            const accent = STATUS_ACCENT[group.status] || '#7dd3fc'
            const statusLabel = (COPY.statuses as any)[group.status]?.[l as Lang] || group.status
            return (
              <section key={group.status} style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.6), rgba(3,7,18,.5))', border: '1px solid rgba(255,255,255,.08)', borderTop: `3px solid ${accent}`, borderRadius: 18, padding: 14, minHeight: 120 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: accent }}>{statusLabel}</h2>
                  <span style={{ fontSize: 11, fontWeight: 900, color: accent, background: `${accent}18`, border: `1px solid ${accent}44`, borderRadius: 999, padding: '2px 7px' }}>{group.leads.length}</span>
                </div>

                {group.leads.length === 0 && (
                  <p style={{ color: 'rgba(255,255,255,.25)', fontSize: 12, margin: 0 }}>{c('noLeads', l)}</p>
                )}

                {group.leads.map(lead => (
                  <article key={lead.id} style={{ background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <strong style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#fff' }}>{lead.company || c('unnamed', l)}</strong>
                    <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                      {lead.industry || c('noIndustry', l)} · {lead.country || c('noCountry', l)}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,.5)' }}>
                      {lead.email || c('noEmail', l)}
                    </div>
                    {lead.draft_subject && (
                      <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,195,0,.06)', color: 'rgba(255,255,255,.75)', fontSize: 11 }}>
                        <strong style={{ color: '#ffc300' }}>{c('draft', l)}</strong> {lead.draft_subject}
                      </div>
                    )}
                    {lead.last_error && (
                      <div style={{ marginTop: 8, color: '#f87171', fontSize: 11 }}>{lead.last_error}</div>
                    )}
                  </article>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
