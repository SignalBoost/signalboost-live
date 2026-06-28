import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { readCosFlags } from '@/lib/cos'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

export const metadata: Metadata = {
  title: 'COS Preview · SignalBoost',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

const COPY: Record<Lang, {
  eyebrow: string
  title: string
  subtitle: string
  statusTitle: string
  privateMode: string
  customerReady: string
  indexed: string
  nextTitle: string
  nextItems: string[]
}> = {
  en: {
    eyebrow: 'Private COS preview',
    title: 'COS operating brain',
    subtitle: 'Internal owner/admin shell for the approval-first COS model. This route is not public and is blocked from indexing.',
    statusTitle: 'Visibility status',
    privateMode: 'Admin preview is enabled',
    customerReady: 'Customer-ready public exposure is disabled',
    indexed: 'Search indexing is disabled',
    nextTitle: 'Next build steps',
    nextItems: ['Insight Inbox', 'Marketing draft preview', 'Sales follow-up plan', 'Approval Center', 'Telemetry and credit usage'],
  },
  es: {
    eyebrow: 'Vista privada de COS',
    title: 'Cerebro operativo COS',
    subtitle: 'Shell interno para owner/admin del modelo COS con aprobación primero. Esta ruta no es pública y no se indexa.',
    statusTitle: 'Estado de visibilidad',
    privateMode: 'La vista admin está habilitada',
    customerReady: 'La exposición pública para clientes está deshabilitada',
    indexed: 'La indexación de búsqueda está deshabilitada',
    nextTitle: 'Próximos pasos de construcción',
    nextItems: ['Inbox de insights', 'Vista de borradores de marketing', 'Plan de seguimiento de ventas', 'Centro de aprobación', 'Telemetría y uso de créditos'],
  },
  pt: {
    eyebrow: 'Prévia privada do COS',
    title: 'Cérebro operacional COS',
    subtitle: 'Shell interno para owner/admin do modelo COS com aprovação primeiro. Esta rota não é pública e não é indexada.',
    statusTitle: 'Status de visibilidade',
    privateMode: 'A prévia admin está habilitada',
    customerReady: 'A exposição pública para clientes está desabilitada',
    indexed: 'A indexação de busca está desabilitada',
    nextTitle: 'Próximos passos de construção',
    nextItems: ['Inbox de insights', 'Prévia de rascunhos de marketing', 'Plano de follow-up de vendas', 'Centro de aprovação', 'Telemetria e uso de créditos'],
  },
  pl: {
    eyebrow: 'Prywatny podgląd COS',
    title: 'Mózg operacyjny COS',
    subtitle: 'Wewnętrzny shell owner/admin dla modelu COS z akceptacją jako pierwszym krokiem. Ta trasa nie jest publiczna i nie jest indeksowana.',
    statusTitle: 'Status widoczności',
    privateMode: 'Podgląd admin jest włączony',
    customerReady: 'Publiczna ekspozycja dla klientów jest wyłączona',
    indexed: 'Indeksowanie w wyszukiwarce jest wyłączone',
    nextTitle: 'Następne kroki budowy',
    nextItems: ['Inbox insightów', 'Podgląd draftów marketingowych', 'Plan follow-up sprzedaży', 'Centrum akceptacji', 'Telemetria i użycie kredytów'],
  },
  ru: {
    eyebrow: 'Приватный preview COS',
    title: 'Операционный мозг COS',
    subtitle: 'Внутренний shell для owner/admin модели COS с approval-first подходом. Этот маршрут не является публичным и не индексируется.',
    statusTitle: 'Статус видимости',
    privateMode: 'Admin preview включён',
    customerReady: 'Публичный доступ для клиентов отключён',
    indexed: 'Индексация поиска отключена',
    nextTitle: 'Следующие этапы сборки',
    nextItems: ['Inbox insights', 'Preview marketing drafts', 'План sales follow-up', 'Approval Center', 'Telemetry and credit usage'],
  },
}

function activeLang(value?: string | null): Lang {
  const normalized = String(value || 'en').toLowerCase().split('-')[0]
  return (['en', 'es', 'pt', 'pl', 'ru'].includes(normalized) ? normalized : 'en') as Lang
}

export default async function CosAdminPreviewPage() {
  const flags = readCosFlags()

  if (!flags.adminPreview) notFound()

  const cookieStore = await cookies()
  const lang = activeLang(cookieStore.get('signalboost_language')?.value)
  const copy = COPY[lang]

  return (
    <main style={{ minHeight: '100vh', padding: 24, color: '#f8fafc' }}>
      <section style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 24 }}>
        <div style={{ border: '1px solid rgba(255,255,255,.12)', borderRadius: 28, padding: 28, background: 'linear-gradient(135deg, rgba(26,240,255,.10), rgba(255,255,255,.035))' }}>
          <p style={{ margin: 0, color: '#1af0ff', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.22em' }}>{copy.eyebrow}</p>
          <h1 style={{ margin: '14px 0 0', fontSize: 'clamp(2.2rem, 5vw, 4.2rem)', lineHeight: 1, fontWeight: 950 }}>{copy.title}</h1>
          <p style={{ margin: '18px 0 0', color: 'rgba(226,232,240,.78)', maxWidth: 780, lineHeight: 1.7 }}>{copy.subtitle}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <section style={cardStyle}>
            <h2 style={cardTitleStyle}>{copy.statusTitle}</h2>
            <ul style={listStyle}>
              <li>{copy.privateMode}</li>
              <li>{copy.customerReady}</li>
              <li>{copy.indexed}</li>
            </ul>
          </section>

          <section style={cardStyle}>
            <h2 style={cardTitleStyle}>{copy.nextTitle}</h2>
            <ul style={listStyle}>
              {copy.nextItems.map(item => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </div>
      </section>
    </main>
  )
}

const cardStyle = {
  border: '1px solid rgba(255,255,255,.10)',
  borderRadius: 22,
  padding: 22,
  background: 'rgba(15,23,42,.58)',
} as const

const cardTitleStyle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 900,
} as const

const listStyle = {
  margin: '14px 0 0',
  paddingLeft: 20,
  color: 'rgba(226,232,240,.78)',
  lineHeight: 1.8,
} as const
