'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import SitePreview, { type SitePreviewContent } from '@/components/operator/SitePreview'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<string, Record<Lang, string>> = {
  eyebrow:       { en: 'AI Website Builder', es: 'Constructor de sitios con IA', pt: 'Construtor de sites com IA', pl: 'Kreator stron z IA', ru: 'ИИ-конструктор сайтов' },
  title:         { en: 'Build Website', es: 'Construir sitio web', pt: 'Criar site', pl: 'Zbuduj stronę', ru: 'Создать сайт' },
  subtitle:      { en: 'Describe your business and we\'ll generate a complete website — then refine it visually with drag & drop.', es: 'Describe tu negocio y generaremos un sitio completo — luego refínalo visualmente con arrastrar y soltar.', pt: 'Descreva seu negócio e geraremos um site completo — depois refine-o visualmente com arrastar e soltar.', pl: 'Opisz swoją firmę, a wygenerujemy kompletną stronę — następnie dopracuj ją wizualnie metodą przeciągnij i upuść.', ru: 'Опишите бизнес — мы создадим сайт, а затем вы доработаете его визуально перетаскиванием.' },
  placeholder:   { en: 'e.g. A cozy Italian restaurant in downtown Chicago specializing in homemade pasta and wood-fired pizza…', es: 'p.ej. Un acogedor restaurante italiano en el centro de Chicago especializado en pasta casera…', pt: 'ex. Um aconchegante restaurante italiano no centro de Chicago especializado em massa artesanal…', pl: 'np. Przytulna włoska restauracja w centrum Chicago specjalizująca się w domowym makaronie…', ru: 'напр. Уютный итальянский ресторан в центре Чикаго, специализирующийся на домашней пасте…' },
  generateBtn:   { en: '✦ Generate website', es: '✦ Generar sitio web', pt: '✦ Gerar site', pl: '✦ Generuj stronę', ru: '✦ Создать сайт' },
  generatingBtn: { en: 'Generating…', es: 'Generando…', pt: 'Gerando…', pl: 'Generowanie…', ru: 'Создание…' },
  publishBtn:    { en: '🚀 Publish site', es: '🚀 Publicar sitio', pt: '🚀 Publicar site', pl: '🚀 Opublikuj stronę', ru: '🚀 Опубликовать сайт' },
  publishingBtn: { en: 'Publishing…', es: 'Publicando…', pt: 'Publicando…', pl: 'Publikowanie…', ru: 'Публикация…' },
  regenerate:    { en: '← Start over', es: '← Volver a empezar', pt: '← Recomeçar', pl: '← Zacznij od nowa', ru: '← Начать заново' },
  viewLive:      { en: 'View live →', es: 'Ver en vivo →', pt: 'Ver ao vivo →', pl: 'Zobacz na żywo →', ru: 'Просмотреть →' },
  previewTitle:  { en: 'AI Preview', es: 'Vista previa IA', pt: 'Pré-visualização IA', pl: 'Podgląd IA', ru: 'Предпросмотр ИИ' },
  editTitle:     { en: 'Visual Editor', es: 'Editor visual', pt: 'Editor visual', pl: 'Edytor wizualny', ru: 'Визуальный редактор' },
  engineTitle:   { en: 'Generation engine', es: 'Motor de generación', pt: 'Motor de geração', pl: 'Silnik generowania', ru: 'Движок генерации' },
  hintLabel:     { en: 'Tips for best results', es: 'Consejos para mejores resultados', pt: 'Dicas para melhores resultados', pl: 'Wskazówki dla najlepszych wyników', ru: 'Советы для лучших результатов' },
  hint1:         { en: 'Include your business name, location, and what makes you unique', es: 'Incluye el nombre de tu negocio, ubicación y qué te hace único', pt: 'Inclua o nome do seu negócio, localização e o que te torna único', pl: 'Podaj nazwę firmy, lokalizację i co Cię wyróżnia', ru: 'Укажите название бизнеса, местоположение и что вас выделяет' },
  hint2:         { en: 'Mention your target audience and main services or products', es: 'Menciona tu público objetivo y principales servicios o productos', pt: 'Mencione seu público-alvo e principais serviços ou produtos', pl: 'Wspomnij o grupie docelowej i głównych usługach lub produktach', ru: 'Упомяните целевую аудиторию и основные услуги или продукты' },
  hint3:         { en: 'Add tone: professional, friendly, bold, minimalist, luxury…', es: 'Agrega tono: profesional, amigable, audaz, minimalista, lujoso…', pt: 'Adicione tom: profissional, amigável, ousado, minimalista, luxuoso…', pl: 'Dodaj ton: profesjonalny, przyjazny, odważny, minimalistyczny, luksusowy…', ru: 'Добавьте тон: профессиональный, дружелюбный, смелый, минималистичный, люксовый…' },
  errConnect:    { en: 'Could not connect. Please try again.', es: 'No se pudo conectar. Inténtalo de nuevo.', pt: 'Não foi possível conectar. Tente novamente.', pl: 'Nie można połączyć. Spróbuj ponownie.', ru: 'Не удалось подключиться. Попробуйте еще раз.' },
  charCount:     { en: 'characters', es: 'caracteres', pt: 'caracteres', pl: 'znaków', ru: 'символов' },
  tabPreview:    { en: 'AI Preview', es: 'Vista previa', pt: 'Pré-visualização', pl: 'Podgląd', ru: 'Предпросмотр' },
  tabEditor:     { en: '✏️ Visual Editor', es: '✏️ Editor visual', pt: '✏️ Editor visual', pl: '✏️ Edytor wizualny', ru: '✏️ Визуальный редактор' },
  editorBadge:   { en: 'Drag & Drop', es: 'Arrastrar y soltar', pt: 'Arrastar e soltar', pl: 'Przeciągnij i upuść', ru: 'Перетаскивание' },
  editorHint:    { en: 'Click any element to edit it. Drag blocks from the right panel to add content.', es: 'Haz clic en cualquier elemento para editarlo. Arrastra bloques del panel derecho para agregar contenido.', pt: 'Clique em qualquer elemento para editá-lo. Arraste blocos do painel direito para adicionar conteúdo.', pl: 'Kliknij dowolny element, aby go edytować. Przeciągnij bloki z prawego panelu, aby dodać treść.', ru: 'Нажмите на любой элемент для редактирования. Перетащите блоки из правой панели для добавления контента.' },
  loadingEditor: { en: 'Loading visual editor…', es: 'Cargando editor visual…', pt: 'Carregando editor visual…', pl: 'Ładowanie edytora wizualnego…', ru: 'Загрузка визуального редактора…' },
  poweredBy:     { en: 'Powered by', es: 'Con tecnología de', pt: 'Desenvolvido com', pl: 'Napędzane przez', ru: 'На базе' },
  seedTitle:     { en: 'Your site', es: 'Tu sitio', pt: 'Seu site', pl: 'Twoja strona', ru: 'Ваш сайт' },
}

