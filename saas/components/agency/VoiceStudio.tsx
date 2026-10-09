'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
      de: 'Ruhige, klare Frauenstimme',
      fr: 'Voix féminine calme et claire',
      it: 'Voce femminile calma e chiara',
      ja: '落ち着いたクリアな女性の声',
      ko: '차분하고 또렷한 여성 목소리',
      ar: 'صوت أنثوي هادئ وواضح',
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
      de: 'Selbstbewusster männlicher Sprecher',
      fr: 'Narrateur masculin assuré',
      it: 'Narratore maschile sicuro',
      ja: '自信に満ちた男性ナレーター',
      ko: '자신감 있는 남성 내레이터',
      ar: 'راوٍ ذكوري واثق',
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
      de: 'Tiefe, cineastische Männerstimme',
      fr: 'Voix masculine grave et cinématographique',
      it: 'Voce maschile profonda e cinematografica',
      ja: '深みのある映画的な男性の声',
      ko: '깊고 영화 같은 남성 목소리',
      ar: 'صوت ذكوري عميق بطابع سينمائي',
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
      de: 'Energiegeladene Moderatorin',
      fr: 'Présentatrice énergique',
      it: 'Presentatrice energica',
      ja: 'エネルギッシュな女性プレゼンター',
      ko: '활기찬 여성 진행자',
      ar: 'مقدّمة برامج نشيطة',
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
    eyebrow: uiText('generatedUi.u_8fc577da2e513eaa'),
    title: uiText('generatedUi.u_8a03dd141fd6e46d'),
    body: uiText('generatedUi.u_fb4f3d83f3618ad9'),
    scriptLabel: uiText('generatedUi.u_2092c74626323756'),
    scriptPlaceholder: uiText('generatedUi.u_31f003a29811f859'),
    voiceLabel: uiText('generatedUi.u_87bf2bc08589f0bd'),
    fundingLabel: uiText('generatedUi.u_7a740873aeadd46f'),
    creditsMode: uiText('generatedUi.u_a14f0d63afc66254'),
    byokMode: uiText('generatedUi.u_faaa80ce68f34d0f'),
    estimateLabel: uiText('generatedUi.u_441d5bb37f6f4d55'),
    estimatedCredits: uiText('generatedUi.u_9de03b671cb4b4b0'),
    generate: uiText('generatedUi.u_30d9f13213c7c061'),
    generating: uiText('generatedUi.u_5f1baf3681e07f17'),
    previewTitle: uiText('generatedUi.u_864416c0cb3d2366'),
    download: uiText('generatedUi.u_861c0c1e022f2149'),
    emptyError: uiText('generatedUi.u_9a029984a12dae4d'),
    requestError: uiText('generatedUi.u_d7ba5f74b913d1c5'),
    characterLimit: uiText('generatedUi.u_cf362b3636810f22'),
    byokNote: uiText('generatedUi.u_eef131102e30725b'),
    walletNote: uiText('generatedUi.u_847eea078a734d2f'),
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
  de: {
    eyebrow: 'Voice Studio',
    title: 'Produktionsreifes Voiceover generieren',
    body: 'Wählen Sie eine Stimme, prüfen Sie die geschätzten Anbieterkosten und generieren Sie erst, wenn Sie bereit sind. Es fallen keine Kosten an, bis Sie auf „Voiceover generieren“ klicken.',
    scriptLabel: 'Voiceover-Skript',
    scriptPlaceholder: 'Geben Sie das endgültig genehmigte Skript für dieses Voiceover ein.',
    voiceLabel: 'Stimme',
    fundingLabel: 'Finanzierungsmethode',
    creditsMode: 'SignalBoost-Render-Guthaben verwenden',
    byokMode: 'Meinen verbundenen ElevenLabs-Schlüssel verwenden',
    estimateLabel: 'Geschätzte Anbieterkosten',
    estimatedCredits: 'Credits vor Plattformaufschlag',
    generate: 'Voiceover generieren',
    generating: 'Voiceover wird generiert…',
    previewTitle: 'Generiertes Voiceover',
    download: 'Audiodatei öffnen',
    emptyError: 'Geben Sie vor dem Generieren ein Voiceover-Skript ein.',
    requestError: 'Generierung des Voiceovers fehlgeschlagen.',
    characterLimit: 'Maximal 5.000 Zeichen',
    byokNote: 'Der BYOK-Modus verwendet Ihren gespeicherten ElevenLabs-Schlüssel und verbraucht keine SignalBoost-Render-Credits.',
    walletNote: 'Der Wallet-Modus reserviert Credits, bevor der Anbieter aufgerufen wird. Fehlgeschlagene Anbieter-Renderings werden erstattet.',
  },
  fr: {
    eyebrow: 'Studio vocal',
    title: 'Générez une voix off prête pour la production',
    body: 'Choisissez une voix, vérifiez le coût estimé du fournisseur et ne lancez la génération que lorsque vous êtes prêt. Rien n\'est dépensé tant que vous n\'avez pas cliqué sur Générer la voix off.',
    scriptLabel: 'Script de voix off',
    scriptPlaceholder: 'Saisissez le script final approuvé pour cette voix off.',
    voiceLabel: 'Voix',
    fundingLabel: 'Méthode de financement',
    creditsMode: 'Utiliser les crédits de rendu SignalBoost',
    byokMode: 'Utiliser ma clé ElevenLabs connectée',
    estimateLabel: 'Coût estimé du fournisseur',
    estimatedCredits: 'crédits avant majoration de la plateforme',
    generate: 'Générer la voix off',
    generating: 'Génération de la voix off…',
    previewTitle: 'Voix off générée',
    download: 'Ouvrir le fichier audio',
    emptyError: 'Saisissez un script de voix off avant de générer.',
    requestError: 'Échec de la génération de la voix off.',
    characterLimit: '5 000 caractères maximum',
    byokNote: 'Le mode BYOK utilise votre clé ElevenLabs enregistrée et ne consomme pas de crédits de rendu SignalBoost.',
    walletNote: 'Le mode Portefeuille réserve des crédits avant l’appel au fournisseur. Les rendus échoués du fournisseur sont remboursés.',
  },
  it: {
    eyebrow: 'Studio voce',
    title: 'Genera un voiceover pronto per la produzione',
    body: 'Scegli una voce, controlla il costo stimato del provider e genera solo quando sei pronto. Non viene speso nulla finché non premi Genera voiceover.',
    scriptLabel: 'Script della voce fuori campo',
    scriptPlaceholder: 'Inserisci lo script finale approvato per questo voice-over.',
    voiceLabel: 'Voce',
    fundingLabel: 'Metodo di finanziamento',
    creditsMode: 'Usa i crediti di rendering SignalBoost',
    byokMode: 'Usa la mia chiave ElevenLabs collegata',
    estimateLabel: 'Costo stimato del provider',
    estimatedCredits: 'crediti prima del ricarico della piattaforma',
    generate: 'Genera voice-over',
    generating: 'Generazione della voce fuori campo…',
    previewTitle: 'Voiceover generato',
    download: 'Apri file audio',
    emptyError: 'Inserisci uno script di voiceover prima di generare.',
    requestError: 'Generazione della voce fuori campo non riuscita.',
    characterLimit: 'Massimo 5.000 caratteri',
    byokNote: 'La modalità BYOK usa la tua chiave ElevenLabs salvata e non addebita crediti di rendering SignalBoost.',
    walletNote: 'La modalità Wallet riserva i crediti prima di chiamare il provider. I render falliti del provider vengono rimborsati.',
  },
  ja: {
    eyebrow: 'ボイススタジオ',
    title: '本番品質のナレーションを生成',
    body: '音声を選択し、プロバイダーの見積もりコストを確認して、準備ができたときにだけ生成してください。「ナレーションを生成」を押すまで費用は発生しません。',
    scriptLabel: 'ナレーション原稿',
    scriptPlaceholder: 'このナレーションの最終承認済み台本を入力してください。',
    voiceLabel: '音声',
    fundingLabel: '資金調達方法',
    creditsMode: 'SignalBoost のレンダリングクレジットを使用',
    byokMode: '接続済みの ElevenLabs キーを使用',
    estimateLabel: '推定プロバイダーコスト',
    estimatedCredits: 'プラットフォーム上乗せ前のクレジット',
    generate: 'ナレーションを生成',
    generating: 'ナレーションを生成中…',
    previewTitle: '生成されたナレーション',
    download: '音声ファイルを開く',
    emptyError: '生成する前にナレーション原稿を入力してください。',
    requestError: 'ナレーションの生成に失敗しました。',
    characterLimit: '最大 5,000 文字',
    byokNote: 'BYOK モードでは保存済みの ElevenLabs キーを使用し、SignalBoost のレンダリングクレジットは消費されません。',
    walletNote: 'ウォレットモードでは、プロバイダーを呼び出す前にクレジットを予約します。プロバイダーのレンダリングが失敗した場合は返金されます。',
  },
  ko: {
    eyebrow: '보이스 스튜디오',
    title: '프로덕션용 보이스오버 생성',
    body: '음성을 선택하고 예상 제공업체 비용을 검토한 다음 준비가 되었을 때만 생성하세요. 보이스오버 생성을 누르기 전까지는 비용이 발생하지 않습니다.',
    scriptLabel: '보이스오버 스크립트',
    scriptPlaceholder: '이 보이스오버의 최종 승인된 스크립트를 입력하세요.',
    voiceLabel: '음성',
    fundingLabel: '자금 조달 방법',
    creditsMode: 'SignalBoost 렌더링 크레딧 사용',
    byokMode: '연결된 ElevenLabs 키 사용',
    estimateLabel: '예상 공급자 비용',
    estimatedCredits: '플랫폼 마크업 전 크레딧',
    generate: '보이스오버 생성',
    generating: '보이스오버 생성 중…',
    previewTitle: '생성된 보이스오버',
    download: '오디오 파일 열기',
    emptyError: '생성하기 전에 보이스오버 스크립트를 입력하세요.',
    requestError: '보이스오버 생성에 실패했습니다.',
    characterLimit: '최대 5,000자',
    byokNote: 'BYOK 모드는 저장된 ElevenLabs 키를 사용하며 SignalBoost 렌더링 크레딧을 차감하지 않습니다.',
    walletNote: '지갑 모드는 공급자를 호출하기 전에 크레딧을 예약합니다. 실패한 공급자 렌더링은 환불됩니다.',
  },
  ar: {
    eyebrow: 'استوديو الصوت',
    title: 'إنشاء تعليق صوتي جاهز للإنتاج',
    body: 'اختر صوتًا، وراجع التكلفة التقديرية للمزوّد، ولا تُنشئ إلا عندما تكون جاهزًا. لن يُنفق أي شيء حتى تضغط على إنشاء التعليق الصوتي.',
    scriptLabel: 'نص التعليق الصوتي',
    scriptPlaceholder: 'أدخل النص النهائي المعتمد لهذا التعليق الصوتي.',
    voiceLabel: 'الصوت',
    fundingLabel: 'طريقة التمويل',
    creditsMode: 'استخدام أرصدة العرض من SignalBoost',
    byokMode: 'استخدام مفتاح ElevenLabs المتصل',
    estimateLabel: 'التكلفة التقديرية للمزوّد',
    estimatedCredits: 'الأرصدة قبل هامش المنصة',
    generate: 'إنشاء تعليق صوتي',
    generating: 'جارٍ إنشاء التعليق الصوتي…',
    previewTitle: 'التعليق الصوتي المُنشأ',
    download: 'فتح الملف الصوتي',
    emptyError: 'أدخل نص التعليق الصوتي قبل الإنشاء.',
    requestError: 'فشل إنشاء التعليق الصوتي.',
    characterLimit: 'الحد الأقصى 5,000 حرف',
    byokNote: 'يستخدم وضع BYOK مفتاح ElevenLabs المخزّن لديك ولا يخصم أرصدة العرض من SignalBoost.',
    walletNote: 'يحجز وضع المحفظة الأرصدة قبل استدعاء المزوّد. ويتم استرداد عمليات العرض الفاشلة لدى المزوّد.',
  },
}

export default function VoiceStudio() {
  const { lang } = useI18n()
  const resolvedLang = (['en', 'es', 'pt', 'pl', 'ru', 'de', 'fr', 'it', 'ja', 'ko', 'ar'].includes(lang) ? lang : 'en') as Lang
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
