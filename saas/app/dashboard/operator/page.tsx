'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const COPY: Record<string, Record<Lang, string>> = {
  eyebrow:      { en: uiText('generatedUi.u_3b10aa74ffbb9c3a'), es: 'Constructor de sitios con IA', pt: 'Construtor de sites com IA', pl: 'Kreator stron z IA', ru: 'ИИ-конструктор сайтов', de: 'KI-Website-Builder', fr: 'Créateur de sites web IA', it: 'Website builder AI', ja: 'AI Web サイトビルダー', ko: 'AI 웹사이트 빌더', ar: 'أداة إنشاء المواقع بالذكاء الاصطناعي' },
  title:        { en: uiText('generatedUi.u_56f560241a005104'), es: 'Construir sitio web', pt: 'Criar site', pl: 'Zbuduj stronę', ru: 'Создать сайт', de: 'Website erstellen', fr: 'Créer le site web', it: 'Crea sito web', ja: 'ウェブサイトを構築', ko: '웹사이트 구축', ar: 'إنشاء موقع إلكتروني' },
  subtitle:     { en: uiText('generatedUi.u_476e0af2a6fd82df'), es: 'Describe tu negocio y generaremos un sitio web completo y multilingüe que puedes publicar al instante.', pt: 'Descreva seu negócio e geraremos um site completo e multilíngue que você pode publicar instantaneamente.', pl: 'Opisz swoją firmę, a wygenerujemy kompletną, wielojęzyczną stronę, którą możesz natychmiast opublikować.', ru: 'Опишите свой бизнес, и мы создадим полноценный многоязычный сайт.', de: 'Beschreiben Sie Ihr Unternehmen und wir erstellen eine vollständige, mehrsprachige Website, die Sie sofort veröffentlichen können.', fr: 'Décrivez votre activité et nous générerons un site web complet et multilingue que vous pourrez publier instantanément.', it: 'Descrivi la tua attività e genereremo un sito web completo e multilingue che potrai pubblicare all’istante.', ja: 'ビジネスについて説明していただければ、すぐに公開できる多言語対応の完全な Web サイトを生成します。', ko: '비즈니스를 설명해 주시면 즉시 게시할 수 있는 완전한 다국어 웹사이트를 생성해 드립니다.', ar: 'صِف نشاطك التجاري وسننشئ موقعًا إلكترونيًا كاملًا ومتعدد اللغات يمكنك نشره فورًا.' },
  placeholder:  { en: uiText('generatedUi.u_d164ebdfd8991b41'), es: 'p.ej. Un acogedor restaurante italiano en el centro de Chicago especializado en pasta casera…', pt: 'ex. Um aconchegante restaurante italiano no centro de Chicago especializado em massa artesanal…', pl: 'np. Przytulna włoska restauracja w centrum Chicago specjalizująca się w domowym makaronie…', ru: 'напр. Уютный итальянский ресторан в центре Чикаго, специализирующийся на домашней пасте…', de: 'z. B. Ein gemütliches italienisches Restaurant in der Innenstadt von Chicago, spezialisiert auf hausgemachte Pasta und Holzofenpizza…', fr: 'p. ex. Un restaurant italien chaleureux au centre-ville de Chicago, spécialisé dans les pâtes maison et la pizza au feu de bois…', it: 'es. Un accogliente ristorante italiano nel centro di Chicago specializzato in pasta fatta in casa e pizza cotta nel forno a legna…', ja: '例：シカゴのダウンタウンにある、自家製パスタと薪窯ピザが自慢の居心地のよいイタリアンレストラン…', ko: '예: 수제 파스타와 화덕 피자를 전문으로 하는 시카고 다운타운의 아늑한 이탈리안 레스토랑…', ar: 'مثال: مطعم إيطالي دافئ في وسط مدينة شيكاغو متخصص في المعكرونة المنزلية والبيتزا المخبوزة في فرن الحطب…' },
  generateBtn:  { en: uiText('generatedUi.u_84eff7cab023bd40'), es: '✦ Generar sitio web', pt: '✦ Gerar site', pl: '✦ Generuj stronę', ru: '✦ Создать сайт', de: '✦ Website generieren', fr: '✦ Générer le site web', it: '✦ Genera sito web', ja: '✦ ウェブサイトを生成', ko: '✦ 웹사이트 생성', ar: '✦ إنشاء موقع إلكتروني' },
  generatingBtn:{ en: uiText('generatedUi.u_d20a4476a0a85978'), es: 'Generando…', pt: 'Gerando…', pl: 'Generowanie…', ru: 'Создание…', de: 'Wird generiert…', fr: 'Génération…', it: 'Generazione…', ja: '生成中…', ko: '생성 중…', ar: 'جارٍ الإنشاء…' },
  publishBtn:   { en: uiText('generatedUi.u_8c0885071285755c'), es: '🚀 Publicar sitio', pt: '🚀 Publicar site', pl: '🚀 Opublikuj stronę', ru: '🚀 Опубликовать сайт', de: '🚀 Website veröffentlichen', fr: '🚀 Publier le site', it: '🚀 Pubblica il sito', ja: '🚀 サイトを公開', ko: '🚀 사이트 게시', ar: '🚀 نشر الموقع' },
  publishingBtn:{ en: uiText('generatedUi.u_582e0f1abad43e9e'), es: 'Publicando…', pt: 'Publicando…', pl: 'Publikowanie…', ru: 'Публикация…', de: 'Wird veröffentlicht…', fr: 'Publication…', it: 'Pubblicazione…', ja: '公開中…', ko: '게시 중…', ar: 'جارٍ النشر…' },
  regenerate:   { en: uiText('generatedUi.u_1651031bf58d8eea'), es: 'Regenerar', pt: 'Regenerar', pl: 'Wygeneruj ponownie', ru: 'Создать заново', de: 'Neu generieren', fr: 'Régénérer', it: 'Rigenera', ja: '再生成', ko: '다시 생성', ar: 'إعادة الإنشاء' },
  viewLive:     { en: uiText('generatedUi.u_41be12cb135baa53'), es: 'Ver en vivo →', pt: 'Ver ao vivo →', pl: 'Zobacz na żywo →', ru: 'Просмотреть →', de: 'Live ansehen →', fr: 'Voir en direct →', it: 'Vedi online →', ja: 'ライブで表示 →', ko: '라이브 보기 →', ar: 'عرض مباشر ←' },
  previewTitle: { en: uiText('generatedUi.u_324b134f57c70c72'), es: 'Vista previa', pt: 'Pré-visualização', pl: 'Podgląd', ru: 'Предпросмотр', de: 'Vorschau', fr: 'Aperçu', it: 'Anteprima', ja: 'プレビュー', ko: '미리 보기', ar: 'معاينة' },
  engineTitle:  { en: uiText('generatedUi.u_48cd18631b3db7a0'), es: 'Motor de generación', pt: 'Motor de geração', pl: 'Silnik generowania', ru: 'Движок генерации', de: 'Generierungs-Engine', fr: 'Moteur de génération', it: 'Motore di generazione', ja: '生成エンジン', ko: '생성 엔진', ar: 'محرك التوليد' },
  hintLabel:    { en: uiText('generatedUi.u_45557cba181ae1a4'), es: 'Consejos para mejores resultados', pt: 'Dicas para melhores resultados', pl: 'Wskazówki dla najlepszych wyników', ru: 'Советы для лучших результатов', de: 'Tipps für beste Ergebnisse', fr: 'Conseils pour de meilleurs résultats', it: 'Suggerimenti per risultati ottimali', ja: '最良の結果を得るためのヒント', ko: '최상의 결과를 위한 팁', ar: 'نصائح للحصول على أفضل النتائج' },
  hint1:        { en: uiText('generatedUi.u_291f5c873a26b229'), es: 'Incluye el nombre de tu negocio, ubicación y qué te hace único', pt: 'Inclua o nome do seu negócio, localização e o que te torna único', pl: 'Podaj nazwę firmy, lokalizację i co Cię wyróżnia', ru: 'Укажите название бизнеса, местоположение и что вас выделяет', de: 'Geben Sie Ihren Firmennamen, Standort und Ihre Alleinstellungsmerkmale an', fr: 'Indiquez le nom de votre entreprise, votre emplacement et ce qui vous rend unique', it: 'Includi il nome della tua attività, la sede e ciò che ti rende unico', ja: '会社名、所在地、そして貴社ならではの強みを含めてください', ko: '회사 이름, 위치, 그리고 차별화 요소를 포함하세요', ar: 'أدرج اسم نشاطك التجاري وموقعه وما يميزك' },
  hint2:        { en: uiText('generatedUi.u_87a4cda31d0f5a77'), es: 'Menciona tu público objetivo y principales servicios o productos', pt: 'Mencione seu público-alvo e principais serviços ou produtos', pl: 'Wspomnij o grupie docelowej i głównych usługach lub produktach', ru: 'Упомяните целевую аудиторию и основные услуги или продукты', de: 'Nennen Sie Ihre Zielgruppe und Ihre wichtigsten Dienstleistungen oder Produkte', fr: 'Indiquez votre public cible et vos principaux services ou produits', it: 'Indica il tuo pubblico di riferimento e i principali servizi o prodotti', ja: 'ターゲットオーディエンスと主なサービスまたは製品を記載してください', ko: '타깃 오디언스와 주요 서비스 또는 제품을 언급하세요', ar: 'اذكر جمهورك المستهدف وخدماتك أو منتجاتك الرئيسية' },
  hint3:        { en: uiText('generatedUi.u_817f7fb01beeaa9e'), es: 'Agrega tono: profesional, amigable, audaz, minimalista, lujoso…', pt: 'Adicione tom: profissional, amigável, ousado, minimalista, luxuoso…', pl: 'Dodaj ton: profesjonalny, przyjazny, odważny, minimalistyczny, luksusowy…', ru: 'Добавьте тон: профессиональный, дружелюбный, смелый, минималистичный, люксовый…', de: 'Ton hinzufügen: professionell, freundlich, kühn, minimalistisch, luxuriös…', fr: 'Ajoutez un ton : professionnel, amical, audacieux, minimaliste, luxe…', it: 'Aggiungi un tono: professionale, cordiale, audace, minimalista, lusso…', ja: 'トーンを追加: プロフェッショナル、親しみやすい、大胆、ミニマル、ラグジュアリー…', ko: '톤 추가: 전문적, 친근함, 대담함, 미니멀, 럭셔리…', ar: 'أضف النبرة: احترافية، ودودة، جريئة، بسيطة، فاخرة…' },
  errConnect:   { en: uiText('generatedUi.u_e249ad0a23158084'), es: 'No se pudo conectar. Inténtalo de nuevo.', pt: 'Não foi possível conectar. Tente novamente.', pl: 'Nie można połączyć. Spróbuj ponownie.', ru: 'Не удалось подключиться. Попробуйте еще раз.', de: 'Verbindung fehlgeschlagen. Bitte versuchen Sie es erneut.', fr: 'Connexion impossible. Veuillez réessayer.', it: 'Impossibile connettersi. Riprova.', ja: '接続できませんでした。もう一度お試しください。', ko: '연결할 수 없습니다. 다시 시도해 주세요.', ar: 'تعذّر الاتصال. يُرجى المحاولة مرة أخرى.' },
  charCount:    { en: uiText('generatedUi.u_25d939ffd0d79b73'), es: 'caracteres', pt: 'caracteres', pl: 'znaków', ru: 'символов', de: 'Zeichen', fr: 'caractères', it: 'caratteri', ja: '文字', ko: '자', ar: 'حرفًا' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type StatusStep = { step: string; message: string }

export default function OperatorPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en'

  const [description, setDescription] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [steps, setSteps]             = useState<StatusStep[]>([])
  const [content, setContent]         = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl]         = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  // When the site is generated, bring the action bar + framed preview into view.
  useEffect(() => {
    if (content) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [content])
  const [message, setMessage]         = useState('')

  async function generate() {
    const desc = description.trim()
    if (!desc || generating) return
    setGenerating(true); setSteps([]); setContent(null); setLiveUrl(null); setMessage('')
    try {
      const res = await fetch('/api/sites/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, language: l }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setMessage(err.error || c('errConnect', l))
        setGenerating(false)
        return
      }
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          let chunk: any
          try { chunk = JSON.parse(trimmed) } catch { continue }
          if (chunk.type === 'status') setSteps(prev => [...prev, { step: chunk.step, message: chunk.message }])
          else if (chunk.type === 'result') {
            if (chunk.content) setContent(chunk.content)
            if (chunk.error && !chunk.content) setMessage(chunk.error)
          }
        }
      }
    } catch {
      setMessage(c('errConnect', l))
    } finally {
      setGenerating(false)
    }
  }

  async function publish() {
    if (!content || publishing) return
    setPublishing(true); setMessage('')
    try {
      const res = await fetch('/api/sites/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, language: l }),
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.error || c('errConnect', l))
      else { setLiveUrl(data.url || null); setMessage(data.userMessage || '') }
    } catch {
      setMessage(c('errConnect', l))
    } finally {
      setPublishing(false)
    }
  }

  const fullUrl = liveUrl ? (typeof window !== 'undefined' ? window.location.origin : '') + liveUrl : null

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header — compact studio bar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>🌐 {c('eyebrow', l)}</p>
            <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0' }}>{c('title', l)}</h1>
          </div>
          <span className="sb-chip">{generating ? '...' : content ? uiText('generatedUi.u_c2e3ac47f4a32546') : uiText('generatedUi.u_01a3981a1797d6d5')}</span>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(220px, 1fr)', gap: 18, marginBottom: 24, alignItems: 'start' }}>

          {/* Input panel */}
          <div>
            <textarea
              className="sb-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate() }}
              placeholder={c('placeholder', l)}
              rows={5}
              maxLength={1200}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.7 }}
              disabled={generating}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>
                {description.length} / 1200 {c('charCount', l)}
              </span>
              <button onClick={generate} disabled={generating || !description.trim()} className="sb-button-primary" style={{ borderRadius: 12, padding: '12px 28px', opacity: generating || !description.trim() ? 0.55 : 1 }}>
                {generating ? c('generatingBtn', l) : c('generateBtn', l)}
              </button>
            </div>
          </div>

          {/* Tips panel */}
          <div style={{ borderInlineStart: '1px solid rgba(255,255,255,.08)', paddingInlineStart: 20 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 14 }}>💡 {c('hintLabel', l)}</p>
            {[c('hint1', l), c('hint2', l), c('hint3', l)].map((hint, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,240,255,.15)', border: '1px solid rgba(26,240,255,.3)', color: '#1af0ff', fontSize: 11, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>{hint}</span>
              </div>
            ))}
            <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,195,0,.08)', border: '1px solid rgba(255,195,0,.2)', fontSize: 12, color: 'rgba(255,195,0,.9)', lineHeight: 1.6 }}>{uiText('generatedUi.u_558acbab0d6dbb51')}{l === 'en' ? uiText('generatedUi.u_ab60270939c04793') : l === 'es' ? uiText('generatedUi.u_7800b3fb3d7562e8') : l === 'pt' ? uiText('generatedUi.u_344259606eef14b7') : l === 'pl' ? uiText('generatedUi.u_0dce0a84f87a963d') : 'для создания'}
            </div>
          </div>
        </div>

        {/* Generation status */}
        {(generating || steps.length > 0) && !content && (
          <div style={{ borderTop: '1px solid rgba(26,240,255,.25)', borderInlineStart: '2px solid rgba(26,240,255,.4)', paddingTop: 14, paddingInlineStart: 14, marginBottom: 20 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 14 }}>{c('engineTitle', l)}</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: i === steps.length - 1 ? '#fff' : 'rgba(255,255,255,.5)' }}>
                  <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: i === steps.length - 1 ? '#1af0ff' : 'rgba(255,255,255,.2)', boxShadow: i === steps.length - 1 ? '0 0 12px #1af0ff' : 'none' }} />
                  {s.message}
                </div>
              ))}
              {generating && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#ffc300' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffc300', boxShadow: '0 0 12px #ffc300' }} />
                  {c('generatingBtn', l)}
                </div>
              )}
            </div>
          </div>
        )}

        {message && (
          <p style={{ color: liveUrl ? '#86efac' : '#fca5a5', fontSize: 13, marginBottom: 16 }}>{message}</p>
        )}

        {/* Result */}
        {content && (
          <div ref={resultRef} style={{ scrollMarginTop: 80 }}>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 14 }}>
              <p className="sb-eyebrow" style={{ flex: 1, margin: 0 }}>✦ {c('previewTitle', l)}</p>
              <button onClick={publish} disabled={publishing} className="sb-button-primary" style={{ borderRadius: 12, padding: '11px 24px', opacity: publishing ? 0.55 : 1 }}>
                {publishing ? c('publishingBtn', l) : c('publishBtn', l)}
              </button>
              <button onClick={() => { setContent(null); setSteps([]); setMessage(''); setLiveUrl(null) }} className="sb-button-secondary" style={{ borderRadius: 12 }}>
                {c('regenerate', l)}
              </button>
              {fullUrl && <a href={fullUrl} target="_blank" rel="noreferrer" className="sb-button-secondary" style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 12 }}>{c('viewLive', l)}</a>}
            </div>

            {/* Preview */}
            <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 24px 80px rgba(0,0,0,.5)', height: 'calc(100vh - 250px)', minHeight: 320 }}>
              <div style={{ height: '100%', overflowY: 'auto' }}>
                <SitePreview content={content} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
