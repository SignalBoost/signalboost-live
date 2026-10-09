'use client'


import { LocalizedText } from '@/components/i18n/LocalizedText'

import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@/components/i18n/I18nProvider'
import { uiText } from '@/lib/i18n/uiText'

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

type Locale = 'en' | 'es' | 'pt' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
  en: { title: uiText('generatedUi.u_07b67c8736945565'), notice: uiText('generatedUi.u_383a465862841858'), unavailable: uiText('generatedUi.u_7eb5af92e49c32f0'), loadError: uiText('generatedUi.u_5fa89a526ec863a3'), loading: uiText('generatedUi.u_b5b53daefa35c15a'), section: uiText('generatedUi.u_1c1485d517272df7'), none: uiText('generatedUi.u_139742d725395c50'), state: uiText('generatedUi.u_900c7badbeb25811'), auth: uiText('generatedUi.u_66880d2d8216260d'), configured: uiText('generatedUi.u_1c81633afddc3ed2'), yes: uiText('generatedUi.u_85a39ab345d672ff'), no: uiText('generatedUi.u_1ea442a134b2a184'), tenant: uiText('generatedUi.u_e23969d284c3424c'), environment: uiText('generatedUi.u_9e471951a1b4106e'), id: "Connection ID", updated: uiText('generatedUi.u_3a5ecca188c0579c'), noMetadata: uiText('generatedUi.u_4a9b9c613c6bcd72'), fields: uiText('generatedUi.u_115350042fdc6de7'), actions: uiText('generatedUi.u_6a70c39bf17c1353'), notices: uiText('generatedUi.u_00a05fce19732187'), actionLabels: { view: uiText('generatedUi.u_dcc839a4015c4b7d'), manual_setup: uiText('generatedUi.u_2831546121359362') }, noticeLabels: { 'No provider connection is configured.': uiText('generatedUi.u_90c0c34d801fdd9c') } },
  es: { title: 'Tus conexiones de proveedores', notice: 'Este panel es de solo lectura. Nunca revela, copia, descifra ni devuelve credenciales de proveedores.', unavailable: 'Estado no disponible', loadError: 'No se pudo cargar el estado de Provider Hub.', loading: 'Cargando el estado de la conexión…', section: 'Estado de conexión del proveedor', none: 'Ningún proveedor configurado', state: 'Estado de la conexión', auth: 'Autenticación', configured: 'Credenciales configuradas', yes: 'Sí', no: 'No', tenant: 'Inquilino', environment: 'Entorno', id: 'ID de conexión', updated: 'Actualizado', noMetadata: 'No hay metadatos de conexión disponibles para este ámbito autenticado.', fields: 'Campos configurados', actions: 'Acciones disponibles', notices: 'Avisos', actionLabels: { view: 'Ver', manual_setup: 'Configuración manual' }, noticeLabels: { 'No provider connection is configured.': 'No hay ninguna conexión de proveedor configurada.' } },
  pt: { title: 'Suas conexões de provedores', notice: 'Este painel é somente leitura. Ele nunca revela, copia, descriptografa ou retorna credenciais de provedores.', unavailable: 'Status indisponível', loadError: 'Não foi possível carregar o status do Provider Hub.', loading: 'Carregando o status da conexão…', section: 'Status da conexão do provedor', none: 'Nenhum provedor configurado', state: 'Status da conexão', auth: 'Autenticação', configured: 'Credenciais configuradas', yes: 'Sim', no: 'Não', tenant: 'Locatário', environment: 'Ambiente', id: 'ID da conexão', updated: 'Atualizado', noMetadata: 'Nenhum metadado de conexão está disponível para este escopo autenticado.', fields: 'Campos configurados', actions: 'Ações disponíveis', notices: 'Avisos', actionLabels: { view: 'Ver', manual_setup: 'Configuração manual' }, noticeLabels: { 'No provider connection is configured.': 'Nenhuma conexão de provedor está configurada.' } },
  pl: { title: 'Twoje połączenia z dostawcami', notice: 'Ten panel jest tylko do odczytu. Nigdy nie ujawnia, nie kopiuje, nie odszyfrowuje ani nie zwraca danych uwierzytelniających dostawcy.', unavailable: 'Status niedostępny', loadError: 'Nie można załadować statusu Provider Hub.', loading: 'Ładowanie statusu połączenia…', section: 'Status połączenia z dostawcą', none: 'Brak skonfigurowanego dostawcy', state: 'Stan połączenia', auth: 'Uwierzytelnianie', configured: 'Dane uwierzytelniające skonfigurowane', yes: 'Tak', no: 'Nie', tenant: 'Dzierżawca', environment: 'Środowisko', id: 'Identyfikator połączenia', updated: 'Zaktualizowano', noMetadata: 'Brak metadanych połączenia dla tego uwierzytelnionego zakresu.', fields: 'Skonfigurowane pola', actions: 'Dostępne działania', notices: 'Powiadomienia', actionLabels: { view: 'Wyświetl', manual_setup: 'Konfiguracja ręczna' }, noticeLabels: { 'No provider connection is configured.': 'Nie skonfigurowano połączenia z dostawcą.' } },
  ru: { title: 'Ваши подключения к провайдерам', notice: 'Эта панель доступна только для чтения. Она никогда не раскрывает, не копирует, не расшифровывает и не возвращает учетные данные провайдера.', unavailable: 'Статус недоступен', loadError: 'Не удалось загрузить статус Provider Hub.', loading: 'Загрузка статуса подключения…', section: 'Статус подключения провайдера', none: 'Провайдер не настроен', state: 'Состояние подключения', auth: 'Аутентификация', configured: 'Учетные данные настроены', yes: 'Да', no: 'Нет', tenant: 'Арендатор', environment: 'Среда', id: 'Идентификатор подключения', updated: 'Обновлено', noMetadata: 'Для этой аутентифицированной области нет метаданных подключения.', fields: 'Настроенные поля', actions: 'Доступные действия', notices: 'Уведомления', actionLabels: { view: 'Просмотреть', manual_setup: 'Ручная настройка' }, noticeLabels: { 'No provider connection is configured.': 'Подключение к провайдеру не настроено.' } },
  de: { title: 'Ihre Anbieterverbindungen', notice: 'Dieses Dashboard ist schreibgeschützt. Es zeigt, kopiert, entschlüsselt oder liefert niemals Anbieter-Zugangsdaten.', unavailable: 'Status nicht verfügbar', loadError: 'Status des Provider Hub kann nicht geladen werden.', loading: 'Verbindungsstatus wird geladen…', section: 'Verbindungsstatus des Anbieters', none: 'Kein Anbieter konfiguriert', state: 'Verbindungsstatus', auth: 'Authentifizierung', configured: 'Anmeldedaten konfiguriert', yes: 'Ja', no: 'Nein', tenant: 'Mandant', environment: 'Umgebung', id: "Verbindungs-ID", updated: 'Aktualisiert', noMetadata: 'Für diesen authentifizierten Bereich sind keine Verbindungsmetadaten verfügbar.', fields: 'Konfigurierte Felder', actions: 'Verfügbare Aktionen', notices: 'Hinweise', actionLabels: { view: 'Anzeigen', manual_setup: 'Manuelle Einrichtung' }, noticeLabels: { 'No provider connection is configured.': 'Es ist keine Anbieterverbindung konfiguriert.' } },
  fr: { title: 'Vos connexions aux fournisseurs', notice: 'Ce tableau de bord est en lecture seule. Il ne révèle, ne copie, ne déchiffre ni ne renvoie jamais les identifiants des fournisseurs.', unavailable: 'Statut indisponible', loadError: 'Impossible de charger l’état du Hub des fournisseurs.', loading: 'Chargement de l\'état de connexion…', section: 'État de connexion du fournisseur', none: 'Aucun fournisseur configuré', state: 'État de la connexion', auth: 'Authentification', configured: 'Identifiants configurés', yes: 'Oui', no: 'Non', tenant: 'Locataire', environment: 'Environnement', id: "ID de connexion", updated: 'Mis à jour', noMetadata: 'Aucune métadonnée de connexion n’est disponible pour ce périmètre authentifié.', fields: 'Champs configurés', actions: 'Actions disponibles', notices: 'Avis', actionLabels: { view: 'Voir', manual_setup: 'Configuration manuelle' }, noticeLabels: { 'No provider connection is configured.': 'Aucune connexion fournisseur n\'est configurée.' } },
  it: { title: 'Le tue connessioni ai provider', notice: 'Questa dashboard è in sola lettura. Non rivela, copia, decifra né restituisce mai le credenziali dei provider.', unavailable: 'Stato non disponibile', loadError: 'Impossibile caricare lo stato dell’Hub dei provider.', loading: 'Caricamento dello stato di connessione…', section: 'Stato di connessione del provider', none: 'Nessun provider configurato', state: 'Stato della connessione', auth: 'Autenticazione', configured: 'Credenziali configurate', yes: 'Sì', no: 'No', tenant: 'Tenant', environment: 'Ambiente', id: "ID connessione", updated: 'Aggiornato', noMetadata: 'Nessun metadato di connessione disponibile per questo ambito autenticato.', fields: 'Campi configurati', actions: 'Azioni disponibili', notices: 'Avvisi', actionLabels: { view: 'Visualizza', manual_setup: 'Configurazione manuale' }, noticeLabels: { 'No provider connection is configured.': 'Nessuna connessione al provider configurata.' } },
  ja: { title: 'プロバイダー接続', notice: 'このダッシュボードは読み取り専用です。プロバイダーの認証情報を表示、コピー、復号、返却することはありません。', unavailable: 'ステータスを取得できません', loadError: 'プロバイダー Hub のステータスを読み込めません。', loading: '接続ステータスを読み込み中…', section: 'プロバイダーの接続状態', none: 'プロバイダー未設定', state: '接続状態', auth: '認証', configured: '認証情報設定済み', yes: 'はい', no: 'いいえ', tenant: 'テナント', environment: '環境', id: "接続 ID", updated: '更新済み', noMetadata: 'この認証済みスコープで利用できる接続メタデータはありません。', fields: '設定済みフィールド', actions: '利用可能なアクション', notices: 'お知らせ', actionLabels: { view: '表示', manual_setup: '手動セットアップ' }, noticeLabels: { 'No provider connection is configured.': 'プロバイダー接続が設定されていません。' } },
  ko: { title: '공급자 연결', notice: '이 대시보드는 읽기 전용입니다. 공급자 자격 증명을 표시, 복사, 복호화 또는 반환하지 않습니다.', unavailable: '상태를 사용할 수 없음', loadError: '공급자 Hub 상태를 불러올 수 없습니다.', loading: '연결 상태를 불러오는 중…', section: '공급자 연결 상태', none: '구성된 공급자 없음', state: '연결 상태', auth: '인증', configured: '자격 증명 구성됨', yes: '예', no: '아니요', tenant: '테넌트', environment: '환경', id: "연결 ID", updated: '업데이트됨', noMetadata: '이 인증된 범위에 사용할 수 있는 연결 메타데이터가 없습니다.', fields: '구성된 필드', actions: '사용 가능한 작업', notices: '알림', actionLabels: { view: '보기', manual_setup: '수동 설정' }, noticeLabels: { 'No provider connection is configured.': '구성된 공급자 연결이 없습니다.' } },
  ar: { title: 'اتصالات المزوّدين الخاصة بك', notice: 'لوحة المعلومات هذه للقراءة فقط. ولا تكشف بيانات اعتماد المزوّدين أو تنسخها أو تفك تشفيرها أو تعيدها أبدًا.', unavailable: 'الحالة غير متاحة', loadError: 'تعذّر تحميل حالة Hub المزوّدين.', loading: 'جارٍ تحميل حالة الاتصال…', section: 'حالة اتصال المزوّد', none: 'لم يتم تكوين أي مزوّد', state: 'حالة الاتصال', auth: 'المصادقة', configured: 'تم تكوين بيانات الاعتماد', yes: 'نعم', no: 'لا', tenant: 'المستأجر', environment: 'البيئة', id: "معرّف الاتصال", updated: 'تم التحديث', noMetadata: 'لا توجد بيانات وصفية للاتصال متاحة لهذا النطاق المصادق عليه.', fields: 'الحقول المكوّنة', actions: 'الإجراءات المتاحة', notices: 'الإشعارات', actionLabels: { view: 'عرض', manual_setup: 'الإعداد اليدوي' }, noticeLabels: { 'No provider connection is configured.': 'لم يتم تكوين أي اتصال بمزوّد.' } },
}

function normalizeLocale(value: string): Locale {
  const candidate = value.toLowerCase().split('-')[0]
  return candidate === 'es' || candidate === 'pt' || candidate === 'pl' || candidate === 'ru' || candidate === 'de' || candidate === 'fr' || candidate === 'it' || candidate === 'ja' || candidate === 'ko' || candidate === 'ar' ? candidate : 'en'
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
      <header style={{ marginBottom: 24 }}><p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' }}><LocalizedText fallback={uiText('generatedUi.u_a082185bfb56e8e0')} /></p><h1 style={{ margin: '8px 0' }}>{title || text.title}</h1><p>{text.notice}</p></header>
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
