'use client'

import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@/components/i18n/I18nProvider'

type Connection = {
  schemaVersion: string
  tenantId: string
  environmentId: string
  connectionId: string
  providerId: string
  state: string
  authentication: { method: string; configured: boolean; maskedFields: Record<string, string> }
  updatedAt: string
}

type StatusSurface = {
  schemaVersion: string
  mode: 'self_service' | 'enterprise_admin'
  connection: Connection | null
  allowedActions: readonly string[]
  notices: readonly string[]
}

type Locale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type LocalizedCopy = {
  title: string
  notice: string
  unavailable: string
  loadError: string
  loading: string
  section: string
  none: string
  state: string
  auth: string
  configured: string
  yes: string
  no: string
  tenant: string
  environment: string
  id: string
  updated: string
  noMetadata: string
  fields: string
  actions: string
  notices: string
  actionLabels: Readonly<Record<string, string>>
  noticeLabels: Readonly<Record<string, string>>
}

const LOCALIZED_LOAD_ERROR = '__localized_provider_hub_load_error__'

const copy: Readonly<Record<Locale, LocalizedCopy>> = {
  en: { title: 'Your provider connections', notice: 'This dashboard is read-only. It never reveals, copies, decrypts, or returns provider credentials.', unavailable: 'Status unavailable', loadError: 'Unable to load Provider Hub status.', loading: 'Loading connection status…', section: 'Provider connection status', none: 'No provider configured', state: 'Connection state', auth: 'Authentication', configured: 'Credentials configured', yes: 'Yes', no: 'No', tenant: 'Tenant', environment: 'Environment', id: 'Connection ID', updated: 'Updated', noMetadata: 'No connection metadata is available for this authenticated scope.', fields: 'Configured fields', actions: 'Available actions', notices: 'Notices', actionLabels: { view: 'View', manual_setup: 'Manual setup' }, noticeLabels: { 'No provider connection is configured.': 'No provider connection is configured.' } },
  es: { title: 'Tus conexiones de proveedores', notice: 'Este panel es de solo lectura. Nunca revela, copia, descifra ni devuelve credenciales de proveedores.', unavailable: 'Estado no disponible', loadError: 'No se pudo cargar el estado de Provider Hub.', loading: 'Cargando el estado de la conexión…', section: 'Estado de conexión del proveedor', none: 'Ningún proveedor configurado', state: 'Estado de la conexión', auth: 'Autenticación', configured: 'Credenciales configuradas', yes: 'Sí', no: 'No', tenant: 'Inquilino', environment: 'Entorno', id: 'ID de conexión', updated: 'Actualizado', noMetadata: 'No hay metadatos de conexión disponibles para este ámbito autenticado.', fields: 'Campos configurados', actions: 'Acciones disponibles', notices: 'Avisos', actionLabels: { view: 'Ver', manual_setup: 'Configuración manual' }, noticeLabels: { 'No provider connection is configured.': 'No hay ninguna conexión de proveedor configurada.' } },
  pt: { title: 'Suas conexões de provedores', notice: 'Este painel é somente leitura. Ele nunca revela, copia, descriptografa ou retorna credenciais de provedores.', unavailable: 'Status indisponível', loadError: 'Não foi possível carregar o status do Provider Hub.', loading: 'Carregando o status da conexão…', section: 'Status da conexão do provedor', none: 'Nenhum provedor configurado', state: 'Status da conexão', auth: 'Autenticação', configured: 'Credenciais configuradas', yes: 'Sim', no: 'Não', tenant: 'Locatário', environment: 'Ambiente', id: 'ID da conexão', updated: 'Atualizado', noMetadata: 'Nenhum metadado de conexão está disponível para este escopo autenticado.', fields: 'Campos configurados', actions: 'Ações disponíveis', notices: 'Avisos', actionLabels: { view: 'Ver', manual_setup: 'Configuração manual' }, noticeLabels: { 'No provider connection is configured.': 'Nenhuma conexão de provedor está configurada.' } },
  pl: { title: 'Twoje połączenia z dostawcami', notice: 'Ten panel jest tylko do odczytu. Nigdy nie ujawnia, nie kopiuje, nie odszyfrowuje ani nie zwraca danych uwierzytelniających dostawcy.', unavailable: 'Status niedostępny', loadError: 'Nie można załadować statusu Provider Hub.', loading: 'Ładowanie statusu połączenia…', section: 'Status połączenia z dostawcą', none: 'Brak skonfigurowanego dostawcy', state: 'Stan połączenia', auth: 'Uwierzytelnianie', configured: 'Dane uwierzytelniające skonfigurowane', yes: 'Tak', no: 'Nie', tenant: 'Dzierżawca', environment: 'Środowisko', id: 'Identyfikator połączenia', updated: 'Zaktualizowano', noMetadata: 'Brak metadanych połączenia dla tego uwierzytelnionego zakresu.', fields: 'Skonfigurowane pola', actions: 'Dostępne działania', notices: 'Powiadomienia', actionLabels: { view: 'Wyświetl', manual_setup: 'Konfiguracja ręczna' }, noticeLabels: { 'No provider connection is configured.': 'Nie skonfigurowano połączenia z dostawcą.' } },
  ru: { title: 'Ваши подключения к провайдерам', notice: 'Эта панель доступна только для чтения. Она никогда не раскрывает, не копирует, не расшифровывает и не возвращает учетные данные провайдера.', unavailable: 'Статус недоступен', loadError: 'Не удалось загрузить статус Provider Hub.', loading: 'Загрузка статуса подключения…', section: 'Статус подключения провайдера', none: 'Провайдер не настроен', state: 'Состояние подключения', auth: 'Аутентификация', configured: 'Учетные данные настроены', yes: 'Да', no: 'Нет', tenant: 'Арендатор', environment: 'Среда', id: 'Идентификатор подключения', updated: 'Обновлено', noMetadata: 'Для этой аутентифицированной области нет метаданных подключения.', fields: 'Настроенные поля', actions: 'Доступные действия', notices: 'Уведомления', actionLabels: { view: 'Просмотреть', manual_setup: 'Ручная настройка' }, noticeLabels: { 'No provider connection is configured.': 'Подключение к провайдеру не настроено.' } },
}

