'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const COPY = {
  eyebrow:      { en: uiText('generatedUi.u_12942e73e6627f61'), es: 'Podcast Studio', pt: 'Podcast Studio', pl: 'Podcast Studio', ru: 'Студия подкастов', de: 'Podcast-Studio', fr: 'Studio de podcasts', it: 'Studio podcast', ja: 'ポッドキャストスタジオ', ko: '팟캐스트 스튜디오', ar: 'استوديو البودكاست' },
  title:        { en: uiText('generatedUi.u_ce1db08114c7b626'), es: '🎚️ Optimizar Podcast Studio', pt: '🎚️ Otimizar Podcast Studio', pl: '🎚️ Optymalizuj Podcast Studio', ru: '🎚️ Оптимизация студии подкастов', de: '🎚️ Podcast-Studio optimieren', fr: '🎚️ Optimiser le Studio podcast', it: '🎚️ Ottimizza lo Studio podcast', ja: '🎚️ ポッドキャストスタジオを最適化', ko: '🎚️ 팟캐스트 스튜디오 최적화', ar: '🎚️ تحسين استوديو البودكاست' },
  subtitle:     { en: uiText('generatedUi.u_2a543f7cad07ed0e'), es: 'Audita tu feed de podcast para requisitos de Apple/Spotify, calidad de episodios y crecimiento — y obtén un plan de acción priorizado.', pt: 'Audite seu feed de podcast para requisitos da Apple/Spotify, qualidade dos episódios e crescimento — e obtenha um plano de ação priorizado.', pl: 'Sprawdź swój feed podcastu pod kątem wymagań Apple/Spotify, jakości odcinków i wzrostu — i uzyskaj priorytetowy plan działania.', ru: 'Проверьте ваш RSS-фид на соответствие требованиям Apple/Spotify, качество эпизодов и рост — и получите приоритетный план действий.', de: 'Prüfen Sie Ihren Podcast-Feed auf Apple-/Spotify-Anforderungen, Episodenqualität und Wachstum – und erhalten Sie einen priorisierten Aktionsplan.', fr: 'Auditez votre flux de podcast selon les exigences d\'Apple/Spotify, la qualité des épisodes et la croissance, et obtenez un plan d\'action priorisé.', it: 'Esegui l\'audit del feed del tuo podcast per requisiti Apple/Spotify, qualità degli episodi e crescita, e ottieni un piano d\'azione prioritizzato.', ja: 'ポッドキャストフィードを Apple/Spotify の要件、エピソードの品質、成長の観点から監査し、優先順位付きのアクションプランを入手しましょう。', ko: 'Apple/Spotify 요구 사항, 에피소드 품질, 성장 측면에서 팟캐스트 피드를 감사하고 우선순위가 지정된 실행 계획을 받아보세요.', ar: 'دقّق خلاصة البودكاست الخاصة بك وفق متطلبات Apple/Spotify وجودة الحلقات والنمو، واحصل على خطة عمل مرتبة حسب الأولوية.' },
  placeholder:  { en: uiText('generatedUi.u_ccd79497291a72d4'), es: 'URL de tu feed RSS o enlace de Apple Podcasts', pt: 'URL do seu feed RSS ou link do Apple Podcasts', pl: 'URL Twojego feeda RSS lub link do Apple Podcasts', ru: 'URL вашего RSS-фида или ссылка на Apple Podcasts', de: 'Ihre RSS-Feed-URL oder ein Apple-Podcasts-Link', fr: 'L’URL de votre flux RSS ou un lien Apple Podcasts', it: 'L’URL del tuo feed RSS o un link di Apple Podcasts', ja: 'RSS フィードの URL、または Apple Podcasts のリンク', ko: 'RSS 피드 URL 또는 Apple Podcasts 링크', ar: 'عنوان URL لموجز RSS الخاص بك، أو رابط Apple Podcasts' },
  hint:         { en: uiText('generatedUi.u_2f1a0841ecbd9b21'), es: '¿No tienes tu URL de feed? Pega el enlace de tu página de Apple Podcasts y lo encontraremos.', pt: 'Não tem a URL do seu feed? Cole o link da sua página do Apple Podcasts e encontraremos.', pl: 'Nie masz URL feeda? Wklej link do swojej strony Apple Podcasts, a my go znajdziemy.', ru: 'Нет URL фида? Вставьте ссылку на страницу Apple Podcasts, и мы найдём его.', de: 'Sie kennen Ihre Feed-URL nicht? Fügen Sie den Link zu Ihrer Apple-Podcasts-Seite ein, und wir finden sie.', fr: 'Vous n\'avez pas l\'URL de votre flux ? Collez le lien de votre page Apple Podcasts et nous la trouverons.', it: 'Non hai l\'URL del tuo feed? Incolla il link della tua pagina Apple Podcasts e lo troveremo noi.', ja: 'フィード URL がわかりませんか？Apple Podcasts のページリンクを貼り付ければ、こちらで見つけます。', ko: '피드 URL이 없으신가요? Apple Podcasts 페이지 링크를 붙여 넣으면 찾아 드립니다.', ar: 'ليس لديك عنوان URL للخلاصة؟ الصق رابط صفحتك على Apple Podcasts وسنعثر عليه.' },
  auditing:     { en: uiText('generatedUi.u_cb0544450e1be874'), es: 'Auditando…', pt: 'Auditando…', pl: 'Audytowanie…', ru: 'Аудит…', de: 'Wird geprüft…', fr: 'Audit en cours…', it: 'Audit in corso…', ja: '監査中…', ko: '감사 중…', ar: 'جارٍ التدقيق…' },
  auditBtn:     { en: uiText('generatedUi.u_51dac7f147bdb201'), es: 'Auditar podcast', pt: 'Auditar podcast', pl: 'Audytuj podcast', ru: 'Аудит подкаста', de: 'Audit-Podcast', fr: 'Podcast d’audit', it: 'Podcast di audit', ja: '監査ポッドキャスト', ko: '감사 팟캐스트', ar: 'بودكاست التدقيق' },
  fetching:     { en: uiText('generatedUi.u_9327703dcf6d1d65'), es: 'Obteniendo tu feed y ejecutando verificaciones…', pt: 'Buscando seu feed e executando verificações…', pl: 'Pobieranie feeda i uruchamianie sprawdzeń…', ru: 'Загрузка фида и выполнение проверок…', de: 'Ihr Feed wird abgerufen und geprüft …', fr: 'Récupération de votre flux et exécution des vérifications…', it: 'Recupero del feed ed esecuzione dei controlli in corso…', ja: 'フィードを取得してチェックを実行しています…', ko: '피드를 가져와 검사를 실행하는 중…', ar: 'جارٍ جلب الموجز وتشغيل عمليات التحقق…' },
  episodes:     { en: uiText('generatedUi.u_a8ace1a76c218f36'), es: 'episodios', pt: 'episódios', pl: 'odcinki', ru: 'эпизодов', de: 'Folgen', fr: 'épisodes', it: 'episodi', ja: 'エピソード', ko: '에피소드', ar: 'حلقات' },
  aiTip:        { en: uiText('generatedUi.u_2474832a54d3ecc7'), es: 'Consejo: conecta una clave AI para un plan de acción más completo.', pt: 'Dica: conecte uma chave AI para um plano de ação mais completo.', pl: 'Wskazówka: połącz klucz AI, aby uzyskać bogatszy plan działania.', ru: 'Совет: подключите ключ AI для более подробного плана действий.', de: 'Tipp: Verbinden Sie einen KI-Schlüssel für einen ausführlicheren, schriftlichen Aktionsplan.', fr: 'Astuce : connectez une clé d\'IA pour obtenir un plan d\'action rédigé plus complet.', it: 'Suggerimento: collega una chiave AI per un piano d\'azione scritto più completo.', ja: 'ヒント：AI キーを接続すると、より充実した文書形式のアクションプランを取得できます。', ko: '팁: AI 키를 연결하면 더 풍부한 서면 실행 계획을 받을 수 있습니다.', ar: 'نصيحة: اربط مفتاح ذكاء اصطناعي للحصول على خطة عمل مكتوبة أكثر تفصيلًا.' },
  defaultError: { en: uiText('generatedUi.u_7053bc77f6a316e1'), es: 'No se pudo auditar ese feed.', pt: 'Não foi possível auditar esse feed.', pl: 'Nie można przeprowadzić audytu tego feeda.', ru: 'Не удалось проверить этот фид.', de: 'Dieser Feed konnte nicht geprüft werden.', fr: 'Impossible d\'auditer ce flux.', it: 'Impossibile verificare quel feed.', ja: 'そのフィードを監査できませんでした。', ko: '해당 피드를 감사할 수 없습니다.', ar: 'تعذّر تدقيق هذه الخلاصة.' },
  genericError: { en: uiText('generatedUi.u_160af589f8c04ea8'), es: 'Algo salió mal durante la auditoría.', pt: 'Algo deu errado durante a auditoria.', pl: 'Coś poszło nie tak podczas audytu.', ru: 'Что-то пошло не так при выполнении аудита.', de: 'Beim Ausführen der Prüfung ist ein Fehler aufgetreten.', fr: 'Une erreur s’est produite lors de l’exécution de l’audit.', it: 'Si è verificato un errore durante l’esecuzione dell’audit.', ja: '監査の実行中に問題が発生しました。', ko: '감사를 실행하는 중 문제가 발생했습니다.', ar: 'حدث خطأ أثناء تشغيل التدقيق.' },
}

