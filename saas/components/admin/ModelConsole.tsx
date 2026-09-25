'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Certification = {
  certificationId: string
  occurredAt?: string
  completedAt?: string
  status?: 'passed' | 'partial' | 'failed'
  transportProtocol?: string
  checks?: Array<{ id: string; status: string; latencyMs: number; errorCode: string | null }>
  unverifiedDeclaredCapabilities?: string[]
}
type Profile = {
  key: string
  family: string
  modelId: string
  providerModelId: string
  revision: string | null
  revisionPolicy: string
  uses: string[]
  transportProtocols: string[]
  inference: Record<string, string>
  training: Record<string, string>
  binding: null | {
    provider: string
    protocol: string
    endpoint: string | null
    credentialEnv: string | null
    credentialConfigured: boolean
    apiVersion: string | null
    timeoutMs: number
  }
  builtInAdapterAvailable: boolean
  certifiable: boolean
  latestCertification: Certification | null
}
type Inventory = {
  ok: boolean
  registryStrictMode: boolean
  profiles: Profile[]
  certificationReceipts: Certification[]
  config: {
    modelRegistryConfigured: boolean
    transportRegistryConfigured: boolean
    registrationSource: string
    secretsReturned: false
  }
  error?: string
}

type Locale = 'en' | 'es' | 'pt' | 'pl' | 'ru'
const COPY: Record<Locale, Record<string, string>> = {
  en: {
    eyebrow: 'Platform Models', title: 'Model & Provider Console',
    intro: 'Inspect registered models, transport bindings, declared capabilities, and durable certification evidence. Credentials and model outputs are never shown or stored here.',
    loading: 'Loading model inventory…', unavailable: 'Model inventory unavailable',
    strict: 'Strict registered-model routing', enabled: 'Enabled', disabled: 'Migration compatibility mode',
    registration: 'Registration source', serverConfig: 'Server configuration',
    registrationNote: 'Model registration is intentionally read-only in this phase. Add or change profiles through the governed server configuration; this Console never exposes provider secrets.',
    model: 'Model', family: 'Family', uses: 'Uses', transports: 'Transports',
    provider: 'Provider', credential: 'Credential', configured: 'configured', missing: 'missing',
    adapter: 'Built-in adapter', available: 'available', unavailableAdapter: 'host adapter required',
    latest: 'Latest certification', none: 'No certification receipt',
    certify: 'Run certification', running: 'Certifying…',
    spend: 'This performs bounded live provider calls and may incur provider charges.',
    checks: 'Checks', unverified: 'Declared capabilities not covered by this transport certification',
    capabilities: 'Inference capabilities', statusPassed: 'passed', statusPartial: 'partial', statusFailed: 'failed',
  },
  es: {
    eyebrow: 'Modelos de plataforma', title: 'Consola de modelos y proveedores',
    intro: 'Inspecciona modelos registrados, transportes, capacidades declaradas y evidencia durable de certificación. Las credenciales y salidas del modelo nunca se muestran ni almacenan aquí.',
    loading: 'Cargando inventario de modelos…', unavailable: 'Inventario de modelos no disponible',
    strict: 'Enrutamiento estricto de modelos registrados', enabled: 'Activado', disabled: 'Modo de compatibilidad de migración',
    registration: 'Origen del registro', serverConfig: 'Configuración del servidor',
    registrationNote: 'El registro de modelos es de solo lectura en esta fase. Añade o cambia perfiles mediante la configuración gobernada del servidor; esta consola nunca expone secretos del proveedor.',
    model: 'Modelo', family: 'Familia', uses: 'Usos', transports: 'Transportes',
    provider: 'Proveedor', credential: 'Credencial', configured: 'configurada', missing: 'ausente',
    adapter: 'Adaptador integrado', available: 'disponible', unavailableAdapter: 'se requiere adaptador del host',
    latest: 'Última certificación', none: 'Sin recibo de certificación',
    certify: 'Ejecutar certificación', running: 'Certificando…',
    spend: 'Esto realiza llamadas reales limitadas al proveedor y puede generar cargos.',
    checks: 'Pruebas', unverified: 'Capacidades declaradas no cubiertas por esta certificación de transporte',
    capabilities: 'Capacidades de inferencia', statusPassed: 'aprobada', statusPartial: 'parcial', statusFailed: 'fallida',
  },
  pt: {
    eyebrow: 'Modelos da plataforma', title: 'Console de modelos e provedores',
    intro: 'Inspecione modelos registrados, transportes, capacidades declaradas e evidência durável de certificação. Credenciais e saídas do modelo nunca são exibidas nem armazenadas aqui.',
    loading: 'Carregando inventário de modelos…', unavailable: 'Inventário de modelos indisponível',
    strict: 'Roteamento estrito de modelos registrados', enabled: 'Ativado', disabled: 'Modo de compatibilidade de migração',
    registration: 'Origem do registro', serverConfig: 'Configuração do servidor',
    registrationNote: 'O registro de modelos é somente leitura nesta fase. Adicione ou altere perfis pela configuração governada do servidor; este Console nunca expõe segredos do provedor.',
    model: 'Modelo', family: 'Família', uses: 'Usos', transports: 'Transportes',
    provider: 'Provedor', credential: 'Credencial', configured: 'configurada', missing: 'ausente',
    adapter: 'Adaptador integrado', available: 'disponível', unavailableAdapter: 'adaptador do host necessário',
    latest: 'Última certificação', none: 'Sem recibo de certificação',
    certify: 'Executar certificação', running: 'Certificando…',
    spend: 'Isto faz chamadas reais limitadas ao provedor e pode gerar cobranças.',
    checks: 'Verificações', unverified: 'Capacidades declaradas não cobertas por esta certificação de transporte',
    capabilities: 'Capacidades de inferência', statusPassed: 'aprovada', statusPartial: 'parcial', statusFailed: 'falhou',
  },
  pl: {
    eyebrow: 'Modele platformy', title: 'Konsola modeli i dostawców',
    intro: 'Przeglądaj zarejestrowane modele, powiązania transportowe, zadeklarowane możliwości i trwałe dowody certyfikacji. Dane uwierzytelniające i odpowiedzi modelu nie są tu wyświetlane ani zapisywane.',
    loading: 'Ładowanie modeli…', unavailable: 'Inwentarz modeli jest niedostępny',
    strict: 'Ścisłe routowanie zarejestrowanych modeli', enabled: 'Włączone', disabled: 'Tryb zgodności migracyjnej',
    registration: 'Źródło rejestracji', serverConfig: 'Konfiguracja serwera',
    registrationNote: 'Rejestracja modeli jest w tej fazie tylko do odczytu. Dodawaj lub zmieniaj profile przez kontrolowaną konfigurację serwera; ta konsola nigdy nie ujawnia sekretów dostawcy.',
    model: 'Model', family: 'Rodzina', uses: 'Zastosowania', transports: 'Transporty',
    provider: 'Dostawca', credential: 'Poświadczenie', configured: 'skonfigurowane', missing: 'brak',
    adapter: 'Wbudowany adapter', available: 'dostępny', unavailableAdapter: 'wymagany adapter hosta',
    latest: 'Ostatnia certyfikacja', none: 'Brak certyfikatu',
    certify: 'Uruchom certyfikację', running: 'Certyfikowanie…',
    spend: 'Powoduje ograniczone rzeczywiste wywołania dostawcy i może naliczyć opłaty.',
    checks: 'Kontrole', unverified: 'Zadeklarowane możliwości poza zakresem tej certyfikacji transportu',
    capabilities: 'Możliwości inferencji', statusPassed: 'zaliczona', statusPartial: 'częściowa', statusFailed: 'niezaliczona',
  },
  ru: {
    eyebrow: 'Модели платформы', title: 'Консоль моделей и провайдеров',
    intro: 'Просматривайте зарегистрированные модели, транспортные привязки, заявленные возможности и долговременные свидетельства сертификации. Учетные данные и ответы модели здесь не отображаются и не сохраняются.',
    loading: 'Загрузка списка моделей…', unavailable: 'Список моделей недоступен',
    strict: 'Строгая маршрутизация зарегистрированных моделей', enabled: 'Включена', disabled: 'Режим совместимости миграции',
    registration: 'Источник регистрации', serverConfig: 'Конфигурация сервера',
    registrationNote: 'На этом этапе регистрация моделей доступна только для чтения. Добавляйте и изменяйте профили через управляемую конфигурацию сервера; консоль никогда не раскрывает секреты провайдера.',
    model: 'Модель', family: 'Семейство', uses: 'Использование', transports: 'Транспорт',
    provider: 'Провайдер', credential: 'Учетные данные', configured: 'настроены', missing: 'отсутствуют',
    adapter: 'Встроенный адаптер', available: 'доступен', unavailableAdapter: 'требуется адаптер хоста',
    latest: 'Последняя сертификация', none: 'Нет сертификата',
    certify: 'Запустить сертификацию', running: 'Сертификация…',
    spend: 'Будут выполнены ограниченные реальные вызовы провайдера, которые могут быть платными.',
    checks: 'Проверки', unverified: 'Заявленные возможности вне этой транспортной сертификации',
    capabilities: 'Возможности инференса', statusPassed: 'пройдена', statusPartial: 'частичная', statusFailed: 'не пройдена',
  },
}

