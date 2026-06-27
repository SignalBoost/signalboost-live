'use client'

import { FormEvent, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Copy = {
  eyebrow: string
  title: string
  body: string
  safe: string
  outreachTitle: string
  outreachBody: string
  leadEmail: string
  leadName: string
  company: string
  locale: string
  runOutreach: string
  audioTitle: string
  audioBody: string
  brief: string
  runAudio: string
  printTitle: string
  printBody: string
  assetTitle: string
  fileName: string
  publisher: string
  deskEmail: string
  runPrint: string
  result: string
  loading: string
  error: string
}

const COPY: Record<Lang, Copy> = {
  en: { eyebrow: 'COS · Marketing + Sales', title: 'Portable growth engine test console', body: 'Test the first backend layer for lead capture, owner-approved outreach planning, organic audio sequencing, and print ad-desk payloads.', safe: 'Planning only. No real email, no social posting, no external audio call, and no automatic publishing.', outreachTitle: 'Sales & outreach planner', outreachBody: 'Generate a value-drop cadence with the 48-hour / 2-touch domain guard.', leadEmail: 'Lead email', leadName: 'Lead name', company: 'Company', locale: 'Language', runOutreach: 'Generate outreach plan', audioTitle: 'Organic audio pipeline', audioBody: 'Create a mock 5-minute, two-host tech dialogue with a mid-roll SignalBoost ad slot.', brief: 'Brief or source text', runAudio: 'Generate audio JSON', printTitle: 'Traditional print desk mapper', printBody: 'Compile a print-ready ad desk payload for owner approval.', assetTitle: 'Asset title', fileName: 'File name', publisher: 'Publisher', deskEmail: 'Ad desk email', runPrint: 'Compile print payload', result: 'Result', loading: 'Working…', error: 'Could not complete this test.' },
  es: { eyebrow: 'COS · Marketing + Ventas', title: 'Consola de prueba del motor de crecimiento portátil', body: 'Prueba la primera capa backend para captura de leads, planificación de outreach aprobada por el propietario, audio orgánico y payloads para mesas de anuncios impresos.', safe: 'Solo planificación. Sin email real, sin publicación social, sin llamada externa de audio y sin publicación automática.', outreachTitle: 'Planificador de ventas y outreach', outreachBody: 'Genera una cadencia de valor con protección de dominio de 48 horas / 2 contactos.', leadEmail: 'Email del lead', leadName: 'Nombre del lead', company: 'Empresa', locale: 'Idioma', runOutreach: 'Generar plan de outreach', audioTitle: 'Pipeline de audio orgánico', audioBody: 'Crea un diálogo técnico simulado de 5 minutos con dos anfitriones y anuncio mid-roll de SignalBoost.', brief: 'Brief o texto fuente', runAudio: 'Generar JSON de audio', printTitle: 'Mapeador de anuncios impresos', printBody: 'Compila un payload para mesa de anuncios listo para aprobación.', assetTitle: 'Título del asset', fileName: 'Nombre del archivo', publisher: 'Publicación', deskEmail: 'Email de anuncios', runPrint: 'Compilar payload impreso', result: 'Resultado', loading: 'Trabajando…', error: 'No se pudo completar esta prueba.' },
  pt: { eyebrow: 'COS · Marketing + Vendas', title: 'Console de teste do motor de crescimento portátil', body: 'Teste a primeira camada backend para captura de leads, planejamento de outreach aprovado pelo proprietário, sequência de áudio orgânico e payloads para jornais/revistas.', safe: 'Apenas planejamento. Sem email real, sem postagem social, sem chamada externa de áudio e sem publicação automática.', outreachTitle: 'Planejador de vendas e outreach', outreachBody: 'Gere uma cadência de valor com proteção de domínio de 48 horas / 2 contatos.', leadEmail: 'Email do lead', leadName: 'Nome do lead', company: 'Empresa', locale: 'Idioma', runOutreach: 'Gerar plano de outreach', audioTitle: 'Pipeline de áudio orgânico', audioBody: 'Crie um diálogo técnico simulado de 5 minutos com dois apresentadores e anúncio mid-roll do SignalBoost.', brief: 'Brief ou texto fonte', runAudio: 'Gerar JSON de áudio', printTitle: 'Mapeador de anúncios impressos', printBody: 'Compile um payload pronto para mesa de anúncios com aprovação do proprietário.', assetTitle: 'Título do asset', fileName: 'Nome do arquivo', publisher: 'Publicação', deskEmail: 'Email da mesa de anúncios', runPrint: 'Compilar payload impresso', result: 'Resultado', loading: 'Trabalhando…', error: 'Não foi possível concluir este teste.' },
  pl: { eyebrow: 'COS · Marketing + Sprzedaż', title: 'Konsola testowa przenośnego silnika wzrostu', body: 'Testuj pierwszą warstwę backendu: leady, plan outreach z akceptacją właściciela, organiczne audio i payloady dla działów reklam drukowanych.', safe: 'Tylko planowanie. Bez realnego emaila, publikacji społecznościowej, zewnętrznego audio i automatycznej publikacji.', outreachTitle: 'Planer sprzedaży i outreach', outreachBody: 'Generuje kadencję wartości z limitem domeny 48 godzin / 2 kontakty.', leadEmail: 'Email leada', leadName: 'Imię leada', company: 'Firma', locale: 'Język', runOutreach: 'Wygeneruj plan outreach', audioTitle: 'Pipeline organicznego audio', audioBody: 'Tworzy mock 5-minutowego dialogu technologicznego dwóch hostów z reklamą SignalBoost.', brief: 'Brief lub tekst źródłowy', runAudio: 'Wygeneruj JSON audio', printTitle: 'Mapper działu reklam drukowanych', printBody: 'Kompiluje payload dla reklamy drukowanej do akceptacji właściciela.', assetTitle: 'Tytuł assetu', fileName: 'Nazwa pliku', publisher: 'Wydawca', deskEmail: 'Email działu reklam', runPrint: 'Skompiluj payload druku', result: 'Wynik', loading: 'Praca…', error: 'Nie udało się ukończyć testu.' },
  ru: { eyebrow: 'COS · Маркетинг + Продажи', title: 'Тестовая консоль переносимого growth engine', body: 'Проверьте первый backend-слой: лиды, outreach-план с утверждением владельца, organic audio и payload для печатных рекламных отделов.', safe: 'Только планирование. Без реальной отправки email, соцпубликации, внешнего audio-вызова и автоматической публикации.', outreachTitle: 'Планировщик продаж и outreach', outreachBody: 'Создаёт value-drop cadence с защитой домена 48 часов / 2 контакта.', leadEmail: 'Email лида', leadName: 'Имя лида', company: 'Компания', locale: 'Язык', runOutreach: 'Создать outreach-план', audioTitle: 'Organic audio pipeline', audioBody: 'Создаёт mock 5-минутного tech-диалога двух ведущих с mid-roll рекламой SignalBoost.', brief: 'Brief или исходный текст', runAudio: 'Создать audio JSON', printTitle: 'Mapper печатного ad desk', printBody: 'Компилирует payload печатной рекламы для утверждения владельцем.', assetTitle: 'Название asset', fileName: 'Имя файла', publisher: 'Издание', deskEmail: 'Email рекламного отдела', runPrint: 'Скомпилировать print payload', result: 'Результат', loading: 'Выполняется…', error: 'Не удалось выполнить тест.' },
}

function copyFor(lang: string): Copy {
  return COPY[(['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang]
}

function toCosLocale(lang: string) {
  if (lang === 'pt') return 'pt-BR'
  if (lang === 'es' || lang === 'pl' || lang === 'ru') return lang
  return 'en'
}

function Field(props: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; textarea?: boolean }) {
  const common = {
    value: props.value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => props.onChange(event.target.value),
    placeholder: props.placeholder,
    style: { width: '100%', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(2,6,23,.72)', color: '#fff', borderRadius: 12, padding: '11px 12px', outline: 'none' },
  }
  return <label style={{ display: 'grid', gap: 7, fontSize: 12, color: 'rgba(226,232,240,.72)', fontWeight: 700 }}><span>{props.label}</span>{props.textarea ? <textarea {...common} rows={4} /> : <input {...common} />}</label>
}

export default function MarketingSalesAdminPage() {
  const { lang } = useI18n()
  const c = copyFor(lang)
  const cosLocale = toCosLocale(lang)
  const [leadEmail, setLeadEmail] = useState('owner@example.com')
  const [leadName, setLeadName] = useState('Business Owner')
  const [company, setCompany] = useState('Example Company')
  const [brief, setBrief] = useState('A public website scan found optimization opportunities in speed, SEO, accessibility, security, and conversion.')
  const [assetTitle, setAssetTitle] = useState('SignalBoost Website Optimizer Ad')
  const [fileName, setFileName] = useState('signalboost-optimizer-ad.pdf')
  const [publisher, setPublisher] = useState('Local Weekly')
  const [deskEmail, setDeskEmail] = useState('ads@example-news.com')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState('')

  async function callApi(route: string, payload: any) {
    setLoading(route)
    setResult(null)
    try {
      const response = await fetch(`/api/cos-marketing-sales/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await response.json().catch(() => null)
      setResult(json || { ok: false, error: c.error })
    } catch {
      setResult({ ok: false, error: c.error })
    } finally {
      setLoading('')
    }
  }

  function runOutreach(event: FormEvent) {
    event.preventDefault()
    callApi('outreach', { lead: { email: leadEmail, name: leadName, company, locale: cosLocale, source: 'website_optimizer', tags: ['organic', 'optimizer'] }, history: [] })
  }

  function runAudio(event: FormEvent) {
    event.preventDefault()
    callApi('audio', { locale: cosLocale, title: 'SignalBoost brief', rawText: brief, platformName: 'SignalBoost', midRollOffer: 'SignalBoost turns free website checks into owner-approved growth actions.' })
  }

  function runPrint(event: FormEvent) {
    event.preventDefault()
    callApi('print-desk', { locale: cosLocale, asset: { assetId: 'asset-demo-1', assetTitle, fileName, mimeType: 'application/pdf' }, publisher: { publisherName: publisher, deskEmail }, dimensions: { widthInches: 8.5, heightInches: 11, bleedInches: 0.125, safeMarginInches: 0.25, colorMode: 'CMYK', resolutionDpi: 300 } })
  }

  const cardStyle: React.CSSProperties = { border: '1px solid rgba(255,255,255,.12)', background: 'linear-gradient(150deg, rgba(15,23,42,.92), rgba(2,6,23,.76))', borderRadius: 22, padding: 22, boxShadow: '0 24px 80px rgba(0,0,0,.25)' }
  const buttonStyle: React.CSSProperties = { border: 'none', borderRadius: 12, background: '#1af0ff', color: '#020617', padding: '11px 14px', fontWeight: 900, cursor: 'pointer' }

  return (
    <div className="sb-cockpit-stack">
      <section className="sb-admin-topbar" role="banner" aria-label={c.eyebrow}>
        <div>
          <p className="sb-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p className="sb-body">{c.body}</p>
          <p className="sb-caption" style={{ marginTop: 10, color: '#9ff7ff' }}>{c.safe}</p>
        </div>
        <span className="sb-role-pill">Planning</span>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
        <form onSubmit={runOutreach} style={cardStyle}>
          <h2 className="sb-h3">{c.outreachTitle}</h2>
          <p className="sb-body" style={{ fontSize: 13 }}>{c.outreachBody}</p>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <Field label={c.leadEmail} value={leadEmail} onChange={setLeadEmail} />
            <Field label={c.leadName} value={leadName} onChange={setLeadName} />
            <Field label={c.company} value={company} onChange={setCompany} />
            <button type="submit" disabled={loading === 'outreach'} style={buttonStyle}>{loading === 'outreach' ? c.loading : c.runOutreach}</button>
          </div>
        </form>

        <form onSubmit={runAudio} style={cardStyle}>
          <h2 className="sb-h3">{c.audioTitle}</h2>
          <p className="sb-body" style={{ fontSize: 13 }}>{c.audioBody}</p>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <Field label={c.brief} value={brief} onChange={setBrief} textarea />
            <button type="submit" disabled={loading === 'audio'} style={buttonStyle}>{loading === 'audio' ? c.loading : c.runAudio}</button>
          </div>
        </form>

        <form onSubmit={runPrint} style={cardStyle}>
          <h2 className="sb-h3">{c.printTitle}</h2>
          <p className="sb-body" style={{ fontSize: 13 }}>{c.printBody}</p>
          <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
            <Field label={c.assetTitle} value={assetTitle} onChange={setAssetTitle} />
            <Field label={c.fileName} value={fileName} onChange={setFileName} />
            <Field label={c.publisher} value={publisher} onChange={setPublisher} />
            <Field label={c.deskEmail} value={deskEmail} onChange={setDeskEmail} />
            <button type="submit" disabled={loading === 'print-desk'} style={buttonStyle}>{loading === 'print-desk' ? c.loading : c.runPrint}</button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 className="sb-h3">{c.result}</h2>
        <pre style={{ marginTop: 12, whiteSpace: 'pre-wrap', overflowX: 'auto', color: 'rgba(226,232,240,.86)', fontSize: 12, lineHeight: 1.65 }}>{JSON.stringify(result || { ok: true, message: 'No activity yet' }, null, 2)}</pre>
      </section>
    </div>
  )
}
