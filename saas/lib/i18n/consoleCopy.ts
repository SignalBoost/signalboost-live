// saas/lib/i18n/consoleCopy.ts
//
// Hub Console internationalization. Keyed by convention so the renderers resolve
// localized strings with the English already in the data files as the fallback —
// any missing key shows English, nothing ever renders blank.
//
// Structure is by-key (all 5 languages grouped per string) for maintainability.
// PL/RU are careful translations; a native speaker should verify before a sale,
// consistent with the existing suiteCopy.ts convention.

export type HubLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type Five = { en: string; es: string; pt: string; pl: string; ru: string }

// ---- helpers ----------------------------------------------------------------

/** Convert a free-text title to a stable key fragment: "Pull Requests" -> "pull_requests" */
export function hubSlug(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Resolve a console string: localized → English entry → caller fallback. */
export function cHub(lang: string, key: string, fallback: string): string {
  const row = HUB_STRINGS[key]
  if (!row) return fallback
  const l = (lang as HubLang)
  return row[l] || row.en || fallback
}

// ---- shell strings ----------------------------------------------------------

export const HUB_STRINGS: Record<string, Five> = {
  // Tiers
  'hub.tier.core':        { en: 'Core',        es: 'Esencial',    pt: 'Essencial',   pl: 'Podstawowy',  ru: 'Основной' },
  'hub.tier.tier2':       { en: 'Scale',       es: 'Escala',      pt: 'Escala',      pl: 'Skalowanie',  ru: 'Масштаб' },
  'hub.tier.tier3':  { en: 'Enterprise',  es: 'Empresarial', pt: 'Empresarial', pl: 'Korporacyjny',ru: 'Корпоративный' },
  'hub.tier.tier4':    { en: 'Internal',    es: 'Interno',     pt: 'Interno',     pl: 'Wewnętrzny',  ru: 'Внутренний' },
  'hub.tier.sidebar.core':       { en: 'Tier 1 Providers', es: 'Proveedores Nivel 1', pt: 'Provedores Nível 1', pl: 'Dostawcy poziomu 1', ru: 'Провайдеры уровня 1' },
  'hub.tier.sidebar.tier2':      { en: 'Tier 2 Providers', es: 'Proveedores Nivel 2', pt: 'Provedores Nível 2', pl: 'Dostawcy poziomu 2', ru: 'Провайдеры уровня 2' },
  'hub.tier.sidebar.tier3': { en: 'Tier 3 Providers', es: 'Proveedores Nivel 3', pt: 'Provedores Nível 3', pl: 'Dostawcy poziomu 3', ru: 'Провайдеры уровня 3' },
  'hub.tier.sidebar.tier4':   { en: 'Tier 4 Tools',     es: 'Herramientas Nivel 4',pt: 'Ferramentas Nível 4',pl: 'Narzędzia poziomu 4',ru: 'Инструменты уровня 4' },

  // Utility pages
  'hub.util.domains':     { en: 'Domains/DNS', es: 'Dominios/DNS', pt: 'Domínios/DNS', pl: 'Domeny/DNS', ru: 'Домены/DNS' },
  'hub.util.deployments': { en: 'Deployments', es: 'Despliegues',  pt: 'Implantações', pl: 'Wdrożenia',  ru: 'Развёртывания' },
  'hub.util.logs':        { en: 'Logs',        es: 'Registros',    pt: 'Registros',    pl: 'Dzienniki',  ru: 'Журналы' },
  'hub.util.settings':    { en: 'Settings',    es: 'Ajustes',      pt: 'Configurações',pl: 'Ustawienia', ru: 'Настройки' },

  // Provider subtitles (also used as fallback single-section titles via slug)
  'hub.sub.ai_and_models':            { en: 'AI & MODELS',              es: 'IA Y MODELOS',            pt: 'IA E MODELOS',             pl: 'AI I MODELE',              ru: 'ИИ И МОДЕЛИ' },
  'hub.sub.email':                    { en: 'EMAIL',                    es: 'CORREO',                  pt: 'E-MAIL',                   pl: 'E-MAIL',                   ru: 'ПОЧТА' },
  'hub.sub.transcription':            { en: 'TRANSCRIPTION',            es: 'TRANSCRIPCIÓN',           pt: 'TRANSCRIÇÃO',              pl: 'TRANSKRYPCJA',             ru: 'ТРАНСКРИПЦИЯ' },
  'hub.sub.cloud_infrastructure':     { en: 'CLOUD INFRASTRUCTURE',     es: 'INFRAESTRUCTURA CLOUD',   pt: 'INFRAESTRUTURA CLOUD',     pl: 'INFRASTRUKTURA CHMURY',    ru: 'ОБЛАЧНАЯ ИНФРАСТРУКТУРА' },
  'hub.sub.cloud_platform':           { en: 'CLOUD PLATFORM',           es: 'PLATAFORMA CLOUD',        pt: 'PLATAFORMA CLOUD',         pl: 'PLATFORMA CHMUROWA',       ru: 'ОБЛАЧНАЯ ПЛАТФОРМА' },
  'hub.sub.microsoft_cloud':          { en: 'MICROSOFT CLOUD',          es: 'NUBE MICROSOFT',          pt: 'NUVEM MICROSOFT',          pl: 'CHMURA MICROSOFT',         ru: 'ОБЛАКО MICROSOFT' },
  'hub.sub.payments_and_billing':     { en: 'PAYMENTS & BILLING',       es: 'PAGOS Y FACTURACIÓN',     pt: 'PAGAMENTOS E COBRANÇA',    pl: 'PŁATNOŚCI I ROZLICZENIA',  ru: 'ПЛАТЕЖИ И БИЛЛИНГ' },
  'hub.sub.database_and_authentication': { en: 'DATABASE & AUTHENTICATION', es: 'BASE DE DATOS Y AUTENTICACIÓN', pt: 'BANCO DE DADOS E AUTENTICAÇÃO', pl: 'BAZA DANYCH I UWIERZYTELNIANIE', ru: 'БАЗА ДАННЫХ И АУТЕНТИФИКАЦИЯ' },
  'hub.sub.deployments_and_networking': { en: 'DEPLOYMENTS & NETWORKING', es: 'DESPLIEGUES Y RED',      pt: 'IMPLANTAÇÕES E REDE',      pl: 'WDROŻENIA I SIEĆ',         ru: 'РАЗВЁРТЫВАНИЯ И СЕТЬ' },
  'hub.sub.source_control':           { en: 'SOURCE CONTROL',           es: 'CONTROL DE CÓDIGO',       pt: 'CONTROLE DE CÓDIGO',       pl: 'KONTROLA WERSJI',          ru: 'КОНТРОЛЬ ВЕРСИЙ' },
  'hub.sub.messaging_and_sms':        { en: 'MESSAGING & SMS',          es: 'MENSAJERÍA Y SMS',        pt: 'MENSAGENS E SMS',          pl: 'WIADOMOŚCI I SMS',         ru: 'СООБЩЕНИЯ И SMS' },
  'hub.sub.transactional_email':      { en: 'TRANSACTIONAL EMAIL',      es: 'CORREO TRANSACCIONAL',    pt: 'E-MAIL TRANSACIONAL',      pl: 'E-MAIL TRANSAKCYJNY',      ru: 'ТРАНЗАКЦИОННАЯ ПОЧТА' },
  'hub.sub.dns_cdn_and_edge':         { en: 'DNS, CDN & EDGE',          es: 'DNS, CDN Y EDGE',         pt: 'DNS, CDN E EDGE',          pl: 'DNS, CDN I EDGE',          ru: 'DNS, CDN И EDGE' },
  'hub.sub.cloud_compute':            { en: 'CLOUD COMPUTE',            es: 'CÓMPUTO CLOUD',           pt: 'COMPUTAÇÃO CLOUD',         pl: 'OBLICZENIA W CHMURZE',     ru: 'ОБЛАЧНЫЕ ВЫЧИСЛЕНИЯ' },
  'hub.sub.app_platform':             { en: 'APP PLATFORM',             es: 'PLATAFORMA DE APPS',      pt: 'PLATAFORMA DE APPS',       pl: 'PLATFORMA APLIKACJI',      ru: 'ПЛАТФОРМА ПРИЛОЖЕНИЙ' },
  'hub.sub.observability':            { en: 'OBSERVABILITY',            es: 'OBSERVABILIDAD',          pt: 'OBSERVABILIDADE',          pl: 'OBSERWOWALNOŚĆ',           ru: 'НАБЛЮДАЕМОСТЬ' },
  'hub.sub.error_monitoring':         { en: 'ERROR MONITORING',         es: 'MONITOREO DE ERRORES',    pt: 'MONITORAMENTO DE ERROS',   pl: 'MONITOROWANIE BŁĘDÓW',     ru: 'МОНИТОРИНГ ОШИБОК' },
  'hub.sub.incident_response':        { en: 'INCIDENT RESPONSE',        es: 'RESPUESTA A INCIDENTES',  pt: 'RESPOSTA A INCIDENTES',    pl: 'REAGOWANIE NA INCYDENTY',  ru: 'РЕАГИРОВАНИЕ НА ИНЦИДЕНТЫ' },
  'hub.sub.encrypted_secret_vault':   { en: 'ENCRYPTED SECRET VAULT',   es: 'BÓVEDA DE SECRETOS CIFRADA', pt: 'COFRE DE SEGREDOS CRIPTOGRAFADO', pl: 'SZYFROWANY SEJF SEKRETÓW', ru: 'ЗАШИФРОВАННОЕ ХРАНИЛИЩЕ СЕКРЕТОВ' },
  'hub.sub.team_access_and_compliance': { en: 'TEAM ACCESS & COMPLIANCE', es: 'ACCESO DE EQUIPO Y CUMPLIMIENTO', pt: 'ACESSO DA EQUIPE E CONFORMIDADE', pl: 'DOSTĘP ZESPOŁU I ZGODNOŚĆ', ru: 'ДОСТУП КОМАНДЫ И СООТВЕТСТВИЕ' },
  'hub.sub.voice_and_audio':          { en: 'VOICE & AUDIO',            es: 'VOZ Y AUDIO',             pt: 'VOZ E ÁUDIO',              pl: 'GŁOS I DŹWIĘK',            ru: 'ГОЛОС И АУДИО' },

  // Section titles (mixed-case). Uppercase section titles reuse the hub.sub.* keys via slug.
  'hub.sec.repositories':       { en: 'Repositories',        es: 'Repositorios',       pt: 'Repositórios',       pl: 'Repozytoria',        ru: 'Репозитории' },
  'hub.sec.pull_requests':      { en: 'Pull Requests',       es: 'Pull Requests',      pt: 'Pull Requests',      pl: 'Pull Requesty',      ru: 'Pull-запросы' },
  'hub.sec.branches':          { en: 'Branches',            es: 'Ramas',              pt: 'Ramificações',       pl: 'Gałęzie',            ru: 'Ветки' },
  'hub.sec.issues':            { en: 'Issues',              es: 'Incidencias',        pt: 'Issues',             pl: 'Zgłoszenia',         ru: 'Задачи' },
  'hub.sec.activity':          { en: 'Activity',            es: 'Actividad',          pt: 'Atividade',          pl: 'Aktywność',          ru: 'Активность' },
  'hub.sec.secrets_and_tokens':{ en: 'Secrets & Tokens',    es: 'Secretos y Tokens',  pt: 'Segredos e Tokens',  pl: 'Sekrety i Tokeny',   ru: 'Секреты и токены' },
  'hub.sec.models':            { en: 'Models',              es: 'Modelos',            pt: 'Modelos',            pl: 'Modele',             ru: 'Модели' },
  'hub.sec.files':             { en: 'Files',               es: 'Archivos',           pt: 'Arquivos',           pl: 'Pliki',              ru: 'Файлы' },
  'hub.sec.jobs':              { en: 'Jobs',                es: 'Trabajos',           pt: 'Trabalhos',          pl: 'Zadania',            ru: 'Задания' },
  'hub.sec.voices':            { en: 'Voices',              es: 'Voces',              pt: 'Vozes',              pl: 'Głosy',              ru: 'Голоса' },
  'hub.sec.account':           { en: 'Account',             es: 'Cuenta',             pt: 'Conta',              pl: 'Konto',              ru: 'Аккаунт' },
  'hub.sec.history':           { en: 'History',             es: 'Historial',          pt: 'Histórico',          pl: 'Historia',           ru: 'История' },
  'hub.sec.domains':           { en: 'Domains',             es: 'Dominios',           pt: 'Domínios',           pl: 'Domeny',             ru: 'Домены' },
  'hub.sec.audiences':         { en: 'Audiences',           es: 'Audiencias',         pt: 'Públicos',           pl: 'Odbiorcy',           ru: 'Аудитории' },
  'hub.sec.broadcasts':        { en: 'Broadcasts',          es: 'Difusiones',         pt: 'Transmissões',       pl: 'Wysyłki',            ru: 'Рассылки' },
  'hub.sec.api_keys':          { en: 'API Keys',            es: 'Claves API',         pt: 'Chaves de API',      pl: 'Klucze API',         ru: 'API-ключи' },
  'hub.sec.transcripts':       { en: 'Transcripts',         es: 'Transcripciones',    pt: 'Transcrições',       pl: 'Transkrypcje',       ru: 'Транскрипции' },
  'hub.sec.data':              { en: 'Data',                es: 'Datos',              pt: 'Dados',              pl: 'Dane',               ru: 'Данные' },
  'hub.sec.auth':              { en: 'Auth',                es: 'Autenticación',      pt: 'Autenticação',       pl: 'Uwierzytelnianie',   ru: 'Аутентификация' },
  'hub.sec.storage':           { en: 'Storage',             es: 'Almacenamiento',     pt: 'Armazenamento',      pl: 'Pamięć',             ru: 'Хранилище' },
  'hub.sec.customers':         { en: 'Customers',           es: 'Clientes',           pt: 'Clientes',           pl: 'Klienci',            ru: 'Клиенты' },
  'hub.sec.prices_and_tiers':  { en: 'Prices & Tiers',      es: 'Precios y Planes',   pt: 'Preços e Planos',    pl: 'Ceny i Plany',       ru: 'Цены и тарифы' },
  'hub.sec.catalog':           { en: 'Catalog',             es: 'Catálogo',           pt: 'Catálogo',           pl: 'Katalog',            ru: 'Каталог' },
  'hub.sec.table_crud':        { en: 'Table CRUD',          es: 'CRUD de Tablas',     pt: 'CRUD de Tabelas',    pl: 'CRUD Tabel',         ru: 'CRUD таблиц' },
  'hub.sec.sql_engine':        { en: 'SQL Engine',          es: 'Motor SQL',          pt: 'Motor SQL',          pl: 'Silnik SQL',         ru: 'Движок SQL' },
  'hub.sec.users_and_access':  { en: 'Users & Access',      es: 'Usuarios y Acceso',  pt: 'Usuários e Acesso',  pl: 'Użytkownicy i Dostęp',ru: 'Пользователи и доступ' },
  'hub.sec.credentials':       { en: 'Credentials',         es: 'Credenciales',       pt: 'Credenciais',        pl: 'Poświadczenia',      ru: 'Учётные данные' },
  'hub.sec.environment_variables': { en: 'Environment Variables', es: 'Variables de Entorno', pt: 'Variáveis de Ambiente', pl: 'Zmienne Środowiskowe', ru: 'Переменные окружения' },
  'hub.sec.deployments':       { en: 'Deployments',         es: 'Despliegues',        pt: 'Implantações',       pl: 'Wdrożenia',          ru: 'Развёртывания' },
  'hub.sec.networking_and_logs': { en: 'Networking & Logs', es: 'Red y Registros',    pt: 'Rede e Registros',   pl: 'Sieć i Dzienniki',   ru: 'Сеть и журналы' },
  'hub.sec.email':             { en: 'Email',               es: 'Correo',             pt: 'E-mail',             pl: 'E-mail',             ru: 'Почта' },
  'hub.sec.messaging':         { en: 'Messaging',           es: 'Mensajería',         pt: 'Mensagens',          pl: 'Wiadomości',         ru: 'Сообщения' },
  'hub.sec.dns':               { en: 'DNS',                 es: 'DNS',                pt: 'DNS',                pl: 'DNS',                ru: 'DNS' },
  'hub.sec.cache':             { en: 'Cache',               es: 'Caché',              pt: 'Cache',              pl: 'Pamięć podręczna',   ru: 'Кэш' },
  'hub.sec.compute':           { en: 'Compute',             es: 'Cómputo',            pt: 'Computação',         pl: 'Obliczenia',         ru: 'Вычисления' },
  'hub.sec.iam':               { en: 'IAM',                 es: 'IAM',                pt: 'IAM',                pl: 'IAM',                ru: 'IAM' },
  'hub.sec.security':          { en: 'Security',            es: 'Seguridad',          pt: 'Segurança',          pl: 'Bezpieczeństwo',     ru: 'Безопасность' },
  'hub.sec.security_rules':    { en: 'Security Rules',      es: 'Reglas de Seguridad',pt: 'Regras de Segurança',pl: 'Reguły Bezpieczeństwa',ru: 'Правила безопасности' },
  'hub.sec.secrets_storage':   { en: 'Secrets Storage',     es: 'Almacén de Secretos',pt: 'Armazém de Segredos',pl: 'Magazyn Sekretów',   ru: 'Хранилище секретов' },
  'hub.sec.monitoring':        { en: 'Monitoring',          es: 'Monitoreo',          pt: 'Monitoramento',      pl: 'Monitorowanie',      ru: 'Мониторинг' },
  'hub.sec.incidents':         { en: 'Incidents',           es: 'Incidentes',         pt: 'Incidentes',         pl: 'Incydenty',          ru: 'Инциденты' },
  'hub.sec.team_access':       { en: 'Team Access',         es: 'Acceso de Equipo',   pt: 'Acesso da Equipe',   pl: 'Dostęp Zespołu',     ru: 'Доступ команды' },
  'hub.sec.compliance_and_audit': { en: 'Compliance & Audit', es: 'Cumplimiento y Auditoría', pt: 'Conformidade e Auditoria', pl: 'Zgodność i Audyt', ru: 'Соответствие и аудит' },
  'hub.sec.audit':             { en: 'Audit',               es: 'Auditoría',          pt: 'Auditoria',          pl: 'Audyt',              ru: 'Аудит' },

  // Common field labels
  'hub.fld.repository':        { en: 'Repository',          es: 'Repositorio',        pt: 'Repositório',        pl: 'Repozytorium',       ru: 'Репозиторий' },
  'hub.fld.pull_request':      { en: 'Pull Request',        es: 'Pull Request',       pt: 'Pull Request',       pl: 'Pull Request',       ru: 'Pull-запрос' },
  'hub.fld.issue':             { en: 'Issue',               es: 'Incidencia',         pt: 'Issue',              pl: 'Zgłoszenie',         ru: 'Задача' },
  'hub.fld.branch':            { en: 'Branch',              es: 'Rama',               pt: 'Ramificação',        pl: 'Gałąź',              ru: 'Ветка' },
  'hub.fld.model':             { en: 'Model',               es: 'Modelo',             pt: 'Modelo',             pl: 'Model',              ru: 'Модель' },
  'hub.fld.voice':             { en: 'Voice',               es: 'Voz',                pt: 'Voz',                pl: 'Głos',               ru: 'Голос' },
  'hub.fld.table':             { en: 'Table',               es: 'Tabla',              pt: 'Tabela',             pl: 'Tabela',             ru: 'Таблица' },
  'hub.fld.transcript':        { en: 'Transcript',          es: 'Transcripción',      pt: 'Transcrição',        pl: 'Transkrypcja',       ru: 'Транскрипция' },
  'hub.fld.title':             { en: 'Title',               es: 'Título',             pt: 'Título',             pl: 'Tytuł',              ru: 'Заголовок' },
  'hub.fld.new_title':         { en: 'New Title',           es: 'Nuevo Título',       pt: 'Novo Título',        pl: 'Nowy Tytuł',         ru: 'Новый заголовок' },
  'hub.fld.description':       { en: 'Description',         es: 'Descripción',        pt: 'Descrição',          pl: 'Opis',               ru: 'Описание' },
  'hub.fld.body':              { en: 'Body',                es: 'Cuerpo',             pt: 'Corpo',              pl: 'Treść',              ru: 'Текст' },
  'hub.fld.content':           { en: 'Content',             es: 'Contenido',          pt: 'Conteúdo',           pl: 'Zawartość',          ru: 'Содержимое' },
  'hub.fld.name':              { en: 'Name',                es: 'Nombre',             pt: 'Nome',               pl: 'Nazwa',              ru: 'Имя' },
  'hub.fld.message':           { en: 'Message',             es: 'Mensaje',            pt: 'Mensagem',           pl: 'Wiadomość',          ru: 'Сообщение' },
  'hub.fld.email':             { en: 'Email',               es: 'Correo',             pt: 'E-mail',             pl: 'E-mail',             ru: 'Эл. почта' },
  'hub.fld.new_email':         { en: 'New Email',           es: 'Nuevo Correo',       pt: 'Novo E-mail',        pl: 'Nowy E-mail',        ru: 'Новая эл. почта' },
  'hub.fld.merge_method':      { en: 'Merge Method',        es: 'Método de Fusión',   pt: 'Método de Merge',    pl: 'Metoda Scalania',    ru: 'Метод слияния' },
  'hub.fld.region':            { en: 'Region',              es: 'Región',             pt: 'Região',             pl: 'Region',             ru: 'Регион' },
  'hub.fld.domain':            { en: 'Domain',              es: 'Dominio',            pt: 'Domínio',            pl: 'Domena',             ru: 'Домен' },
  'hub.fld.bucket':            { en: 'Bucket',              es: 'Bucket',             pt: 'Bucket',             pl: 'Bucket',             ru: 'Бакет' },
  'hub.fld.product':           { en: 'Product',             es: 'Producto',           pt: 'Produto',            pl: 'Produkt',            ru: 'Продукт' },
  'hub.fld.price':             { en: 'Price',               es: 'Precio',             pt: 'Preço',              pl: 'Cena',               ru: 'Цена' },
  'hub.fld.query':             { en: 'Query',               es: 'Consulta',           pt: 'Consulta',           pl: 'Zapytanie',          ru: 'Запрос' },
  'hub.fld.operation':         { en: 'Operation',           es: 'Operación',          pt: 'Operação',           pl: 'Operacja',           ru: 'Операция' },
  'hub.fld.phone_number':      { en: 'Phone Number',        es: 'Número de Teléfono', pt: 'Número de Telefone', pl: 'Numer Telefonu',     ru: 'Номер телефона' },

  // Common select-option labels
  'hub.opt.open':              { en: 'Open',                es: 'Abierto',            pt: 'Aberto',             pl: 'Otwarte',            ru: 'Открыто' },
  'hub.opt.closed':            { en: 'Closed',              es: 'Cerrado',            pt: 'Fechado',            pl: 'Zamknięte',          ru: 'Закрыто' },
  'hub.opt.merge_commit':      { en: 'Merge commit',        es: 'Commit de fusión',   pt: 'Commit de merge',    pl: 'Commit scalający',   ru: 'Коммит слияния' },
  'hub.opt.squash':            { en: 'Squash',              es: 'Squash',             pt: 'Squash',             pl: 'Squash',             ru: 'Squash' },
  'hub.opt.rebase':            { en: 'Rebase',              es: 'Rebase',             pt: 'Rebase',             pl: 'Rebase',             ru: 'Rebase' },
  'hub.opt.production':        { en: 'Production',          es: 'Producción',         pt: 'Produção',           pl: 'Produkcja',          ru: 'Продакшн' },
  'hub.opt.preview':           { en: 'Preview',             es: 'Vista previa',       pt: 'Pré-visualização',   pl: 'Podgląd',            ru: 'Превью' },
  'hub.opt.development':       { en: 'Development',         es: 'Desarrollo',         pt: 'Desenvolvimento',    pl: 'Programowanie',      ru: 'Разработка' },

  // Form chrome
  'hub.ui.execute':            { en: 'Execute',             es: 'Ejecutar',           pt: 'Executar',           pl: 'Wykonaj',            ru: 'Выполнить' },
  'hub.ui.confirm':            { en: 'Confirm',             es: 'Confirmar',          pt: 'Confirmar',          pl: 'Potwierdź',          ru: 'Подтвердить' },
  'hub.ui.cancel':             { en: 'Cancel',              es: 'Cancelar',           pt: 'Cancelar',           pl: 'Anuluj',             ru: 'Отмена' },
  'hub.ui.preview':            { en: 'Preview',             es: 'Vista previa',       pt: 'Pré-visualizar',     pl: 'Podgląd',            ru: 'Предпросмотр' },
  'hub.ui.close':              { en: 'Close',               es: 'Cerrar',             pt: 'Fechar',             pl: 'Zamknij',            ru: 'Закрыть' },
  'hub.ui.error':              { en: 'Error',               es: 'Error',              pt: 'Erro',               pl: 'Błąd',               ru: 'Ошибка' },
  'hub.ui.success':            { en: 'Success',             es: 'Éxito',              pt: 'Sucesso',            pl: 'Sukces',             ru: 'Успешно' },
  'hub.ui.running':            { en: 'Running…',            es: 'Ejecutando…',        pt: 'Executando…',        pl: 'Wykonywanie…',       ru: 'Выполнение…' },
  'hub.ui.no_inputs':          { en: 'No inputs required for this action.', es: 'Esta acción no requiere datos.', pt: 'Esta ação não requer dados.', pl: 'Ta akcja nie wymaga danych.', ru: 'Для этого действия не требуются данные.' },
  'hub.ui.workspace':          { en: 'Workspace',           es: 'Espacio de trabajo', pt: 'Espaço de trabalho', pl: 'Obszar roboczy',     ru: 'Рабочая область' },
  'hub.ui.hub_home':           { en: 'Hub Home',            es: 'Inicio del Hub',     pt: 'Início do Hub',      pl: 'Strona główna Hub',  ru: 'Главная Hub' },
  'hub.ui.back':               { en: 'Back',                es: 'Volver',             pt: 'Voltar',             pl: 'Wstecz',             ru: 'Назад' },
  'hub.ui.tier':               { en: 'Tier',                es: 'Nivel',              pt: 'Nível',              pl: 'Poziom',             ru: 'Уровень' },
  'hub.ui.providers':          { en: 'Providers',           es: 'Proveedores',        pt: 'Provedores',         pl: 'Dostawcy',           ru: 'Провайдеры' },
  'hub.ui.utility_views':      { en: 'Utility Views',       es: 'Vistas de Utilidad', pt: 'Vistas Utilitárias', pl: 'Widoki Narzędziowe', ru: 'Служебные виды' },
  'hub.ui.review_action':      { en: 'Review the action that will be sent to', es: 'Revisa la acción que se enviará a', pt: 'Revise a ação que será enviada para', pl: 'Sprawdź akcję, która zostanie wysłana do', ru: 'Проверьте действие, которое будет отправлено в' },
  'hub.ui.cannot_undo':        { en: 'Once confirmed, this cannot be undone.', es: 'Una vez confirmado, no se puede deshacer.', pt: 'Após confirmar, não pode ser desfeito.', pl: 'Po potwierdzeniu nie można tego cofnąć.', ru: 'После подтверждения отменить нельзя.' },
  'hub.ui.about_to_execute':   { en: 'You are about to execute', es: 'Estás a punto de ejecutar', pt: 'Você está prestes a executar', pl: 'Zaraz wykonasz', ru: 'Вы собираетесь выполнить' },
  'hub.ui.on':                 { en: 'on', es: 'en', pt: 'em', pl: 'na', ru: 'в' },
  'hub.tier.blurb.core':  { en: 'Primary infrastructure: cloud, payments, data, hosting, and source control.', es: 'Infraestructura principal: nube, pagos, datos, alojamiento y control de código.', pt: 'Infraestrutura principal: nuvem, pagamentos, dados, hospedagem e controle de código.', pl: 'Główna infrastruktura: chmura, płatności, dane, hosting i kontrola wersji.', ru: 'Основная инфраструктура: облако, платежи, данные, хостинг и контроль версий.' },
  'hub.tier.blurb.tier2': { en: 'Messaging, email, edge networking, and compute integrations.', es: 'Mensajería, correo, red edge e integraciones de cómputo.', pt: 'Mensagens, e-mail, rede edge e integrações de computação.', pl: 'Wiadomości, e-mail, sieć edge i integracje obliczeniowe.', ru: 'Сообщения, почта, периферийная сеть и вычислительные интеграции.' },
  'hub.tier.blurb.tier3': { en: 'App platform, observability, error tracking, and incident response.', es: 'Plataforma de apps, observabilidad, seguimiento de errores y respuesta a incidentes.', pt: 'Plataforma de apps, observabilidade, rastreamento de erros e resposta a incidentes.', pl: 'Platforma aplikacji, obserwowalność, śledzenie błędów i reagowanie na incydenty.', ru: 'Платформа приложений, наблюдаемость, отслеживание ошибок и реагирование на инциденты.' },
  'hub.tier.blurb.tier4': { en: 'Encrypted secrets vault and team governance.', es: 'Bóveda de secretos cifrada y gobernanza de equipo.', pt: 'Cofre de segredos criptografado e governança de equipe.', pl: 'Szyfrowany sejf sekretów i zarządzanie zespołem.', ru: 'Зашифрованное хранилище секретов и управление командой.' },
}

// ---- localizers (operate on plain catalog/template objects) -----------------

/** Return a provider clone with subtitle + section titles localized. Name kept (brand). */
export function localizeProvider<T extends { id: string; subtitle?: string; sections?: { title: string; templateIds: string[] }[] }>(provider: T, lang: string): T {
  if (!provider || lang === 'en') return provider
  const subtitle = provider.subtitle ? cHub(lang, `hub.sub.${hubSlug(provider.subtitle)}`, provider.subtitle) : provider.subtitle
  const sections = (provider.sections || []).map(s => ({
    ...s,
    title: cHub(lang, `hub.sec.${hubSlug(s.title)}`, cHub(lang, `hub.sub.${hubSlug(s.title)}`, s.title)),
  }))
  return { ...provider, subtitle, sections }
}

/** Return a template clone with label, description, field labels + option labels localized. */
export function localizeTemplate<T extends { id: string; label?: string; description?: string; fields?: any[] }>(template: T, lang: string): T {
  if (!template || lang === 'en') return template
  const label = template.label ? cHub(lang, `hub.tpl.${template.id}.label`, template.label) : template.label
  const description = template.description ? cHub(lang, `hub.tpl.${template.id}.desc`, template.description) : template.description
  const fields = (template.fields || []).map((f: any) => ({
    ...f,
    label: f?.label ? cHub(lang, `hub.fld.${hubSlug(f.label)}`, f.label) : f?.label,
    options: Array.isArray(f?.options) ? f.options.map((o: any) => ({ ...o, label: o?.label ? cHub(lang, `hub.opt.${hubSlug(o.label)}`, o.label) : o?.label })) : f?.options,
  }))
  return { ...template, label, description, fields }
}
