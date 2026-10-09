'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

const COPY = {
  eyebrow:    { en: uiText('generatedUi.u_9c39bd2b9a170601'), es: 'Estratega', pt: 'Estrategista', pl: 'Strateg', ru: 'Стратег', de: 'Stratege', fr: 'Stratège', it: 'Stratega', ja: 'ストラテジスト', ko: '전략가', ar: 'الخبير الاستراتيجي' },
  title:      { en: uiText('generatedUi.u_5bfacdc176a5afa9'), es: 'Radar de oportunidades', pt: 'Radar de oportunidades', pl: 'Radar okazji', ru: 'Радар возможностей', de: 'Chancen-Radar', fr: 'Radar des opportunités', it: 'Radar delle opportunità', ja: '機会レーダー', ko: '기회 레이더', ar: 'رادار الفرص' },
  subtitle:   { en: uiText('generatedUi.u_a2f665a2d38fc420'), es: 'Tu estratega IA escanea el mercado a diario en busca de movimientos de competidores, brechas y oportunidades.', pt: 'Seu estrategista IA varre o mercado diariamente em busca de movimentos de concorrentes, lacunas e oportunidades.', pl: 'Twój strateg AI codziennie skanuje rynek w poszukiwaniu ruchów konkurencji, luk i okazji.', ru: 'Ваш ИИ-стратег ежедневно сканирует рынок: действия конкурентов, ниши и партнёрства.', de: 'Ihr KI-Stratege durchsucht den Markt täglich nach Wettbewerberaktivitäten, Lücken und Partnerschaftsmöglichkeiten.', fr: 'Votre stratège IA analyse le marché chaque jour pour repérer les mouvements des concurrents, les lacunes et les opportunités de partenariat.', it: 'Il tuo stratega AI analizza ogni giorno il mercato alla ricerca di mosse dei concorrenti, lacune e opportunità di partnership.', ja: 'AI ストラテジストが毎日市場をスキャンし、競合の動き、ギャップ、提携機会を見つけます。', ko: 'AI 전략가가 매일 시장을 스캔하여 경쟁사 동향, 격차, 파트너십 기회를 찾습니다.', ar: 'يفحص خبيرك الاستراتيجي بالذكاء الاصطناعي السوق يوميًا بحثًا عن تحركات المنافسين والفجوات وفرص الشراكة.' },
  scanNow:    { en: uiText('generatedUi.u_cda8fe3b54175035'), es: 'Escanear ahora', pt: 'Escanear agora', pl: 'Skanuj teraz', ru: 'Сканировать сейчас', de: 'Scan jetzt ausführen', fr: 'Lancer l’analyse maintenant', it: 'Esegui scansione ora', ja: '今すぐスキャン', ko: '지금 스캔 실행', ar: 'تشغيل الفحص الآن' },
  scanning:   { en: uiText('generatedUi.u_2a46b197ff653cb9'), es: 'Escaneando el mercado…', pt: 'Varrendo o mercado…', pl: 'Skanowanie rynku…', ru: 'Сканирование рынка…', de: 'Markt wird gescannt…', fr: 'Analyse du marché…', it: 'Scansione del mercato…', ja: '市場をスキャン中…', ko: '시장 스캔 중…', ar: 'جارٍ فحص السوق…' },
  empty:      { en: uiText('generatedUi.u_d2ca83465869e3c6'), es: 'Sin alertas aún. Ejecuta un escaneo para llenar el radar.', pt: 'Sem alertas ainda. Execute uma varredura para popular o radar.', pl: 'Brak alertów. Uruchom skan, aby zapełnić radar.', ru: 'Пока нет оповещений. Запустите сканирование.', de: 'Noch keine Warnungen. Führen Sie einen Scan aus, um das Radar zu füllen.', fr: 'Aucune alerte pour le moment. Lancez une analyse pour alimenter le radar.', it: 'Nessun avviso per ora. Esegui una scansione per popolare il radar.', ja: 'アラートはまだありません。スキャンを実行してレーダーにデータを表示してください。', ko: '아직 알림이 없습니다. 스캔을 실행하여 레이더를 채우세요.', ar: 'لا توجد تنبيهات بعد. شغّل فحصًا لملء الرادار.' },
  what:       { en: uiText('generatedUi.u_483bd49023ae2bfb'), es: 'Qué pasó', pt: 'O que aconteceu', pl: 'Co się stało', ru: 'Что произошло', de: 'Was ist passiert', fr: 'Ce qui s’est passé', it: 'Cosa è successo', ja: '発生した事象', ko: '발생한 일', ar: 'ما الذي حدث' },
  why:        { en: uiText('generatedUi.u_b8bda68d85740402'), es: 'Por qué importa', pt: 'Por que importa', pl: 'Dlaczego to ważne', ru: 'Почему это важно', de: 'Warum es wichtig ist', fr: 'Pourquoi c\'est important', it: 'Perché è importante', ja: '重要な理由', ko: '중요한 이유', ar: 'لماذا يهم ذلك' },
  action:     { en: uiText('generatedUi.u_0cdf19eece16f608'), es: 'Acción recomendada', pt: 'Ação recomendada', pl: 'Zalecane działanie', ru: 'Рекомендуемое действие', de: 'Empfohlene Maßnahme', fr: 'Action recommandée', it: 'Azione consigliata', ja: '推奨アクション', ko: '권장 조치', ar: 'الإجراء الموصى به' },
  sources:    { en: uiText('generatedUi.u_caf85b0888d78f1f'), es: 'Fuentes', pt: 'Fontes', pl: 'Źródła', ru: 'Источники', de: 'Quellen', fr: 'Sources', it: 'Fonti', ja: 'ソース', ko: '출처', ar: 'المصادر' },
  reviewed:   { en: uiText('generatedUi.u_f73cf2143127e953'), es: 'Marcar revisado', pt: 'Marcar revisado', pl: 'Oznacz jako przejrzane', ru: 'Просмотрено', de: 'Als geprüft markieren', fr: 'Marquer comme examiné', it: 'Segna come revisionato', ja: 'レビュー済みにする', ko: '검토됨으로 표시', ar: 'وضع علامة كمُراجَع' },
  dismiss:    { en: uiText('generatedUi.u_48845bff334a50a5'), es: 'Descartar', pt: 'Dispensar', pl: 'Odrzuć', ru: 'Скрыть', de: 'Verwerfen', fr: 'Ignorer', it: 'Ignora', ja: '閉じる', ko: '닫기', ar: 'تجاهل' },
  unauthorized:{ en: uiText('generatedUi.u_9696797799f58af7'), es: 'Se requiere acceso de propietario/administrador.', pt: 'Acesso de proprietário/administrador necessário.', pl: 'Wymagany dostęp właściciela/administratora.', ru: 'Требуется доступ владельца/администратора.', de: 'Inhaber-/Admin-Zugriff erforderlich.', fr: 'Accès propriétaire/administrateur requis.', it: 'Accesso proprietario/amministratore richiesto.', ja: 'オーナー／管理者のアクセス権が必要です。', ko: '소유자/관리자 액세스 권한이 필요합니다.', ar: 'يلزم وصول المالك/المسؤول.' },
  loadError:  { en: uiText('generatedUi.u_e8272230a6f3b64b'), es: 'No se pudieron cargar las alertas.', pt: 'Não foi possível carregar os alertas.', pl: 'Nie udało się załadować alertów.', ru: 'Не удалось загрузить оповещения.', de: 'Warnungen konnten nicht geladen werden.', fr: 'Impossible de charger les alertes.', it: 'Impossibile caricare gli avvisi.', ja: 'アラートを読み込めませんでした。', ko: '알림을 불러올 수 없습니다.', ar: 'تعذّر تحميل التنبيهات.' },
  scanned:    { en: uiText('generatedUi.u_b62f78df03f4339c'), es: 'Escaneo completo — nuevas alertas:', pt: 'Varredura concluída — novos alertas:', pl: 'Skan zakończony — nowe alerty:', ru: 'Сканирование завершено — новых оповещений:', de: 'Scan abgeschlossen – neue Warnungen:', fr: 'Analyse terminée — nouvelles alertes :', it: 'Scansione completata — nuovi avvisi:', ja: 'スキャン完了 — 新しいアラート：', ko: '스캔 완료 — 새 알림:', ar: 'اكتمل الفحص — تنبيهات جديدة:' },
}

