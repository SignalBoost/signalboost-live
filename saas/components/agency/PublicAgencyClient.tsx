'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'
import type { AgencyCopy } from '@/lib/i18n/agencyCopy'

export const FREE_ORGANIC_MODE = true
export const ENTERPRISE_READY = true

type CheckoutResponse = {
  selectedBudget: number
  processingFee: number
  totalCharged: number
  currency: 'USD'
  status: 'CHECKOUT_READY' | 'STRIPE_CHECKOUT_READY'
  stripeCheckoutUrl?: string
  stripeConfigured?: boolean
}

type OrganicAssets = {
  youtubeTitle: string
  youtubeDescription: string
  youtubeCommunityPost: string
  linkedinCompanyPost: string
  linkedinFounderPost: string
  pressReleaseSubject: string
  pressReleaseBody: string
}

type OrganicResponse = {
  ok: boolean
  error?: string
  assets?: OrganicAssets
}

type TenantCampaignProfile = {
  plan?: 'free' | 'starter' | 'pro' | 'enterprise'
  sponsoredEnterprise?: boolean
  corporateSponsored?: boolean
}

type PublicAgencyClientProps = {
  copy: AgencyCopy['client']
  tenantProfile?: TenantCampaignProfile
}

type Mode = 'download' | 'managed'
type ChannelMode = 'FREE_ORGANIC_MODE' | 'PROGRAMMATIC_ENTERPRISE'