function c(key: string, lang: string): string {
  return (COPY as any)[key]?.[lang as Lang] ?? (COPY as any)[key]?.en ?? key
}

type Status = 'pass' | 'warn' | 'fail'
type Check = { id: string; label: string; category: string; status: Status; detail: string; recommendation: string }
type Result = { url: string; feedUrl: string; show: string; episodes: number; score: number; checks: Check[]; summary: string; source: string }

const STATUS_UI: Record<Status, { color: string; bg: string; border: string; icon: string }> = {
  pass: { color: '#86efac', bg: 'rgba(134,239,172,.1)',  border: 'rgba(134,239,172,.22)', icon: '✓' },
  warn: { color: '#fde68a', bg: 'rgba(253,230,138,.1)',  border: 'rgba(253,230,138,.22)', icon: '!' },
  fail: { color: '#fca5a5', bg: 'rgba(252,165,165,.1)',  border: 'rgba(252,165,165,.22)', icon: '×' },
}

function scoreColor(s: number) {
  if (s >= 80) return '#86efac'
  if (s >= 50) return '#fde68a'
  return '#fca5a5'
}

export default function PodcastStudioOptimizationPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en'

  const [url, setUrl]       = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState('')
  const [result, setResult] = useState<Result | null>(null)

  async function audit() {
    const value = url.trim()
    if (!value || loading) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/podcast/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: value, language: lang }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data?.error || c('defaultError', l)); return }
      setResult(data)
    } catch {
      setError(c('genericError', l))
    } finally {
      setLoading(false)
    }
  }

  const categories = result ? Array.from(new Set(result.checks.map(ch => ch.category))) : []

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: 'clamp(18px,4vw,40px) 0 80px', color: 'var(--text-primary)', display: 'grid', gap: 20 }}>

      {/* Header */}
      <div style={{ background: 'radial-gradient(circle at 20% 10%, rgba(26,240,255,.18), transparent 24rem), linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,.02))', border: '1px solid rgba(26,240,255,.18)', borderRadius: 28, padding: 'clamp(20px,4vw,32px)' }}>
        <p className="sb-eyebrow">🎙️ {c('eyebrow', l)}</p>
        <h1 style={{ fontSize: 'clamp(22px,4vw,36px)', fontWeight: 900, letterSpacing: '-.04em', lineHeight: 1.1, margin: '8px 0 10px' }}>{c('title', l)}</h1>
        <p style={{ color: 'rgba(255,255,255,.62)', fontSize: 14, lineHeight: 1.7, maxWidth: 620, margin: '0 0 20px' }}>{c('subtitle', l)}</p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input
            className="sb-input"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') audit() }}
            placeholder={c('placeholder', l)}
            style={{ flex: 1, minWidth: 260, padding: '12px 16px', borderRadius: 12, fontSize: 14 }}
            disabled={loading}
          />
          <button
            onClick={audit}
            disabled={loading || !url.trim()}
            className="sb-button-primary"
            style={{ opacity: loading || !url.trim() ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
          >
            {loading ? c('auditing', l) : c('auditBtn', l)}
          </button>
        </div>
        <p style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, marginTop: 8 }}>{c('hint', l)}</p>
        {error && <p style={{ color: '#fca5a5', fontSize: 13, marginTop: 10 }}>{error}</p>}
        {loading && <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, marginTop: 12 }}>{c('fetching', l)}</p>}
      </div>

      {/* Result */}
      {result && (
        <>
          {/* Score card */}
          <div style={{ background: 'linear-gradient(145deg, rgba(15,23,42,.78), rgba(3,7,18,.68))', border: '1px solid rgba(255,255,255,.12)', borderRadius: 24, padding: 'clamp(16px,3vw,24px)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 22, alignItems: 'center' }}>
            <div style={{ width: 100, height: 100, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `5px solid ${scoreColor(result.score)}`, boxShadow: `0 0 32px ${scoreColor(result.score)}44`, flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: scoreColor(result.score), lineHeight: 1 }}>{result.score}</div>
                <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>/ 100</div>
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              {result.show && <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4, letterSpacing: '-.02em' }}>{result.show}</div>}
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 10 }}>{result.episodes} {c('episodes', l)} · {result.feedUrl}</div>
              <p style={{ color: 'rgba(255,255,255,.82)', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>{result.summary}</p>
              {result.source === 'deterministic' && (
                <p style={{ color: 'rgba(255,255,255,.38)', fontSize: 12, marginTop: 8 }}>{c('aiTip', l)}</p>
              )}
            </div>
          </div>

          {/* Checks by category */}
          {categories.map(cat => (
            <div key={cat}>
              <p className="sb-eyebrow" style={{ marginBottom: 10 }}>{cat}</p>
              <div style={{ display: 'grid', gap: 8 }}>
                {result.checks.filter(ch => ch.category === cat).map(ch => {
                  const ui = STATUS_UI[ch.status]
                  return (
                    <div key={ch.id} style={{ background: ui.bg, border: `1px solid ${ui.border}`, borderRadius: 16, padding: 14, display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', background: `${ui.color}22`, color: ui.color, fontWeight: 900, fontSize: 14, border: `1px solid ${ui.border}` }}>{ui.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ color: '#fff', fontSize: 14 }}>{ch.label}</strong>
                        <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, marginTop: 3, lineHeight: 1.6 }}>{ch.detail}</div>
                        {ch.status !== 'pass' && ch.recommendation && (
                          <div style={{ fontSize: 13, marginTop: 6, color: ui.color, fontWeight: 700 }}>→ {ch.recommendation}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