function c(key: string, lang: string): string {
  return COPY[key]?.[lang as Lang] ?? COPY[key]?.en ?? key
}

type StatusStep = { step: string; message: string }
type Tab = 'preview' | 'editor'

// ── GrapesJS CDN loader (no npm dependency) ───────────────────────────────────
const GJS_VERSION = '0.23.2'
const GJS_BLOCKS_VERSION = '1.0.2'
const GJS_CSS = `https://cdn.jsdelivr.net/npm/grapesjs@${GJS_VERSION}/dist/css/grapes.min.css`
const GJS_JS = `https://cdn.jsdelivr.net/npm/grapesjs@${GJS_VERSION}/dist/grapes.min.js`
const GJS_BLOCKS_JS = `https://cdn.jsdelivr.net/npm/grapesjs-blocks-basic@${GJS_BLOCKS_VERSION}/dist/index.js`

function loadStyleOnce(href: string, id: string) {
  if (typeof document === 'undefined') return
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

function loadScriptOnce(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('no document')); return }
    const existing = document.getElementById(id) as HTMLScriptElement | null
    if (existing) {
      if (existing.dataset.loaded === 'true') { resolve(); return }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('failed to load ' + src)))
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.src = src
    script.async = true
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve() })
    script.addEventListener('error', () => reject(new Error('failed to load ' + src)))
    document.head.appendChild(script)
  })
}

async function loadGrapes(): Promise<{ grapesjs: any; blocksPlugin: any }> {
  loadStyleOnce(GJS_CSS, 'gjs-cdn-css')
  await loadScriptOnce(GJS_JS, 'gjs-cdn-core')
  await loadScriptOnce(GJS_BLOCKS_JS, 'gjs-cdn-blocks-basic')
  const w = window as any
  const grapesjs = w.grapesjs
  const blocksPlugin = w.grapesjsBlocksBasic || w['grapesjs-blocks-basic']
  if (!grapesjs) throw new Error('GrapesJS failed to load from CDN')
  return { grapesjs, blocksPlugin }
}