const ORGANIC_COPY: Record<string, {
  formTitle: string
  companyLabel: string
  companyPlaceholder: string
  announcementLabel: string
  announcementPlaceholder: string
  audienceLabel: string
  audiencePlaceholder: string
  websiteLabel: string
  generate: string
  generating: string
  resultsTitle: string
  copyBtn: string
  copied: string
  regenerate: string
  genError: string
  requiredError: string
  dispatchTitle: string
  dispatchBody: string
  publicationLabel: string
  publicationPlaceholder: string
  editorEmailLabel: string
  dispatchBtn: string
  dispatching: string
  dispatchQueued: string
  dispatchError: string
  emailInvalid: string
  byokTitle: string
  byokBody: string
  byokProviderLabel: string
  byokKeyLabel: string
  byokKeyRequired: string
  byokKeyInvalid: string
  byokLiveLabel: string
  byokComingLabel: string
  byokConnected: string
  byokSaveKey: string
  byokDisconnect: string
  sections: { youtube: string; linkedin: string; press: string }
  labels: {
    youtubeTitle: string
    youtubeDescription: string
    youtubeCommunityPost: string
    linkedinCompanyPost: string
    linkedinFounderPost: string
    pressReleaseSubject: string
    pressReleaseBody: string
  }
}> = {
  en: {
    formTitle: 'Describe your campaign in one prompt',
    companyLabel: 'Company or brand name',
    companyPlaceholder: 'e.g. Acme Analytics',
    announcementLabel: 'What are you announcing or promoting?',
    announcementPlaceholder: 'e.g. Launching our new AI reporting dashboard for small agencies',
    audienceLabel: 'Target audience (optional)',
    audiencePlaceholder: 'e.g. Marketing directors at mid-size agencies',
    websiteLabel: 'Website or CTA link (optional)',
    generate: 'Generate organic campaign assets',
    generating: 'Generating campaign assets…',
    resultsTitle: 'Your organic campaign assets',
    copyBtn: 'Copy',
    copied: 'Copied',
    regenerate: 'Regenerate',
    genError: 'Generation failed. Please try again in a moment.',
    requiredError: 'Enter your company name and what you are announcing.',
    dispatchTitle: 'Dispatch this press release',
    dispatchBody: 'Queue the press release for real email dispatch. It goes to owner review first — nothing is sent to the journalist until it is approved in the Marketing workspace.',
    publicationLabel: 'Publication name',
    publicationPlaceholder: 'e.g. TechCrunch, Local Business Journal',
    editorEmailLabel: 'Editor / journalist email',
    dispatchBtn: 'Queue press release for dispatch',
    dispatching: 'Queuing for approval…',
    dispatchQueued: 'Queued. The press release is locked for owner approval and will be emailed to the journalist once approved.',
    dispatchError: 'Could not queue the press release. Please try again.',
    emailInvalid: 'Enter the publication name and a valid editor email.',
    byokTitle: 'Power it with your own AI account',
    byokBody: 'You pay your AI provider directly — roughly $0.03 per generation with Claude, less with OpenAI. Your key is used only for this request, never stored, never logged.',
    byokProviderLabel: 'AI provider',
    byokKeyLabel: 'Your API key',
    byokKeyRequired: 'Paste your AI provider API key to generate. You pay the provider directly per generation.',
    byokKeyInvalid: 'Your API key was rejected by the provider. Check it and try again.',
    byokLiveLabel: 'Available now',
    byokComingLabel: 'Coming soon',
    byokConnected: 'Connected',
    byokSaveKey: 'Save this key to my account for next time',
    byokDisconnect: 'Disconnect',
    sections: { youtube: 'YouTube organic', linkedin: 'LinkedIn organic', press: 'Press release email' },
    labels: {
      youtubeTitle: 'Video title',
      youtubeDescription: 'Video description',
      youtubeCommunityPost: 'Community post',
      linkedinCompanyPost: 'Company page post',
      linkedinFounderPost: 'Founder post',
      pressReleaseSubject: 'Email subject',
      pressReleaseBody: 'Email body',
    },
  },
  es: {
    formTitle: 'Describe tu campaña en un solo prompt',
    companyLabel: 'Nombre de la empresa o marca',
    companyPlaceholder: 'ej. Acme Analytics',
    announcementLabel: '¿Qué estás anunciando o promocionando?',
    announcementPlaceholder: 'ej. Lanzamos nuestro nuevo dashboard de reportes con IA para agencias pequeñas',
    audienceLabel: 'Audiencia objetivo (opcional)',
    audiencePlaceholder: 'ej. Directores de marketing en agencias medianas',
    websiteLabel: 'Sitio web o enlace CTA (opcional)',
    generate: 'Generar activos de campaña orgánica',
    generating: 'Generando activos de campaña…',
    resultsTitle: 'Tus activos de campaña orgánica',
    copyBtn: 'Copiar',
    copied: 'Copiado',
    regenerate: 'Regenerar',
    genError: 'La generación falló. Inténtalo de nuevo en un momento.',
    requiredError: 'Ingresa el nombre de tu empresa y qué estás anunciando.',
    dispatchTitle: 'Enviar este press release',
    dispatchBody: 'Pon en cola el press release para envío real por email. Primero pasa por revisión del owner — nada se envía al periodista hasta que se apruebe en el espacio de Marketing.',
    publicationLabel: 'Nombre de la publicación',
    publicationPlaceholder: 'ej. TechCrunch, diario local de negocios',
    editorEmailLabel: 'Email del editor / periodista',
    dispatchBtn: 'Poner press release en cola de envío',
    dispatching: 'Poniendo en cola para aprobación…',
    dispatchQueued: 'En cola. El press release queda bloqueado para aprobación del owner y se enviará por email al periodista una vez aprobado.',
    dispatchError: 'No se pudo poner en cola el press release. Inténtalo de nuevo.',
    emailInvalid: 'Ingresa el nombre de la publicación y un email válido del editor.',
    byokTitle: 'Impúlsalo con tu propia cuenta de IA',
    byokBody: 'Pagas directamente a tu proveedor de IA — aprox. $0.03 por generación con Claude, menos con OpenAI. Tu clave se usa solo para esta solicitud, nunca se guarda ni se registra.',
    byokProviderLabel: 'Proveedor de IA',
    byokKeyLabel: 'Tu API key',
    byokKeyRequired: 'Pega la API key de tu proveedor de IA para generar. Pagas al proveedor directamente por generación.',
    byokKeyInvalid: 'El proveedor rechazó tu API key. Revísala e inténtalo de nuevo.',
    byokLiveLabel: 'Disponible ahora',
    byokComingLabel: 'Próximamente',
    byokConnected: 'Conectado',
    byokSaveKey: 'Guardar esta clave en mi cuenta para la próxima vez',
    byokDisconnect: 'Desconectar',
    sections: { youtube: 'YouTube orgánico', linkedin: 'LinkedIn orgánico', press: 'Email de press release' },
    labels: {
      youtubeTitle: 'Título del video',
      youtubeDescription: 'Descripción del video',
      youtubeCommunityPost: 'Post de comunidad',
      linkedinCompanyPost: 'Post de página de empresa',
      linkedinFounderPost: 'Post del fundador',
      pressReleaseSubject: 'Asunto del email',
      pressReleaseBody: 'Cuerpo del email',
    },
  },
  pt: {
    formTitle: 'Descreva sua campanha em um único prompt',
    companyLabel: 'Nome da empresa ou marca',
    companyPlaceholder: 'ex. Acme Analytics',
    announcementLabel: 'O que você está anunciando ou promovendo?',
    announcementPlaceholder: 'ex. Lançamento do nosso novo dashboard de relatórios com IA para agências pequenas',
    audienceLabel: 'Público-alvo (opcional)',
    audiencePlaceholder: 'ex. Diretores de marketing em agências de médio porte',
    websiteLabel: 'Site ou link de CTA (opcional)',
    generate: 'Gerar ativos de campanha orgânica',
    generating: 'Gerando ativos de campanha…',
    resultsTitle: 'Seus ativos de campanha orgânica',
    copyBtn: 'Copiar',
    copied: 'Copiado',
    regenerate: 'Gerar novamente',
    genError: 'A geração falhou. Tente novamente em instantes.',
    requiredError: 'Informe o nome da empresa e o que você está anunciando.',
    dispatchTitle: 'Despachar este press release',
    dispatchBody: 'Coloque o press release na fila para envio real por e-mail. Ele passa primeiro pela revisão do owner — nada é enviado ao jornalista até ser aprovado no espaço de Marketing.',
    publicationLabel: 'Nome da publicação',
    publicationPlaceholder: 'ex. TechCrunch, jornal local de negócios',
    editorEmailLabel: 'E-mail do editor / jornalista',
    dispatchBtn: 'Colocar press release na fila de envio',
    dispatching: 'Colocando na fila para aprovação…',
    dispatchQueued: 'Na fila. O press release fica bloqueado para aprovação do owner e será enviado por e-mail ao jornalista após aprovação.',
    dispatchError: 'Não foi possível colocar o press release na fila. Tente novamente.',
    emailInvalid: 'Informe o nome da publicação e um e-mail válido do editor.',
    byokTitle: 'Use sua própria conta de IA',
    byokBody: 'Você paga diretamente ao seu provedor de IA — cerca de US$ 0,03 por geração com Claude, menos com OpenAI. Sua chave é usada apenas nesta solicitação, nunca é armazenada nem registrada.',
    byokProviderLabel: 'Provedor de IA',
    byokKeyLabel: 'Sua API key',
    byokKeyRequired: 'Cole a API key do seu provedor de IA para gerar. Você paga o provedor diretamente por geração.',
    byokKeyInvalid: 'O provedor rejeitou sua API key. Verifique e tente novamente.',
    byokLiveLabel: 'Disponível agora',
    byokComingLabel: 'Em breve',
    byokConnected: 'Conectado',
    byokSaveKey: 'Salvar esta chave na minha conta para a próxima vez',
    byokDisconnect: 'Desconectar',
    sections: { youtube: 'YouTube orgânico', linkedin: 'LinkedIn orgânico', press: 'E-mail de press release' },
    labels: {
      youtubeTitle: 'Título do vídeo',
      youtubeDescription: 'Descrição do vídeo',
      youtubeCommunityPost: 'Post de comunidade',
      linkedinCompanyPost: 'Post da página da empresa',
      linkedinFounderPost: 'Post do fundador',
      pressReleaseSubject: 'Assunto do e-mail',
      pressReleaseBody: 'Corpo do e-mail',
    },
  },
  pl: {
    formTitle: 'Opisz swoją kampanię jednym promptem',
    companyLabel: 'Nazwa firmy lub marki',
    companyPlaceholder: 'np. Acme Analytics',
    announcementLabel: 'Co ogłaszasz lub promujesz?',
    announcementPlaceholder: 'np. Premiera naszego nowego dashboardu raportów AI dla małych agencji',
    audienceLabel: 'Grupa docelowa (opcjonalnie)',
    audiencePlaceholder: 'np. Dyrektorzy marketingu w średnich agencjach',
    websiteLabel: 'Strona lub link CTA (opcjonalnie)',
    generate: 'Wygeneruj materiały kampanii organicznej',
    generating: 'Generowanie materiałów kampanii…',
    resultsTitle: 'Twoje materiały kampanii organicznej',
    copyBtn: 'Kopiuj',
    copied: 'Skopiowano',
    regenerate: 'Wygeneruj ponownie',
    genError: 'Generowanie nie powiodło się. Spróbuj ponownie za chwilę.',
    requiredError: 'Podaj nazwę firmy i co ogłaszasz.',
    dispatchTitle: 'Wyślij ten press release',
    dispatchBody: 'Dodaj press release do kolejki prawdziwej wysyłki e-mail. Najpierw trafia do przeglądu ownera — nic nie jest wysyłane do dziennikarza do czasu akceptacji w przestrzeni Marketing.',
    publicationLabel: 'Nazwa publikacji',
    publicationPlaceholder: 'np. TechCrunch, lokalny dziennik biznesowy',
    editorEmailLabel: 'E-mail redaktora / dziennikarza',
    dispatchBtn: 'Dodaj press release do kolejki wysyłki',
    dispatching: 'Dodawanie do kolejki akceptacji…',
    dispatchQueued: 'W kolejce. Press release jest zablokowany do akceptacji ownera i zostanie wysłany e-mailem do dziennikarza po zatwierdzeniu.',
    dispatchError: 'Nie udało się dodać press release do kolejki. Spróbuj ponownie.',
    emailInvalid: 'Podaj nazwę publikacji i prawidłowy e-mail redaktora.',
    byokTitle: 'Zasil to własnym kontem AI',
    byokBody: 'Płacisz bezpośrednio swojemu dostawcy AI — ok. 0,03 USD za generację z Claude, mniej z OpenAI. Twój klucz jest używany tylko dla tego żądania, nigdy nie jest zapisywany ani logowany.',
    byokProviderLabel: 'Dostawca AI',
    byokKeyLabel: 'Twój klucz API',
    byokKeyRequired: 'Wklej klucz API swojego dostawcy AI, aby generować. Płacisz dostawcy bezpośrednio za generację.',
    byokKeyInvalid: 'Dostawca odrzucił Twój klucz API. Sprawdź go i spróbuj ponownie.',
    byokLiveLabel: 'Dostępne teraz',
    byokComingLabel: 'Wkrótce',
    byokConnected: 'Połączono',
    byokSaveKey: 'Zapisz ten klucz na moim koncie na przyszłość',
    byokDisconnect: 'Odłącz',
    sections: { youtube: 'YouTube organicznie', linkedin: 'LinkedIn organicznie', press: 'E-mail press release' },
    labels: {
      youtubeTitle: 'Tytuł wideo',
      youtubeDescription: 'Opis wideo',
      youtubeCommunityPost: 'Post społeczności',
      linkedinCompanyPost: 'Post strony firmowej',
      linkedinFounderPost: 'Post założyciela',
      pressReleaseSubject: 'Temat e-maila',
      pressReleaseBody: 'Treść e-maila',
    },
  },
  ru: {
    formTitle: 'Опишите вашу кампанию одним промптом',
    companyLabel: 'Название компании или бренда',
    companyPlaceholder: 'напр. Acme Analytics',
    announcementLabel: 'Что вы анонсируете или продвигаете?',
    announcementPlaceholder: 'напр. Запуск нового AI-дашборда отчетов для небольших агентств',
    audienceLabel: 'Целевая аудитория (необязательно)',
    audiencePlaceholder: 'напр. Директора по маркетингу в средних агентствах',
    websiteLabel: 'Сайт или CTA-ссылка (необязательно)',
    generate: 'Сгенерировать материалы organic-кампании',
    generating: 'Генерация материалов кампании…',
    resultsTitle: 'Ваши материалы organic-кампании',
    copyBtn: 'Копировать',
    copied: 'Скопировано',
    regenerate: 'Сгенерировать заново',
    genError: 'Генерация не удалась. Попробуйте снова через минуту.',
    requiredError: 'Укажите название компании и что вы анонсируете.',
    dispatchTitle: 'Отправить этот press release',
    dispatchBody: 'Поставьте press release в очередь на реальную e-mail-отправку. Сначала он проходит проверку owner — журналисту ничего не отправляется до одобрения в Marketing workspace.',
    publicationLabel: 'Название издания',
    publicationPlaceholder: 'напр. TechCrunch, местный деловой журнал',
    editorEmailLabel: 'E-mail редактора / журналиста',
    dispatchBtn: 'Поставить press release в очередь отправки',
    dispatching: 'Постановка в очередь на одобрение…',
    dispatchQueued: 'В очереди. Press release заблокирован до одобрения owner и будет отправлен журналисту по e-mail после утверждения.',
    dispatchError: 'Не удалось поставить press release в очередь. Попробуйте снова.',
    emailInvalid: 'Укажите название издания и корректный e-mail редактора.',
    byokTitle: 'Работает с вашим собственным AI-аккаунтом',
    byokBody: 'Вы платите AI-провайдеру напрямую — около $0.03 за генерацию с Claude, меньше с OpenAI. Ключ используется только для этого запроса, никогда не сохраняется и не логируется.',
    byokProviderLabel: 'AI-провайдер',
    byokKeyLabel: 'Ваш API-ключ',
    byokKeyRequired: 'Вставьте API-ключ вашего AI-провайдера для генерации. Вы платите провайдеру напрямую за каждую генерацию.',
    byokKeyInvalid: 'Провайдер отклонил ваш API-ключ. Проверьте его и попробуйте снова.',
    byokLiveLabel: 'Доступно сейчас',
    byokComingLabel: 'Скоро',
    byokConnected: 'Подключено',
    byokSaveKey: 'Сохранить этот ключ в моем аккаунте на будущее',
    byokDisconnect: 'Отключить',
    sections: { youtube: 'YouTube organic', linkedin: 'LinkedIn organic', press: 'Press release e-mail' },
    labels: {
      youtubeTitle: 'Название видео',
      youtubeDescription: 'Описание видео',
      youtubeCommunityPost: 'Пост сообщества',
      linkedinCompanyPost: 'Пост страницы компании',
      linkedinFounderPost: 'Пост основателя',
      pressReleaseSubject: 'Тема письма',
      pressReleaseBody: 'Текст письма',
    },
  },
}

