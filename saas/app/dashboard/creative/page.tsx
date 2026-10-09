'use client'

import { useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'
const COPY: Record<Lang, Record<string, string>> = {
  en: {
    eyebrow: uiText('generatedUi.u_c0a1ec0a03c6b0bf'), title: uiText('generatedUi.u_c0a1ec0a03c6b0bf'),
    subtitle: uiText('generatedUi.u_8b17451fcb5cafdf'),
    promptLabel: uiText('generatedUi.u_f0c4005c1962c887'),
    promptPlaceholder: uiText('generatedUi.u_1a86b63cbc2be21f'),
    aspect: uiText('generatedUi.u_e0e492707f85ff1f'), landscape: uiText('generatedUi.u_f286650191280073'), square: uiText('generatedUi.u_94136fd2d7290831'), portrait: uiText('generatedUi.u_66a1d9226c924d21'),
    generate: uiText('generatedUi.u_1c9c87eec07e453b'), generating: uiText('generatedUi.u_d20a4476a0a85978'), download: uiText('generatedUi.u_3ac575dcce244f93'), again: uiText('generatedUi.u_556f4bba96daab7a'),
    empty: uiText('generatedUi.u_af9d601dd49918f3'), errorGeneric: uiText('generatedUi.u_3ccd9d6586ef9143'),
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
  de: {
    eyebrow: 'Kreativstudio', title: 'Kreativstudio',
    subtitle: 'Erstellen Sie professionelle Werbebanner und Kampagnenvisuals mit KI.',
    promptLabel: 'Beschreiben Sie das gewünschte Bild',
    promptPlaceholder: 'z. B. Ein lebendiges Werbebanner für ein Café in São Paulo, warme Töne, lachende Menschen, filmische Beleuchtung',
    aspect: 'Form', landscape: 'Querformat (16:9)', square: 'Quadratisch (1:1)', portrait: 'Hochformat (4:5)',
    generate: 'Bild generieren', generating: 'Wird generiert…', download: 'Bild herunterladen', again: 'Weitere generieren',
    empty: 'Ihr generiertes Bild wird hier angezeigt.', errorGeneric: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
  },
  fr: {
    eyebrow: 'Studio créatif', title: 'Studio créatif',
    subtitle: 'Générez des bannières promotionnelles professionnelles et des visuels de campagne grâce à l’IA.',
    promptLabel: 'Décrivez l\'image souhaitée',
    promptPlaceholder: 'ex. Une bannière promotionnelle éclatante pour un café de São Paulo, tons chauds, personnes qui rient, éclairage cinématographique',
    aspect: 'Forme', landscape: 'Paysage (16:9)', square: 'Carré (1:1)', portrait: 'Portrait (4:5)',
    generate: 'Générer une image', generating: 'Génération…', download: 'Télécharger l’image', again: 'En générer un autre',
    empty: 'Votre image générée s\'affichera ici.', errorGeneric: 'Une erreur s’est produite. Veuillez réessayer.',
  },
  it: {
    eyebrow: 'Studio creativo', title: 'Studio creativo',
    subtitle: 'Genera banner promozionali professionali e visual per le campagne con l’AI.',
    promptLabel: 'Descrivi l\'immagine che desideri',
    promptPlaceholder: 'es. Un banner promozionale vivace per una caffetteria di São Paulo, toni caldi, persone che ridono, illuminazione cinematografica',
    aspect: 'Forma', landscape: 'Orizzontale (16:9)', square: 'Quadrato (1:1)', portrait: 'Verticale (4:5)',
    generate: 'Genera immagine', generating: 'Generazione…', download: 'Scarica immagine', again: 'Genera un altro',
    empty: 'L\'immagine generata apparirà qui.', errorGeneric: 'Si è verificato un errore. Riprova.',
  },
  ja: {
    eyebrow: 'クリエイティブスタジオ', title: 'クリエイティブスタジオ',
    subtitle: 'AI を活用して、プロ品質のプロモーションバナーとキャンペーンビジュアルを生成します。',
    promptLabel: '作成したい画像を説明してください',
    promptPlaceholder: '例：サンパウロのコーヒーショップ向けの鮮やかなプロモーションバナー、暖色系、笑い合う人々、映画のような照明',
    aspect: '形状', landscape: '横向き (16:9)', square: '正方形（1:1）', portrait: '縦向き（4:5）',
    generate: '画像を生成', generating: '生成中…', download: '画像をダウンロード', again: 'もう一度生成',
    empty: '生成された画像がここに表示されます。', errorGeneric: '問題が発生しました。もう一度お試しください。',
  },
  ko: {
    eyebrow: '크리에이티브 스튜디오', title: '크리에이티브 스튜디오',
    subtitle: 'AI 기반으로 전문적인 홍보 배너와 캠페인 비주얼을 생성하세요.',
    promptLabel: '원하는 이미지를 설명하세요',
    promptPlaceholder: '예: 상파울루 커피숍을 위한 생동감 있는 프로모션 배너, 따뜻한 색조, 웃고 있는 사람들, 영화 같은 조명',
    aspect: '도형', landscape: '가로 (16:9)', square: '정사각형 (1:1)', portrait: '세로(4:5)',
    generate: '이미지 생성', generating: '생성 중…', download: '이미지 다운로드', again: '하나 더 생성',
    empty: '생성된 이미지가 여기에 표시됩니다.', errorGeneric: '문제가 발생했습니다. 다시 시도하세요.',
  },
  ar: {
    eyebrow: 'الاستوديو الإبداعي', title: 'الاستوديو الإبداعي',
    subtitle: 'أنشئ لافتات ترويجية احترافية ومرئيات للحملات مدعومة بـ AI.',
    promptLabel: 'صف الصورة التي تريدها',
    promptPlaceholder: 'مثال: لافتة ترويجية نابضة بالحياة لمقهى في ساو باولو، بألوان دافئة وأشخاص يضحكون وإضاءة سينمائية',
    aspect: 'الشكل', landscape: 'أفقي (16:9)', square: 'مربع (1:1)', portrait: 'عمودي (4:5)',
    generate: 'إنشاء صورة', generating: 'جارٍ الإنشاء…', download: 'تنزيل الصورة', again: 'إنشاء آخر',
    empty: 'ستظهر صورتك المُنشأة هنا.', errorGeneric: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
  },
}

export default function CreativeStudioPage() {
  const { lang } = useI18n()
  const L: Lang = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang
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
