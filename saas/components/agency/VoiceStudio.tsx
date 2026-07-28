'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type VoiceOption = {
  id: string
  name: string
  description: Record<Lang, string>
}

const VOICES: VoiceOption[] = [
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    description: {
      en: 'Calm, clear female voice',
      es: 'Voz femenina clara y tranquila',
      pt: 'Voz feminina calma e clara',
      pl: 'Spokojny, wyraźny głos kobiecy',
      ru: 'Спокойный и ясный женский голос',
    },
  },
  {
    id: '29vD33N1CtxCmqQRPOHJ',
    name: 'Drew',
    description: {
      en: 'Confident male narrator',
      es: 'Narrador masculino seguro',
      pt: 'Narrador masculino confiante',
      pl: 'Pewny siebie męski narrator',
      ru: 'Уверенный мужской диктор',
    },
  },
  {
    id: '2EiwWnXFnvU5JabPnv8n',
    name: 'Clyde',
    description: {
      en: 'Deep cinematic male voice',
      es: 'Voz masculina profunda y cinematográfica',
      pt: 'Voz masculina profunda e cinematográfica',
      pl: 'Głęboki, filmowy głos męski',
      ru: 'Глубокий кинематографичный мужской голос',
    },
  },
  {
    id: 'AZnzlk1XvdvUeBnXmlld',
    name: 'Domi',
    description: {
      en: 'Energetic female presenter',
      es: 'Presentadora femenina enérgica',
      pt: 'Apresentadora feminina enérgica',
      pl: 'Energiczny głos kobiecej prezenterki',
      ru: 'Энергичный женский голос ведущей',
    },
  },
]

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  body: string
  scriptLabel: string
  scriptPlaceholder: string
  voiceLabel: string
  fundingLabel: string
  creditsMode: string
  byokMode: string
  estimateLabel: string
  estimatedCredits: string
  generate: string
  generating: string
  previewTitle: string
  download: string
  emptyError: string
  requestError: string
  characterLimit: string
  byokNote: string
  walletNote: string
}> = {
  en: {
    eyebrow: uiCopy('u_de31066ecf797530'),
    title: uiCopy('u_8413a34983b1311c'),
    body: uiCopy('u_a3f5e84c837a7dfe'),
    scriptLabel: uiCopy('u_884fefec9c95f634'),
    scriptPlaceholder: uiCopy('u_288fe94d771dcf6e'),
    voiceLabel: uiCopy('u_60b74ee20fb0d6b8'),
    fundingLabel: uiCopy('u_cd917ec826355343'),
    creditsMode: uiCopy('u_92b7dec629c404cb'),
    byokMode: uiCopy('u_a72092cc1110a1d2'),
    estimateLabel: uiCopy('u_0491d864725a6219'),
    estimatedCredits: uiCopy('u_90de34db4a2869ee'),
    generate: uiCopy('u_5be1798e9b08d92a'),
    generating: uiCopy('u_42be882f9d4f6f29'),
    previewTitle: uiCopy('u_12a8eb2aa8eb0ea8'),
    download: uiCopy('u_363e4c25faea7dab'),
    emptyError: uiCopy('u_d89be013bef60ead'),
    requestError: uiCopy('u_f0da28c17105ba07'),
    characterLimit: uiCopy('u_064935640f4c9a4b'),
    byokNote: uiCopy('u_729a81017b1ac208'),
    walletNote: uiCopy('u_af8d7d5e8f2074ba'),
  },
  es: {
    eyebrow: 'Estudio de voz',
    title: 'Genera una locución lista para producción',
    body: 'Elige una voz, revisa el costo estimado y genera solo cuando estés listo. No se gasta nada hasta que pulses Generar locución.',
    scriptLabel: 'Guion de locución',
    scriptPlaceholder: 'Introduce el guion final aprobado para esta locución.',
    voiceLabel: 'Voz',
    fundingLabel: 'Método de pago',
    creditsMode: 'Usar créditos de render de SignalBoost',
    byokMode: 'Usar mi clave de ElevenLabs conectada',
    estimateLabel: 'Costo estimado del proveedor',
    estimatedCredits: 'créditos antes del margen de la plataforma',
    generate: 'Generar locución',
    generating: 'Generando locución…',
    previewTitle: 'Locución generada',
    download: 'Abrir archivo de audio',
    emptyError: 'Introduce un guion antes de generar.',
    requestError: 'La generación de la locución falló.',
    characterLimit: 'Máximo 5.000 caracteres',
    byokNote: 'El modo BYOK usa tu clave almacenada de ElevenLabs y no cobra créditos de render de SignalBoost.',
    walletNote: 'El modo de créditos reserva fondos antes de llamar al proveedor. Los renders fallidos se reembolsan.',
  },
  pt: {
    eyebrow: 'Estúdio de voz',
    title: 'Gere uma locução pronta para produção',
    body: 'Escolha uma voz, revise o custo estimado e gere somente quando estiver pronto. Nada é gasto até você clicar em Gerar locução.',
    scriptLabel: 'Roteiro da locução',
    scriptPlaceholder: 'Insira o roteiro final aprovado para esta locução.',
    voiceLabel: 'Voz',
    fundingLabel: 'Forma de pagamento',
    creditsMode: 'Usar créditos de render da SignalBoost',
    byokMode: 'Usar minha chave ElevenLabs conectada',
    estimateLabel: 'Custo estimado do provedor',
    estimatedCredits: 'créditos antes da margem da plataforma',
    generate: 'Gerar locução',
    generating: 'Gerando locução…',
    previewTitle: 'Locução gerada',
    download: 'Abrir arquivo de áudio',
    emptyError: 'Insira um roteiro antes de gerar.',
    requestError: 'Falha ao gerar a locução.',
    characterLimit: 'Máximo de 5.000 caracteres',
    byokNote: 'O modo BYOK usa sua chave ElevenLabs armazenada e não cobra créditos de render da SignalBoost.',
    walletNote: 'O modo de créditos reserva os fundos antes de chamar o provedor. Renders com falha são reembolsados.',
  },
  pl: {
    eyebrow: 'Studio głosu',
    title: 'Wygeneruj lektora gotowego do produkcji',
    body: 'Wybierz głos, sprawdź szacowany koszt i generuj dopiero, gdy wszystko jest gotowe. Żadne środki nie są zużywane przed kliknięciem przycisku Generuj lektora.',
    scriptLabel: 'Tekst lektorski',
    scriptPlaceholder: 'Wprowadź ostatecznie zatwierdzony tekst lektorski.',
    voiceLabel: 'Głos',
    fundingLabel: 'Sposób finansowania',
    creditsMode: 'Użyj kredytów renderowania SignalBoost',
    byokMode: 'Użyj mojego podłączonego klucza ElevenLabs',
    estimateLabel: 'Szacowany koszt dostawcy',
    estimatedCredits: 'kredytów przed marżą platformy',
    generate: 'Generuj lektora',
    generating: 'Generowanie lektora…',
    previewTitle: 'Wygenerowany lektor',
    download: 'Otwórz plik audio',
    emptyError: 'Wprowadź tekst lektorski przed generowaniem.',
    requestError: 'Generowanie lektora nie powiodło się.',
    characterLimit: 'Maksymalnie 5 000 znaków',
    byokNote: 'Tryb BYOK używa zapisanego klucza ElevenLabs i nie pobiera kredytów renderowania SignalBoost.',
    walletNote: 'Tryb kredytowy rezerwuje środki przed wywołaniem dostawcy. Nieudane rendery są zwracane.',
  },
  ru: {
    eyebrow: 'Студия голоса',
    title: 'Создайте готовую к производству озвучку',
    body: 'Выберите голос, проверьте предполагаемую стоимость и запускайте генерацию только после готовности. Средства не расходуются до нажатия кнопки Создать озвучку.',
    scriptLabel: 'Текст озвучки',
    scriptPlaceholder: 'Введите окончательно утверждённый текст озвучки.',
    voiceLabel: 'Голос',
    fundingLabel: 'Способ оплаты',
    creditsMode: 'Использовать кредиты рендеринга SignalBoost',
    byokMode: 'Использовать подключённый ключ ElevenLabs',
    estimateLabel: 'Предполагаемая стоимость провайдера',
    estimatedCredits: 'кредитов до наценки платформы',
    generate: 'Создать озвучку',
    generating: 'Создание озвучки…',
    previewTitle: 'Готовая озвучка',
    download: 'Открыть аудиофайл',
    emptyError: 'Введите текст озвучки перед генерацией.',
    requestError: 'Не удалось создать озвучку.',
    characterLimit: 'Максимум 5 000 символов',
    byokNote: 'Режим BYOK использует сохранённый ключ ElevenLabs и не списывает кредиты рендеринга SignalBoost.',
    walletNote: 'В режиме кошелька кредиты резервируются до вызова провайдера. При ошибке рендера средства возвращаются.',
  },
}