const LIVE_PROVIDERS = ['Claude (Anthropic)', 'OpenAI']

const chipStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.16)',
  borderRadius: 999,
  padding: '5px 12px',
  fontSize: 12,
  color: 'rgba(255,255,255,.85)',
  background: 'rgba(255,255,255,.06)',
}

const formatUsd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

const fieldStyle: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,.18)',
  background: 'rgba(255,255,255,.08)',
  color: '#fff',
  padding: '12px 14px',
  fontFamily: 'inherit',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

function hasEnterpriseAccess(tenantProfile?: TenantCampaignProfile) {
  return Boolean(tenantProfile?.sponsoredEnterprise || tenantProfile?.corporateSponsored || tenantProfile?.plan === 'enterprise')
}

function AssetBlock({ label, value, copyBtn, copied }: { label: string; value: string; copyBtn: string; copied: string }) {
  const [done, setDone] = useState(false)

  async function copyText() {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <h4 className="sb-h3" style={{ margin: 0, fontSize: 15 }}>{label}</h4>
        <button
          type="button"
          className="sb-button-secondary"
          onClick={copyText}
          style={{ padding: '6px 14px', fontSize: 12, color: done ? '#86efac' : undefined }}
        >
          {done ? copied : copyBtn}
        </button>
      </div>
      <p className="sb-body" style={{ margin: 0, fontSize: 13, whiteSpace: 'pre-wrap' }}>{value}</p>
    </article>
  )
}