const CATEGORY_STYLE: Record<string, { label: string; color: string }> = {
  competitor:  { label: uiText('generatedUi.u_620e0a4142db9518'),  color: 'rgba(255,99,99,.85)' },
  market_gap:  { label: uiText('generatedUi.u_8b05d06ab8c1de75'),  color: 'rgba(26,240,255,.85)' },
  partnership: { label: uiText('generatedUi.u_e5e902bdd0ba8844'), color: 'rgba(118,255,140,.85)' },
  pricing:     { label: uiText('generatedUi.u_06a436b9f3fc9305'),     color: 'rgba(255,195,0,.9)' },
  trend:       { label: uiText('generatedUi.u_6911807a8185aa70'),       color: 'rgba(190,140,255,.9)' },
}

function c(obj: any, lang: string): string {
  return obj?.[lang as Lang] ?? obj?.en ?? ''
}

type Alert = {
  id: string
  title: string
  what_happened: string
  why_it_matters: string
  recommended_action: string
  category: string
  source_urls: string[]
  status: string
  created_at: string
}

export default function OpportunitiesPage() {
  const { lang } = useI18n()
  const l = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang

  const [alerts, setAlerts]     = useState<Alert[]>([])
  const [loading, setLoading]   = useState(true)
  const [scanning, setScanning] = useState(false)
  const [notice, setNotice]     = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/opportunities')
      if (res.status === 401) { setNotice(c(COPY.unauthorized, l)); setAlerts([]); return }
      const data = await res.json()
      setAlerts(Array.isArray(data?.alerts) ? data.alerts : [])
    } catch {
      setNotice(c(COPY.loadError, l))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function scanNow() {
    if (scanning) return
    setScanning(true); setNotice('')
    try {
      const res = await fetch('/api/admin/opportunities', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setNotice(`${c(COPY.scanned, l)} ${data?.inserted ?? 0}`)
        await load()
      } else {
        setNotice(String(data?.error || c(COPY.loadError, l)))
      }
    } catch {
      setNotice(c(COPY.loadError, l))
    } finally {
      setScanning(false)
    }
  }

  async function setStatus(id: string, status: 'reviewed' | 'dismissed') {
    try {
      await fetch('/api/admin/opportunities', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      setAlerts(prev => status === 'dismissed'
        ? prev.filter(a => a.id !== id)
        : prev.map(a => (a.id === id ? { ...a, status } : a)))
    } catch { /* non-blocking */ }
  }

  const visible = alerts.filter(a => a.status !== 'dismissed')

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '24px 0', color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(255,195,0,.14), transparent 22rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(255,195,0,.22)', borderRadius: 24, padding: '20px 24px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p className="sb-eyebrow">📡 {c(COPY.eyebrow, l)}</p>
          <h1 style={{ fontSize: 'clamp(20px,3.5vw,30px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '6px 0 6px' }}>{c(COPY.title, l)}</h1>
          <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 560 }}>{c(COPY.subtitle, l)}</p>
        </div>
        <button
          onClick={scanNow}
          disabled={scanning}
          className="sb-button-primary"
          style={{ padding: '12px 22px', borderRadius: 14, fontSize: 14, opacity: scanning ? 0.6 : 1, cursor: scanning ? 'wait' : 'pointer', flexShrink: 0 }}
        >
          {scanning ? c(COPY.scanning, l) : `🔍 ${c(COPY.scanNow, l)}`}
        </button>
      </div>

      {notice && (
        <div style={{ border: '1px solid rgba(26,240,255,.25)', background: 'rgba(26,240,255,.06)', borderRadius: 14, padding: '10px 16px', fontSize: 13, marginBottom: 14 }}>
          {notice}
        </div>
      )}

      {loading && <p style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>…</p>}

      {!loading && visible.length === 0 && (
        <div style={{ border: '1px dashed rgba(255,255,255,.18)', borderRadius: 18, padding: '36px 24px', textAlign: 'center', color: 'rgba(255,255,255,.55)', fontSize: 14 }}>
          📡 {c(COPY.empty, l)}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visible.map(alert => {
          const cat = CATEGORY_STYLE[alert.category] ?? CATEGORY_STYLE.trend
          const date = new Date(alert.created_at).toLocaleDateString()
          return (
            <div key={alert.id} style={{ border: '1px solid rgba(255,255,255,.12)', background: 'linear-gradient(145deg, rgba(15,23,42,.8), rgba(3,7,18,.7))', borderRadius: 18, padding: '18px 20px', opacity: alert.status === 'reviewed' ? 0.65 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: cat.color, border: `1px solid ${cat.color}`, borderRadius: 999, padding: '3px 10px' }}>{cat.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,.4)' }}>{date}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {alert.status !== 'reviewed' && (
                    <button onClick={() => setStatus(alert.id, 'reviewed')} className="sb-button-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>✓ {c(COPY.reviewed, l)}</button>
                  )}
                  <button onClick={() => setStatus(alert.id, 'dismissed')} className="sb-button-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>× {c(COPY.dismiss, l)}</button>
                </div>
              </div>

              <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', margin: '10px 0 10px', lineHeight: 1.3 }}>{alert.title}</h2>

              <div style={{ display: 'grid', gap: 8, fontSize: 13, lineHeight: 1.65 }}>
                <p style={{ margin: 0 }}><strong style={{ color: 'rgba(26,240,255,.9)' }}>{c(COPY.what, l)}:</strong> {alert.what_happened}</p>
                <p style={{ margin: 0 }}><strong style={{ color: 'rgba(255,195,0,.9)' }}>{c(COPY.why, l)}:</strong> {alert.why_it_matters}</p>
                <p style={{ margin: 0 }}><strong style={{ color: 'rgba(118,255,140,.9)' }}>{c(COPY.action, l)}:</strong> {alert.recommended_action}</p>
              </div>

              {alert.source_urls?.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.45)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span>{c(COPY.sources, l)}:</span>
                  {alert.source_urls.map((u, i) => (
                    <a key={u + i} href={u} target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(26,240,255,.75)', textDecoration: 'none', wordBreak: 'break-all' }}>{new URL(u).hostname}</a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
