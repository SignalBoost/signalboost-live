'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<Lang, Record<string, string>> = {
  en: {
    eyebrow: 'Creative Studio', title: 'Creative Studio',
    subtitle: 'Generate professional promo banners and campaign visuals powered by AI.',
    promptLabel: 'Describe the image you want',
    promptPlaceholder: 'e.g. A vibrant promo banner for a São Paulo coffee shop, warm tones, people laughing, cinematic lighting',
    aspect: 'Shape', landscape: 'Landscape (16:9)', square: 'Square (1:1)', portrait: 'Portrait (4:5)',
    generate: 'Generate image', generating: 'Generating…', download: 'Download image', again: 'Generate another',
    empty: 'Your generated image will appear here.', errorGeneric: 'Something went wrong. Please try again.',
  },
  es: {
    eyebrow: 'Estudio Creativo', title: 'Estudio Creativo',
    subtitle: 'Genera banners promocionales y visuales de campaña con IA.',
    promptLabel: 'Describe la imagen que quieres',
    promptPlaceholder: 'p. ej. Un banner promocional vibrante para una cafetería de São Paulo, tonos cálidos, gente riendo, iluminación cinematográfica',
    aspect: 'Forma', landscape: 'Horizontal (16:9)', square: 'Cuadrado (1:1)', portrait: 'Vertical (4:5)',
    generate: 'Generar imagen', generating: 'Generando…', download: 'Descargar imagen', again: 'Generar otra',
    empty: 'Tu imagen generada aparecerá aquí.', errorGeneric: 'Algo salió mal. Inténtalo de nuevo.',
  },
  pt: {
    eyebrow: 'Estúdio Criativo', title: 'Estúdio Criativo',
    subtitle: 'Gere banners promocionais e visuais de campanha com IA.',
    promptLabel: 'Descreva a imagem que você quer',
    promptPlaceholder: 'ex. Um banner promocional vibrante para uma cafeteria de São Paulo, tons quentes, pessoas rindo, iluminação cinematográfica',
    aspect: 'Formato', landscape: 'Paisagem (16:9)', square: 'Quadrado (1:1)', portrait: 'Retrato (4:5)',
    generate: 'Gerar imagem', generating: 'Gerando…', download: 'Baixar imagem', again: 'Gerar outra',
    empty: 'Sua imagem gerada aparecerá aqui.', errorGeneric: 'Algo deu errado. Tente novamente.',
  },
  pl: {
    eyebrow: 'Studio kreatywne', title: 'Studio kreatywne',
    subtitle: 'Generuj banery promocyjne i wizualizacje kampanii dzięki AI.',
    promptLabel: 'Opisz obraz, który chcesz',
    promptPlaceholder: 'np. Żywy baner promocyjny dla kawiarni w São Paulo, ciepłe tony, śmiejący się ludzie, kinowe oświetlenie',
    aspect: 'Kształt', landscape: 'Poziomy (16:9)', square: 'Kwadrat (1:1)', portrait: 'Pionowy (4:5)',
    generate: 'Generuj obraz', generating: 'Generowanie…', download: 'Pobierz obraz', again: 'Generuj kolejny',
    empty: 'Twój wygenerowany obraz pojawi się tutaj.', errorGeneric: 'Coś poszło nie tak. Spróbuj ponownie.',
  },
  ru: {
    eyebrow: 'Креативная студия', title: 'Креативная студия',
    subtitle: 'Создавайте промо-баннеры и визуалы кампаний с помощью ИИ.',
    promptLabel: 'Опишите нужное изображение',
    promptPlaceholder: 'напр. Яркий промо-баннер для кофейни в Сан-Паулу, тёплые тона, смеющиеся люди, кинематографическое освещение',
    aspect: 'Форма', landscape: 'Горизонтальный (16:9)', square: 'Квадрат (1:1)', portrait: 'Вертикальный (4:5)',
    generate: 'Создать изображение', generating: 'Создание…', download: 'Скачать изображение', again: 'Создать ещё',
    empty: 'Здесь появится созданное изображение.', errorGeneric: 'Что-то пошло не так. Попробуйте снова.',
  },
}