export default function PublicAgencyClient({ copy, tenantProfile }: PublicAgencyClientProps) {
  const { lang } = useI18n()
  const oc = ORGANIC_COPY[lang] || ORGANIC_COPY.en

  const [selectedBudget, setSelectedBudget] = useState('5000')
  const [mode, setMode] = useState<Mode>('download')
  const [consent, setConsent] = useState(false)
  const [summary, setSummary] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [apiProvider, setApiProvider] = useState<'anthropic' | 'openai'>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [saveKey, setSaveKey] = useState(false)
  const [signedIn, setSignedIn] = useState(false)
  const [connectedProviders, setConnectedProviders] = useState<string[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/agency/provider-keys', { cache: 'no-store' })
        const json = await res.json().catch(() => null)
        if (!live || !json) return
        setSignedIn(Boolean(json.signedIn))
        const list = Array.isArray(json.connected) ? json.connected.map((c: any) => String(c.provider)) : []
        setConnectedProviders(list)
      } catch {
        // vault unavailable — pasted-key flow still works
      }
    })()
    return () => { live = false }
  }, [])

  const providerConnected = connectedProviders.includes(apiProvider)

  const [company, setCompany] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [audience, setAudience] = useState('')
  const [website, setWebsite] = useState('')
  const [organicLoading, setOrganicLoading] = useState(false)
  const [organicError, setOrganicError] = useState('')
  const [assets, setAssets] = useState<OrganicAssets | null>(null)

  const [publication, setPublication] = useState('')
  const [editorEmail, setEditorEmail] = useState('')
  const [dispatchLoading, setDispatchLoading] = useState(false)
  const [dispatchError, setDispatchError] = useState('')
  const [dispatchQueued, setDispatchQueued] = useState(false)

  const enterpriseEnabled = ENTERPRISE_READY && hasEnterpriseAccess(tenantProfile)
  const channelMode: ChannelMode = enterpriseEnabled ? 'PROGRAMMATIC_ENTERPRISE' : 'FREE_ORGANIC_MODE'
  const organicChannels = Object.values(copy.organicChannels)
  const enterpriseChannels = Object.values(copy.enterpriseChannels)

  async function generateOrganic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setOrganicError('')

    if (!providerConnected && apiKey.trim().length < 20) {
      setOrganicError(oc.byokKeyRequired)
      return
    }

    if (!company.trim() || !announcement.trim()) {
      setOrganicError(oc.requiredError)
      return
    }

    setOrganicLoading(true)
    setAssets(null)
    setDispatchQueued(false)
    setDispatchError('')

    try {
      const response = await fetch('/api/agency/organic-workflow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ company, announcement, audience, website, lang, apiProvider, apiKey: providerConnected && !apiKey.trim() ? undefined : apiKey.trim() }),
      })

      const data = await response.json().catch(() => null) as OrganicResponse | null

      if (!response.ok || !data || !data.ok || !data.assets) {
        const code = (data as any)?.error_code
        if (code === 'missing_key') setOrganicError(oc.byokKeyRequired)
        else if (code === 'invalid_key') setOrganicError(oc.byokKeyInvalid)
        else setOrganicError(oc.genError)
        setOrganicLoading(false)
        return
      }

      setAssets(data.assets)

      if (saveKey && signedIn && apiKey.trim().length >= 20) {
        try {
          const saved = await fetch('/api/agency/provider-keys', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ provider: apiProvider, value: apiKey.trim() }),
          })
          if (saved.ok) {
            setConnectedProviders((current) => (current.includes(apiProvider) ? current : [...current, apiProvider]))
            setApiKey('')
          }
        } catch {
          // saving is best-effort; generation already succeeded
        }
      }
    } catch {
      setOrganicError(oc.genError)
    }

    setOrganicLoading(false)
  }

  async function queuePressDispatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDispatchError('')

    if (!assets) return
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(editorEmail.trim())
    if (!publication.trim() || !emailOk) {
      setDispatchError(oc.emailInvalid)
      return
    }

    setDispatchLoading(true)
    try {
      const response = await fetch('/api/agency/press-dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          created_by_role: 'staff',
          source: 'public_agency_page',
          channel: 'online-newspapers',
          publication_name: publication.trim(),
          editor_contact: editorEmail.trim(),
          headline: assets.pressReleaseSubject,
          article_notes: assets.pressReleaseBody,
          cta_url: website.trim() || undefined,
          force_owner_review: true,
        }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.campaign) {
        setDispatchError(String(data?.error || oc.dispatchError))
        setDispatchLoading(false)
        return
      }

      setDispatchQueued(true)
    } catch {
      setDispatchError(oc.dispatchError)
    }

    setDispatchLoading(false)
  }

  async function requestCheckout(createStripeSession: boolean) {
    if (!enterpriseEnabled) {
      setError(copy.error)
      return
    }

    setLoading(true)
    setError('')
    setSummary(null)

    const budget = Number(selectedBudget)
    if (!Number.isFinite(budget) || budget <= 0 || (mode === 'managed' && !consent)) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const response = await fetch('/api/agency/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ selectedBudget: budget, createStripeSession, mode, enterpriseReady: enterpriseEnabled, channelMode }),
    })

    if (!response.ok) {
      setError(copy.error)
      setLoading(false)
      return
    }

    const data = await response.json() as CheckoutResponse
    setSummary(data)
    setLoading(false)

    if (createStripeSession && data.stripeCheckoutUrl) {
      window.location.href = data.stripeCheckoutUrl
    }
  }

  return (
    <section className="sb-page-shell sb-section" aria-label={copy.title} data-channel-mode={channelMode}>
      <div className="fathom-glass sb-glass" style={{ padding: 28, display: 'grid', gap: 18 }}>
        <div>
          <div className="sb-cta-row" style={{ marginBottom: 12 }}>
            <span className="sb-eyebrow">{copy.freeModeBadge}</span>
            <span className="sb-caption" style={{ color: enterpriseEnabled ? '#86efac' : '#fbbf24' }}>{copy.enterpriseReadyBadge}</span>
          </div>
          <h2 className="sb-h2">{copy.title}</h2>
          <p className="sb-body" style={{ maxWidth: 820 }}>{copy.body}</p>
        </div>

        <section className="sb-card" style={{ padding: 20 }}>
          <span className="sb-eyebrow">{copy.organicModeTitle}</span>
          <p className="sb-body">{copy.organicModeBody}</p>
          <h3 className="sb-h3">{copy.organicChannelsTitle}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {organicChannels.map((channel) => (
              <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
              </article>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.hmiApprovalTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.hmiApprovalBody}</p>
            </article>
            <article style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
              <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{copy.marketingAlertsTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{copy.marketingAlertsBody}</p>
            </article>
          </div>

          <form onSubmit={generateOrganic} style={{ display: 'grid', gap: 12, marginTop: 18, maxWidth: 720 }}>
            <h3 className="sb-h3" style={{ margin: 0 }}>{oc.formTitle}</h3>

            <div style={{ border: '1px solid rgba(251,191,36,.3)', borderRadius: 16, padding: 14, display: 'grid', gap: 10 }}>
              <h4 className="sb-h3" style={{ margin: 0, fontSize: 15 }}>{oc.byokTitle}</h4>
              <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{oc.byokBody}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="sb-caption" style={{ color: '#86efac' }}>{oc.byokLiveLabel}</span>
                {LIVE_PROVIDERS.map((name) => (
                  <span key={name} style={{ ...chipStyle, borderColor: 'rgba(134,239,172,.4)' }}>{name}</span>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) 1fr', gap: 12 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="sb-caption">{oc.byokProviderLabel}</span>
                  <select value={apiProvider} onChange={(e) => setApiProvider(e.target.value === 'openai' ? 'openai' : 'anthropic')} style={fieldStyle}>
                    <option value="anthropic">{"Claude (Anthropic)"}</option>
                    <option value="openai">OpenAI</option>
                  </select>
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span className="sb-caption">{oc.byokKeyLabel}{providerConnected ? <span style={{ color: '#86efac', marginLeft: 8 }}>✓ {oc.byokConnected}</span> : null}</span>
                  <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={providerConnected ? '✓ ' + oc.byokConnected : (apiProvider === 'openai' ? 'sk-…' : 'sk-ant-…')} maxLength={400} style={fieldStyle} />
                </label>
              </div>
              {signedIn && !providerConnected ? (
                <label className="sb-caption" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
                  <span>{oc.byokSaveKey}</span>
                </label>
              ) : null}
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="sb-caption">{oc.companyLabel}</span>
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder={oc.companyPlaceholder} maxLength={120} style={fieldStyle} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="sb-caption">{oc.announcementLabel}</span>
              <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder={oc.announcementPlaceholder} maxLength={1200} rows={3} style={{ ...fieldStyle, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="sb-caption">{oc.audienceLabel}</span>
                <input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder={oc.audiencePlaceholder} maxLength={300} style={fieldStyle} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span className="sb-caption">{oc.websiteLabel}</span>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" maxLength={200} style={fieldStyle} />
              </label>
            </div>
            <div className="sb-cta-row">
              <button className="sb-button-primary" type="submit" disabled={organicLoading}>
                {organicLoading ? oc.generating : (assets ? oc.regenerate : oc.generate)}
              </button>
            </div>
            {organicError ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{organicError}</p> : null}
          </form>

          {assets ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
              <h3 className="sb-h3" style={{ margin: 0, color: '#86efac' }}>{oc.resultsTitle}</h3>

              <span className="sb-eyebrow">{oc.sections.youtube}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.youtubeTitle} value={assets.youtubeTitle} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.youtubeDescription} value={assets.youtubeDescription} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.youtubeCommunityPost} value={assets.youtubeCommunityPost} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <span className="sb-eyebrow">{oc.sections.linkedin}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.linkedinCompanyPost} value={assets.linkedinCompanyPost} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.linkedinFounderPost} value={assets.linkedinFounderPost} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <span className="sb-eyebrow">{oc.sections.press}</span>
              <div style={{ display: 'grid', gap: 12 }}>
                <AssetBlock label={oc.labels.pressReleaseSubject} value={assets.pressReleaseSubject} copyBtn={oc.copyBtn} copied={oc.copied} />
                <AssetBlock label={oc.labels.pressReleaseBody} value={assets.pressReleaseBody} copyBtn={oc.copyBtn} copied={oc.copied} />
              </div>

              <div style={{ border: '1px solid rgba(26,240,255,.25)', borderRadius: 16, padding: 16, marginTop: 4 }}>
                <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{oc.dispatchTitle}</h4>
                <p className="sb-body" style={{ margin: '0 0 12px', fontSize: 13 }}>{oc.dispatchBody}</p>
                {dispatchQueued ? (
                  <p className="sb-body" style={{ color: '#86efac', margin: 0 }}>{oc.dispatchQueued}</p>
                ) : (
                  <form onSubmit={queuePressDispatch} style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="sb-caption">{oc.publicationLabel}</span>
                        <input value={publication} onChange={(e) => setPublication(e.target.value)} placeholder={oc.publicationPlaceholder} maxLength={140} style={fieldStyle} />
                      </label>
                      <label style={{ display: 'grid', gap: 6 }}>
                        <span className="sb-caption">{oc.editorEmailLabel}</span>
                        <input value={editorEmail} onChange={(e) => setEditorEmail(e.target.value)} placeholder="editor@publication.com" maxLength={200} style={fieldStyle} />
                      </label>
                    </div>
                    <div className="sb-cta-row">
                      <button className="sb-button-primary" type="submit" disabled={dispatchLoading}>
                        {dispatchLoading ? oc.dispatching : oc.dispatchBtn}
                      </button>
                    </div>
                    {dispatchError ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{dispatchError}</p> : null}
                  </form>
                )}
              </div>
            </div>
          ) : null}
        </section>

        {enterpriseEnabled ? (
          <section className="sb-card" style={{ padding: 20 }}>
            <span className="sb-eyebrow">{copy.enterpriseModeTitle}</span>
            <p className="sb-body">{copy.enterpriseModeBody}</p>
            <h3 className="sb-h3">{copy.enterpriseChannelsTitle}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
              {enterpriseChannels.map((channel) => (
                <article key={channel.label} style={{ border: '1px solid rgba(255,255,255,.08)', borderRadius: 16, padding: 14 }}>
                  <h4 className="sb-h3" style={{ margin: '0 0 6px', fontSize: 15 }}>{channel.label}</h4>
                  <p className="sb-body" style={{ margin: 0, fontSize: 13 }}>{channel.description}</p>
                </article>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
              <span className="sb-caption">{copy.modeLabel}</span>
              <div className="sb-cta-row">
                <button type="button" className={mode === 'download' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('download')}>{copy.downloadMode}</button>
                <button type="button" className={mode === 'managed' ? 'sb-button-primary' : 'sb-button-secondary'} onClick={() => setMode('managed')}>{copy.publishMode}</button>
              </div>
            </div>

            <form onSubmit={(event) => { event.preventDefault(); requestCheckout(false) }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', marginTop: 14 }}>
              <label style={{ display: 'grid', gap: 8, minWidth: 240 }}>
                <span className="sb-caption">{copy.budgetLabel}</span>
                <input
                  value={selectedBudget}
                  onChange={(event) => setSelectedBudget(event.target.value)}
                  type="number"
                  min="1"
                  step="0.01"
                  style={{ borderRadius: 14, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.08)', color: '#fff', padding: '12px 14px' }}
                />
              </label>
              <button className="sb-button-primary" type="submit" disabled={loading}>{copy.submit}</button>
            </form>

            {mode === 'managed' ? (
              <label className="sb-body" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 0 0' }}>
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{copy.consentLabel}</span>
              </label>
            ) : null}
          </section>
        ) : (
          <section className="sb-card" style={{ padding: 20, borderColor: 'rgba(251,191,36,.28)' }}>
            <span className="sb-eyebrow">{copy.enterpriseReadyBadge}</span>
            <h3 className="sb-h3">{copy.enterpriseLockedTitle}</h3>
            <p className="sb-body" style={{ margin: 0 }}>{copy.enterpriseLockedBody}</p>
          </section>
        )}

        {error ? <p className="sb-body" style={{ color: '#fca5a5', margin: 0 }}>{error}</p> : null}
        {summary ? (
          <div className="sb-card" style={{ padding: 20 }}>
            <h3 className="sb-h3">{copy.summaryTitle}</h3>
            <p className="sb-body">{summary.status === 'STRIPE_CHECKOUT_READY' ? copy.paymentReady : copy.ready}</p>
            <p className="sb-caption">{copy.noBrokerDispatch}</p>
            {!summary.stripeConfigured ? <p className="sb-caption">{copy.stripeUnavailable}</p> : null}
            <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, margin: 0 }}>
              <div><dt className="sb-caption">{copy.selectedBudget}</dt><dd>{formatUsd(summary.selectedBudget)}</dd></div>
              <div><dt className="sb-caption">{copy.processingFee}</dt><dd>{formatUsd(summary.processingFee)}</dd></div>
              <div><dt className="sb-caption">{copy.totalCharged}</dt><dd>{formatUsd(summary.totalCharged)}</dd></div>
            </dl>
            {enterpriseEnabled && mode === 'managed' ? <button className="sb-button-secondary" type="button" disabled={loading || !consent} onClick={() => requestCheckout(true)} style={{ marginTop: 16 }}>{copy.paymentSubmit}</button> : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