export default function VoiceStudio() {
  const { lang } = useI18n()
  const resolvedLang = (['en', 'es', 'pt', 'pl', 'ru'].includes(lang) ? lang : 'en') as Lang
  const copy = COPY[resolvedLang]

  const [text, setText] = useState('')
  const [voiceId, setVoiceId] = useState(VOICES[0].id)
  const [useByok, setUseByok] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [charged, setCharged] = useState<boolean | null>(null)
  const [providerCostCents, setProviderCostCents] = useState<number | null>(null)

  const estimatedProviderCredits = useMemo(() => {
    if (!text.length) return 0
    return Math.ceil((text.length / 1000) * 18)
  }, [text])

  async function generateVoiceover() {
    const trimmed = text.trim()
    if (!trimmed) {
      setError(copy.emptyError)
      return
    }

    setBusy(true)
    setError(null)
    setAudioUrl(null)
    setCharged(null)
    setProviderCostCents(null)

    try {
      const res = await fetch('/api/agency/render/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, voiceId, useByok }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok || !data?.url) {
        setError(data?.error || copy.requestError)
        return
      }
      setAudioUrl(String(data.url))
      setCharged(Boolean(data.charged))
      setProviderCostCents(Number(data.providerCostCents) || 0)
    } catch {
      setError(copy.requestError)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="sb-page-shell sb-section" aria-labelledby="voice-studio-title">
      <div className="sb-glass" style={{ padding: 28, display: 'grid', gap: 20 }}>
        <div>
          <span className="sb-eyebrow">{copy.eyebrow}</span>
          <h2 id="voice-studio-title" className="sb-h2" style={{ margin: '8px 0 6px' }}>{copy.title}</h2>
          <p className="sb-body" style={{ margin: 0, maxWidth: 820 }}>{copy.body}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, .6fr)', gap: 18 }}>
          <div style={{ display: 'grid', gap: 14 }}>
            <label htmlFor="voice-script" style={{ display: 'grid', gap: 7 }}>
              <span className="sb-caption" style={{ fontWeight: 800 }}>{copy.scriptLabel}</span>
              <textarea
                id="voice-script"
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, 5000))}
                placeholder={copy.scriptPlaceholder}
                maxLength={5000}
                rows={10}
                className="sb-input"
                style={{ width: '100%', resize: 'vertical', minHeight: 210, padding: 14 }}
              />
            </label>
            <div className="sb-caption" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span>{copy.characterLimit}</span>
              <span aria-live="polite">{text.length.toLocaleString()} / 5,000</span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            <label htmlFor="voice-picker" style={{ display: 'grid', gap: 7 }}>
              <span className="sb-caption" style={{ fontWeight: 800 }}>{copy.voiceLabel}</span>
              <select
                id="voice-picker"
                value={voiceId}
                onChange={(event) => setVoiceId(event.target.value)}
                className="sb-input"
                style={{ width: '100%', padding: 12 }}
              >
                {VOICES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} — {voice.description[resolvedLang]}
                  </option>
                ))}
              </select>
            </label>

            <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'grid', gap: 9 }}>
              <legend className="sb-caption" style={{ fontWeight: 800, marginBottom: 7 }}>{copy.fundingLabel}</legend>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <input type="radio" name="voice-funding" checked={!useByok} onChange={() => setUseByok(false)} />
                <span className="sb-body" style={{ fontSize: 13 }}>{copy.creditsMode}</span>
              </label>
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                <input type="radio" name="voice-funding" checked={useByok} onChange={() => setUseByok(true)} />
                <span className="sb-body" style={{ fontSize: 13 }}>{copy.byokMode}</span>
              </label>
            </fieldset>

            <div className="sb-card" style={{ padding: 14 }}>
              <div className="sb-caption">{copy.estimateLabel}</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{estimatedProviderCredits}</div>
              <div className="sb-caption">{copy.estimatedCredits}</div>
            </div>

            <p className="sb-caption" style={{ margin: 0 }}>{useByok ? copy.byokNote : copy.walletNote}</p>

            <button
              type="button"
              className="sb-button-primary"
              onClick={generateVoiceover}
              disabled={busy || !text.trim()}
              style={{ width: '100%', opacity: busy || !text.trim() ? 0.65 : 1 }}
            >
              {busy ? copy.generating : copy.generate}
            </button>
          </div>
        </div>

        {error ? (
          <div role="alert" style={{ border: '1px solid rgba(248,113,113,.35)', background: 'rgba(248,113,113,.08)', borderRadius: 12, padding: 12, color: '#fecaca' }}>
            {error}
          </div>
        ) : null}

        {audioUrl ? (
          <div className="sb-card" style={{ padding: 18, display: 'grid', gap: 12 }}>
            <h3 className="sb-h3" style={{ margin: 0 }}>{copy.previewTitle}</h3>
            <audio controls src={audioUrl} style={{ width: '100%' }}>
              <track kind="captions" />
            </audio>
            <div className="sb-caption">
              {providerCostCents !== null ? `${copy.estimateLabel}: ${providerCostCents}` : ''}
              {charged !== null ? ` · ${charged ? copy.creditsMode : copy.byokMode}` : ''}
            </div>
            <a className="sb-button-secondary" href={audioUrl} target="_blank" rel="noreferrer" style={{ width: 'fit-content' }}>
              {copy.download}
            </a>
          </div>
        ) : null}
      </div>
    </section>
  )
}