// ── GrapesJS Visual Editor ────────────────────────────────────────────────────
function GrapesEditor({ html, css, lang }: { html: string; css: string; lang: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef    = useRef<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    let destroyed = false

    async function init() {
      if (!containerRef.current) return
      try {
        // Load GrapesJS from CDN at runtime (no npm dependency required)
        const { grapesjs, blocksPlugin } = await loadGrapes()

        if (destroyed || !containerRef.current) return

        // Clear any previous instance
        if (editorRef.current) {
          editorRef.current.destroy()
          editorRef.current = null
        }

        const editor = grapesjs.init({
          container: containerRef.current,
          height: '100%',
          width: '100%',
          storageManager: false,
          plugins: blocksPlugin ? [blocksPlugin] : [],
          pluginsOpts: blocksPlugin ? { [blocksPlugin as any]: {} } : {},
          components: html || `<section><h1>${c('seedTitle', lang)}</h1></section>`,
          style: css || '',
          deviceManager: {
            devices: [
              { name: 'Desktop', width: '' },
              { name: 'Tablet',  width: '768px', widthMedia: '992px' },
              { name: 'Mobile',  width: '375px', widthMedia: '480px' },
            ],
          },
          styleManager: {
            sectors: [
              {
                name: 'Typography',
                open: false,
                properties: ['font-family', 'font-size', 'font-weight', 'color', 'line-height', 'text-align'],
              },
              {
                name: 'Layout',
                open: false,
                properties: ['display', 'width', 'height', 'padding', 'margin'],
              },
              {
                name: 'Background',
                open: false,
                properties: ['background-color', 'background-image'],
              },
              {
                name: 'Border',
                open: false,
                properties: ['border', 'border-radius'],
              },
            ],
          },
          // Dark theme via canvas styles
          canvasCss: `
            * { box-sizing: border-box; }
            body { margin: 0; font-family: system-ui, sans-serif; }
            .gjs-selected { outline: 2px solid #1af0ff !important; outline-offset: 2px; }
            .gjs-hovered  { outline: 1px dashed rgba(26,240,255,.5) !important; }
          `,
        })

        // Apply dark panel theme via DOM (GrapesJS doesn't support CSS vars natively)
        const panels = containerRef.current.querySelectorAll<HTMLElement>('.gjs-pn-panels, .gjs-pn-panel')
        panels.forEach(el => {
          el.style.background = 'rgba(15,23,42,.97)'
          el.style.borderColor = 'rgba(255,255,255,.08)'
          el.style.color = '#fff'
        })

        editorRef.current = editor
        setLoading(false)
      } catch (err: any) {
        if (!destroyed) {
          setError('Visual editor failed to load. Please refresh.')
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      destroyed = true
      if (editorRef.current) {
        try { editorRef.current.destroy() } catch {}
        editorRef.current = null
      }
    }
  }, [html, css])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#fca5a5', fontSize: 14 }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,7,18,.85)', zIndex: 10, borderRadius: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(26,240,255,.2)', borderTopColor: '#1af0ff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 13, margin: 0 }}>{c('loadingEditor', lang)}</p>
          </div>
        </div>
      )}
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BuilderPage() {
  const { lang } = useI18n()
  const l = ['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en'

  const [description, setDescription] = useState('')
  const [generating, setGenerating]   = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [steps, setSteps]             = useState<StatusStep[]>([])
  const [content, setContent]         = useState<SitePreviewContent | null>(null)
  const [liveUrl, setLiveUrl]         = useState<string | null>(null)
  const [message, setMessage]         = useState('')
  const [activeTab, setActiveTab]     = useState<Tab>('preview')
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (content) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [content])

  async function generate() {
    const desc = description.trim()
    if (!desc || generating) return
    setGenerating(true); setSteps([]); setContent(null); setLiveUrl(null); setMessage(''); setActiveTab('preview')
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

  // Extract raw HTML + CSS from SitePreviewContent for GrapesJS
  const rawHtml = content
    ? (typeof content === 'string' ? content : (content as any).html ?? JSON.stringify(content))
    : ''
  const rawCss = content ? ((content as any).css ?? '') : ''

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 12, marginBottom: 18 }}>
          <div style={{ minWidth: 0 }}>
            <p className="sb-eyebrow" style={{ margin: 0 }}>🌐 {c('eyebrow', l)}</p>
            <h1 style={{ fontSize: 22, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.15, margin: '4px 0 0' }}>{c('title', l)}</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', margin: '6px 0 0', maxWidth: 560 }}>{c('subtitle', l)}</p>
          </div>
          <span className="sb-chip">{generating ? '...' : content ? 'READY' : 'IDLE'}</span>
        </div>

        {/* ── Prompt + Tips ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(220px, 1fr)', gap: 18, marginBottom: 24, alignItems: 'start' }}>
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

          <div style={{ borderLeft: '1px solid rgba(255,255,255,.08)', paddingLeft: 20 }}>
            <p className="sb-eyebrow" style={{ marginBottom: 14 }}>💡 {c('hintLabel', l)}</p>
            {[c('hint1', l), c('hint2', l), c('hint3', l)].map((hint, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: 'rgba(26,240,255,.15)', border: '1px solid rgba(26,240,255,.3)', color: '#1af0ff', fontSize: 11, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                  {i + 1}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.65)', lineHeight: 1.6 }}>{hint}</span>
              </div>
            ))}
            <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,195,0,.08)', border: '1px solid rgba(255,195,0,.2)', fontSize: 12, color: 'rgba(255,195,0,.9)', lineHeight: 1.6 }}>
              ⌘ + Enter {l === 'en' ? 'to generate' : l === 'es' ? 'para generar' : l === 'pt' ? 'para gerar' : l === 'pl' ? 'aby wygenerować' : 'для создания'}
            </div>
          </div>
        </div>

        {/* ── Generation status ── */}
        {(generating || steps.length > 0) && !content && (
          <div style={{ borderTop: '1px solid rgba(26,240,255,.25)', borderLeft: '2px solid rgba(26,240,255,.4)', paddingTop: 14, paddingLeft: 14, marginBottom: 20 }}>
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

        {/* ── Result area ── */}
        {content && (
          <div ref={resultRef} style={{ scrollMarginTop: 80 }}>

            {/* Action bar */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14, borderTop: '1px solid rgba(255,255,255,.09)', paddingTop: 14 }}>
              <p className="sb-eyebrow" style={{ flex: 1, margin: 0 }}>✦ {activeTab === 'editor' ? c('editTitle', l) : c('previewTitle', l)}</p>
              <button onClick={publish} disabled={publishing} className="sb-button-primary" style={{ borderRadius: 12, padding: '11px 24px', opacity: publishing ? 0.55 : 1 }}>
                {publishing ? c('publishingBtn', l) : c('publishBtn', l)}
              </button>
              <button onClick={() => { setContent(null); setSteps([]); setMessage(''); setLiveUrl(null); setActiveTab('preview') }} className="sb-button-secondary" style={{ borderRadius: 12 }}>
                {c('regenerate', l)}
              </button>
              {fullUrl && (
                <a href={fullUrl} target="_blank" rel="noreferrer" className="sb-button-secondary" style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 12 }}>
                  {c('viewLive', l)}
                </a>
              )}
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {(['preview', 'editor'] as Tab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 10,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 700,
                    transition: 'all .15s',
                    background: activeTab === tab ? 'rgba(26,240,255,.15)' : 'rgba(255,255,255,.06)',
                    color: activeTab === tab ? '#1af0ff' : 'rgba(255,255,255,.55)',
                    borderBottom: activeTab === tab ? '2px solid #1af0ff' : '2px solid transparent',
                  }}
                >
                  {tab === 'preview' ? c('tabPreview', l) : c('tabEditor', l)}
                </button>
              ))}
              {activeTab === 'editor' && (
                <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11, color: 'rgba(255,255,255,.4)', fontStyle: 'italic' }}>
                  {c('editorHint', l)}
                </span>
              )}
            </div>

            {/* Panel */}
            <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 24px 80px rgba(0,0,0,.5)', height: 'calc(100vh - 320px)', minHeight: 420 }}>

              {/* AI Preview tab */}
              {activeTab === 'preview' && (
                <div style={{ height: '100%', overflowY: 'auto' }}>
                  <SitePreview content={content} />
                </div>
              )}

              {/* Visual Editor tab */}
              {activeTab === 'editor' && (
                <GrapesEditor html={rawHtml} css={rawCss} lang={l} />
              )}
            </div>

            {/* Editor badge */}
            {activeTab === 'editor' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(255,195,0,.12)', border: '1px solid rgba(255,195,0,.25)', color: '#ffc300', fontWeight: 700, letterSpacing: '.04em' }}>
                  {c('editorBadge', l)}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,.35)' }}>{c('poweredBy', l)} GrapesJS</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