function localeOf(value: string): Locale {
  const code = value.toLowerCase().split('-')[0]
  return code === 'es' || code === 'pt' || code === 'pl' || code === 'ru' ? code : 'en'
}

function statusLabel(text: Record<string, string>, status?: string) {
  if (status === 'passed') return text.statusPassed
  if (status === 'partial') return text.statusPartial
  if (status === 'failed') return text.statusFailed
  return status || '—'
}

export default function ModelConsole() {
  const { lang } = useI18n()
  const text = useMemo(() => COPY[localeOf(lang)], [lang])
  const [data, setData] = useState<Inventory | null>(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState<string | null>(null)

  async function load() {
    setError('')
    const response = await fetch('/api/admin/models', { cache: 'no-store' })
    const body = await response.json() as Inventory
    if (!response.ok) throw new Error(body.error || 'model_inventory_load_failed')
    setData(body)
  }

  useEffect(() => { load().catch(reason => setError(reason instanceof Error ? reason.message : String(reason))) }, [])

  async function certify(profileKey: string) {
    setRunning(profileKey)
    setError('')
    try {
      const response = await fetch('/api/admin/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileKey, confirmSpend: true }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok && response.status !== 422) throw new Error(body.error || 'model_certification_failed')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRunning(null)
    }
  }

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', color: '#f8fafc' }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: '#67e8f9' }}>{text.eyebrow}</p>
        <h1 style={{ margin: '8px 0' }}>{text.title}</h1>
        <p style={{ maxWidth: 860, color: '#cbd5e1' }}>{text.intro}</p>
      </header>

      {error ? <section role="alert" style={{ border: '1px solid #fb7185', borderRadius: 12, padding: 16, marginBottom: 20 }}><strong>{text.unavailable}</strong><p>{error}</p></section> : null}
      {!data && !error ? <p>{text.loading}</p> : null}

      {data ? <>
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginBottom: 24 }}>
          <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
            <strong>{text.strict}</strong>
            <p>{data.registryStrictMode ? text.enabled : text.disabled}</p>
          </div>
          <div style={{ border: '1px solid #334155', borderRadius: 12, padding: 16 }}>
            <strong>{text.registration}</strong>
            <p>{text.serverConfig}</p>
          </div>
        </section>
        <p style={{ color: '#94a3b8', marginBottom: 24 }}>{text.registrationNote}</p>

        <section style={{ display: 'grid', gap: 18 }}>
          {data.profiles.map(profile => {
            const cert = profile.latestCertification
            return <article key={profile.key} style={{ border: '1px solid #334155', borderRadius: 14, padding: 20, background: 'rgba(15,23,42,.65)' }}>
              <div style={{ display: 'flex', gap: 16, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0 }}>{profile.key}</h2>
                  <p style={{ margin: '6px 0', color: '#cbd5e1' }}>{text.model}: {profile.modelId}</p>
                  <p style={{ margin: '6px 0', color: '#94a3b8' }}>{text.family}: {profile.family}</p>
                </div>
                <button
                  type="button"
                  disabled={!profile.certifiable || running === profile.key || (profile.binding?.credentialEnv ? !profile.binding.credentialConfigured : false)}
                  onClick={() => certify(profile.key)}
                  style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #22d3ee', background: 'transparent', color: '#f8fafc', cursor: 'pointer' }}
                >
                  {running === profile.key ? text.running : text.certify}
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginTop: 14 }}>
                <div><strong>{text.uses}</strong><p>{profile.uses.join(', ')}</p></div>
                <div><strong>{text.transports}</strong><p>{profile.transportProtocols.join(', ')}</p></div>
                <div><strong>{text.provider}</strong><p>{profile.binding?.provider || '—'} · {profile.binding?.protocol || '—'}</p></div>
                <div><strong>{text.credential}</strong><p>{profile.binding?.credentialEnv ? `${profile.binding.credentialEnv}: ${profile.binding.credentialConfigured ? text.configured : text.missing}` : '—'}</p></div>
                <div><strong>{text.adapter}</strong><p>{profile.builtInAdapterAvailable ? text.available : text.unavailableAdapter}</p></div>
                <div><strong>{text.latest}</strong><p>{cert ? statusLabel(text, cert.status) : text.none}</p></div>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary>{text.capabilities}</summary>
                <ul>{Object.entries(profile.inference).map(([name, state]) => <li key={name}>{name}: {state}</li>)}</ul>
              </details>

              {cert ? <div style={{ marginTop: 14, borderTop: '1px solid #334155', paddingTop: 14 }}>
                <strong>{text.checks}</strong>
                <ul>{(cert.checks || []).map(item => <li key={item.id}>{item.id}: {item.status} · {item.latencyMs} ms{item.errorCode ? ` · ${item.errorCode}` : ''}</li>)}</ul>
                {cert.unverifiedDeclaredCapabilities?.length ? <p><strong>{text.unverified}:</strong> {cert.unverifiedDeclaredCapabilities.join(', ')}</p> : null}
              </div> : null}

              {profile.certifiable ? <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 0 }}>{text.spend}</p> : null}
            </article>
          })}
        </section>
      </> : null}
    </main>
  )
}
