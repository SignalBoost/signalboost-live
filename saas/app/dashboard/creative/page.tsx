'use client'

// Creative Studio — generate promo banners and campaign visuals with AI (Gemini).
// Translations are inlined here so no shared locale file needs editing.

import { useState } from 'react'
import { useTranslation } from '@/lib/i18n/useTranslation'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const COPY: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Creative Studio',
    subtitle: 'Generate professional promo banners and campaign visuals powered by AI.',
    promptLabel: 'Describe the image you want',
    promptPlaceholder: 'e.g. A vibrant promo banner for a São Paulo coffee shop, warm tones, people laughing, cinematic lighting',
    aspect: 'Shape',
    landscape: 'Landscape (16:9)',
    square: 'Square (1:1)',
    portrait: 'Portrait (4:5)',
    generate: 'Generate image',
    generating: 'Generating…',
    download: 'Download image',
    again: 'Generate another',
    empty: 'Your generated image will appear here.',
    errorGeneric: 'Something went wrong. Please try again.',
  },
  es: {
    title: 'Estudio Creativo',
    subtitle: 'Genera banners promocionales y visuales de campaña con IA.',
    promptLabel: 'Describe la imagen que quieres',
    promptPlaceholder: 'p. ej. Un banner promocional vibrante para una cafetería de São Paulo, tonos cálidos, gente riendo, iluminación cinematográfica',
    aspect: 'Forma',
    landscape: 'Horizontal (16:9)',
    square: 'Cuadrado (1:1)',
    portrait: 'Vertical (4:5)',
    generate: 'Generar imagen',
    generating: 'Generando…',
    download: 'Descargar imagen',
    again: 'Generar otra',
    empty: 'Tu imagen generada aparecerá aquí.',
    errorGeneric: 'Algo salió mal. Inténtalo de nuevo.',
  },
  pt: {
    title: 'Estúdio Criativo',
    subtitle: 'Gere banners promocionais e visuais de campanha com IA.',
    promptLabel: 'Descreva a imagem que você quer',
    promptPlaceholder: 'ex. Um banner promocional vibrante para uma cafeteria de São Paulo, tons quentes, pessoas rindo, iluminação cinematográfica',
    aspect: 'Formato',
    landscape: 'Paisagem (16:9)',
    square: 'Quadrado (1:1)',
    portrait: 'Retrato (4:5)',
    generate: 'Gerar imagem',
    generating: 'Gerando…',
    download: 'Baixar imagem',
    again: 'Gerar outra',
    empty: 'Sua imagem gerada aparecerá aqui.',
    errorGeneric: 'Algo deu errado. Tente novamente.',
  },
  pl: {
    title: 'Studio kreatywne',
    subtitle: 'Generuj banery promocyjne i wizualizacje kampanii dzięki AI.',
    promptLabel: 'Opisz obraz, który chcesz',
    promptPlaceholder: 'np. Żywy baner promocyjny dla kawiarni w São Paulo, ciepłe tony, śmiejący się ludzie, kinowe oświetlenie',
    aspect: 'Kształt',
    landscape: 'Poziomy (16:9)',
    square: 'Kwadrat (1:1)',
    portrait: 'Pionowy (4:5)',
    generate: 'Generuj obraz',
    generating: 'Generowanie…',
    download: 'Pobierz obraz',
    again: 'Generuj kolejny',
    empty: 'Twój wygenerowany obraz pojawi się tutaj.',
    errorGeneric: 'Coś poszło nie tak. Spróbuj ponownie.',
  },
  ru: {
    title: 'Креативная студия',
    subtitle: 'Создавайте промо-баннеры и визуалы кампаний с помощью ИИ.',
    promptLabel: 'Опишите нужное изображение',
    promptPlaceholder: 'напр. Яркий промо-баннер для кофейни в Сан-Паулу, тёплые тона, смеющиеся люди, кинематографическое освещение',
    aspect: 'Форма',
    landscape: 'Горизонтальный (16:9)',
    square: 'Квадрат (1:1)',
    portrait: 'Вертикальный (4:5)',
    generate: 'Создать изображение',
    generating: 'Создание…',
    download: 'Скачать изображение',
    again: 'Создать ещё',
    empty: 'Здесь появится созданное изображение.',
    errorGeneric: 'Что-то пошло не так. Попробуйте снова.',
  },
}

export default function CreativeStudioPage() {
  // useTranslation gives us the active language; we map it to our inline copy.
  const { lang } = useTranslation() as { lang?: string }
  const L: Lang = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang || '') ? lang : 'en') as Lang
  const c = COPY[L]

  const [prompt, setPrompt] = useState('')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    if (prompt.trim().length < 3 || loading) return
    setLoading(true)
    setError(null)
    setImageUrl(null)
    try {
      const res = await fetch('/api/creative/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio }),
      })
      const data = await res.json()
      if (!res.ok || !data?.imageUrl) {
        setError(data?.error || c.errorGeneric)
      } else {
        setImageUrl(data.imageUrl)
      }
    } catch {
      setError(c.errorGeneric)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownload() {
    if (!imageUrl) return
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `signalboost-creative-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      window.open(imageUrl, '_blank')
    }
  }

  const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    padding: 20,
  }
  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(135deg, #7c5cff, #22d3ee)',
    color: '#fff', fontWeight: 800, fontSize: 14, padding: '12px 22px',
    borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer',
    opacity: loading || prompt.trim().length < 3 ? 0.6 : 1,
  }
  const btnGhost: React.CSSProperties = {
    background: 'transparent', color: 'inherit', fontWeight: 700, fontSize: 13,
    padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{c.title}</h1>
      <p style={{ opacity: 0.7, marginTop: 8, marginBottom: 24, lineHeight: 1.5 }}>{c.subtitle}</p>

      <div style={card}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{c.promptLabel}</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={c.promptPlaceholder}
          rows={4}
          style={{
            width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.2)',
            color: 'inherit', fontSize: 14, resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 700, fontSize: 13 }}>{c.aspect}</label>
          <select
            value={aspectRatio}
            onChange={e => setAspectRatio(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.2)', color: 'inherit', fontSize: 13 }}
          >
            <option value="16:9">{c.landscape}</option>
            <option value="1:1">{c.square}</option>
            <option value="4:5">{c.portrait}</option>
          </select>

          <button onClick={handleGenerate} disabled={loading || prompt.trim().length < 3} style={btnPrimary}>
            {loading ? c.generating : c.generate}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 14, color: '#fca5a5', fontSize: 13 }}>{error}</div>
        )}
      </div>

      <div style={{ ...card, marginTop: 20, minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {imageUrl ? (
          <div style={{ width: '100%' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={prompt} style={{ width: '100%', borderRadius: 12, display: 'block' }} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleDownload} style={btnPrimary}>{c.download}</button>
              <button onClick={handleGenerate} style={btnGhost}>{c.again}</button>
            </div>
          </div>
        ) : (
          <span style={{ opacity: 0.5, fontSize: 14 }}>{loading ? c.generating : c.empty}</span>
        )}
      </div>
    </div>
  )
}