function normalizeLocale(value: string): Locale {
  const candidate = value.toLowerCase().split('-')[0]
  return candidate === 'es' || candidate === 'pt' || candidate === 'pl' || candidate === 'ru' ? candidate : 'en'
}

function humanize(value: string) {
  return value.replaceAll('_', ' ')
}

export default function ProviderHubStatusDashboard({ endpoint, title }: { endpoint: string; title?: string }) {
  const { lang } = useI18n()
  const [surface, setSurface] = useState<StatusSurface | null>(null)
  const [error, setError] = useState('')
  const locale = normalizeLocale(lang)
  const text = useMemo(() => copy[locale], [locale])

  useEffect(() => {
    let active = true
    setError('')
    fetch(endpoint, { method: 'GET', cache: 'no-store' })
      .then(async response => {
        const body = await response.json() as StatusSurface & { error?: string }
        if (!response.ok) throw new Error(body.error || LOCALIZED_LOAD_ERROR)
        if (active) setSurface(body)
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : LOCALIZED_LOAD_ERROR) })
    return () => { active = false }
  }, [endpoint])

  const actionLabel = (action: string) => text.actionLabels[action] || humanize(action)
  const noticeLabel = (notice: string) => text.noticeLabels[notice] || notice
  const errorLabel = error === LOCALIZED_LOAD_ERROR ? text.loadError : error

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px' }}>
      <header style={{ marginBottom: 24 }}><p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}>Provider Hub</p><h1 style={{ margin: '8px 0' }}>{title || text.title}</h1><p>{text.notice}</p></header>
      {error ? <section role="alert"><h2>{text.unavailable}</h2><p>{errorLabel}</p></section> : null}
      {!error && !surface ? <p>{text.loading}</p> : null}
      {surface ? <section aria-label={text.section} style={{ display: 'grid', gap: 16 }}>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 20 }}>
          <h2 style={{ marginTop: 0 }}>{surface.connection ? surface.connection.providerId : text.none}</h2>
          {surface.connection ? <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) 2fr', gap: 10 }}>
            <dt>{text.state}</dt><dd>{surface.connection.state}</dd><dt>{text.auth}</dt><dd>{surface.connection.authentication.method}</dd><dt>{text.configured}</dt><dd>{surface.connection.authentication.configured ? text.yes : text.no}</dd><dt>{text.tenant}</dt><dd>{surface.connection.tenantId}</dd><dt>{text.environment}</dt><dd>{surface.connection.environmentId}</dd><dt>{text.id}</dt><dd>{surface.connection.connectionId}</dd><dt>{text.updated}</dt><dd>{new Date(surface.connection.updatedAt).toLocaleString(locale)}</dd>
          </dl> : <p>{text.noMetadata}</p>}
        </div>
        {surface.connection && Object.keys(surface.connection.authentication.maskedFields).length > 0 ? <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 20 }}><h2 style={{ marginTop: 0 }}>{text.fields}</h2><ul>{Object.entries(surface.connection.authentication.maskedFields).map(([name, status]) => <li key={name}>{name}: {status}</li>)}</ul></div> : null}
        <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 20 }}><h2 style={{ marginTop: 0 }}>{text.actions}</h2><ul>{surface.allowedActions.map(action => <li key={action}>{actionLabel(action)}</li>)}</ul>{surface.notices.length > 0 ? <><h3>{text.notices}</h3><ul>{surface.notices.map(notice => <li key={notice}>{noticeLabel(notice)}</li>)}</ul></> : null}</div>
      </section> : null}
    </main>
  )
}