export default function CreativeStudioPage() {
  const { lang } = useI18n()
  const L: Lang = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
  const c = COPY[L]

  const [prompt, setPrompt]           = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [loading, setLoading]         = useState(false)
  const [imageUrl, setImageUrl]       = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)

  async function handleGenerate() {
    if (prompt.trim().length < 3 || loading) return
    setLoading(true); setError(null); setImageUrl(null)
    try {
      const res = await fetch('/api/creative/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio }),
      })
      const data = await res.json()
      if (!res.ok || !data?.imageUrl) setError(data?.error || c.errorGeneric)
      else setImageUrl(data.imageUrl)
    } catch { setError(c.errorGeneric) }
    finally { setLoading(false) }
  }

  async function handleDownload() {
    if (!imageUrl) return
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `signalboost-creative-${Date.now()}.png`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    } catch { window.open(imageUrl, '_blank') }
  }

  const canGenerate = !loading && prompt.trim().length >= 3

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', color: 'var(--text-primary)', display: 'grid', gap: 18 }}>

      {/* Studio bar: compact title + status, no hero */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', borderBottom: '1px solid rgba(255,255,255,.09)', paddingBottom: 14 }}>
        <div>
          <p className="sb-eyebrow" style={{ color: '#c4b5fd', margin: 0 }}>🎨 {c.eyebrow}</p>
          <h1 style={{ fontSize: 24, fontWeight: 950, letterSpacing: '-.04em', lineHeight: 1.1, margin: '4px 0 0' }}>{c.title}</h1>
        </div>
        <span className="sb-chip" style={{ borderColor: 'rgba(196,181,253,.3)', background: 'rgba(196,181,253,.08)', color: '#c4b5fd' }}>{loading ? c.generating : imageUrl ? '✓' : aspectRatio}</span>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: '#c4b5fd' }}>{c.promptLabel}</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={c.promptPlaceholder} rows={3} className="sb-input" style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, resize: 'vertical', fontSize: 14, lineHeight: 1.7 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', whiteSpace: 'nowrap' }}>{c.aspect}</label>
          <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="sb-input" style={{ padding: '10px 14px', borderRadius: 10, fontSize: 13 }}>
            <option value="16:9">{c.landscape}</option>
            <option value="1:1">{c.square}</option>
            <option value="4:5">{c.portrait}</option>
          </select>
          <button onClick={handleGenerate} disabled={!canGenerate} style={{ background: 'linear-gradient(135deg, #7c5cff, #22d3ee)', color: '#fff', fontWeight: 900, fontSize: 14, padding: '11px 24px', borderRadius: 12, border: 'none', cursor: canGenerate ? 'pointer' : 'default', opacity: canGenerate ? 1 : 0.55 }}>
            {loading ? c.generating : c.generate}
          </button>
        </div>
        {error && <p style={{ color: '#fca5a5', fontSize: 13, margin: 0 }}>{error}</p>}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 16, minHeight: 'calc(100vh - 540px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {imageUrl ? (
          <div style={{ width: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={prompt} style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: 'calc(100vh - 510px)', borderRadius: 16, boxShadow: '0 18px 70px rgba(0,0,0,.45)' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleDownload} style={{ background: 'linear-gradient(135deg, #7c5cff, #22d3ee)', color: '#fff', fontWeight: 900, fontSize: 14, padding: '11px 24px', borderRadius: 12, border: 'none', cursor: 'pointer' }}>{c.download}</button>
              <button onClick={handleGenerate} className="sb-button-secondary" style={{ borderRadius: 12 }}>{c.again}</button>
            </div>
          </div>
        ) : (
          <div className="sb-empty" style={{ width: '100%' }}>{loading ? c.generating : c.empty}</div>
        )}
      </div>
    </div>
  )
}
