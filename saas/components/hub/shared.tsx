'use client'
import { uiCopy } from '@/lib/i18n/generatedUiCopy'


// saas/components/hub/shared.tsx
// Hub Console — shared design system, types, and translations.
// Every console page imports from here. One source of truth.

export type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'
export const LANGS: Lang[] = ['en', 'es', 'pt', 'pl', 'ru']

export type Tier = { name: string; priceId: string; amount: number; interval: string; mismatch: boolean }
export type Webhook = { url: string; status: string; events: number }
export type ScopeInfo = { scope: string; count: number; names: string[] }
export type HubData = {
  generatedAt: string
  stripe: { ok: boolean; tiers: Tier[]; webhooks: Webhook[]; mismatches: string[]; error?: string }
  supabase: { ok: boolean; latencyMs: number; projectHost: string; anonKeyMasked: string; error?: string }
  vercel: { ok: boolean; configured: boolean; scopes: ScopeInfo[]; error?: string }
  alerts: { stripeMismatches: string[]; envSync: string[] }
}

export type PageProps = { lang: Lang; data: HubData | null; loading: boolean; failed: boolean }

export const COPY: Record<string, Record<Lang, string>> = {
  title:        { en: uiCopy('u_30a693c21b08d668'), es: 'Consola Hub de SignalBoost', pt: 'Console Hub da SignalBoost', pl: 'Konsola Hub SignalBoost', ru: 'Консоль Hub SignalBoost' },
  phaseBadge:   { en: uiCopy('u_92cfe5153d093769'), es: 'En vivo, solo lectura', pt: 'Ao vivo, somente leitura', pl: 'Na żywo, tylko odczyt', ru: 'Живые данные, только чтение' },
  systemHealth: { en: uiCopy('u_2f49dd57b2999a17'), es: 'Estado del sistema', pt: 'Saúde do sistema', pl: 'Stan systemu', ru: 'Состояние системы' },
  refresh:      { en: uiCopy('u_95d077fc1bfa8bfb'), es: 'Actualizar', pt: 'Atualizar', pl: 'Odśwież', ru: 'Обновить' },
  loading:      { en: uiCopy('u_b67f7c3899f6499f'), es: 'Cargando datos en vivo…', pt: 'Carregando dados ao vivo…', pl: 'Ładowanie danych na żywo…', ru: 'Загрузка живых данных…' },
  loadError:    { en: uiCopy('u_b03ed085304383a4'), es: 'No se pudieron cargar los datos. Intenta actualizar.', pt: 'Não foi possível carregar os dados. Tente atualizar.', pl: 'Nie udało się załadować danych. Spróbuj odświeżyć.', ru: 'Не удалось загрузить данные. Попробуйте обновить.' },
  pageDashboard:{ en: uiCopy('u_2b3958d5b0d2443a'), es: 'Panel', pt: 'Painel', pl: 'Panel', ru: 'Панель' },
  pageVault:    { en: uiCopy('u_929c4bf34d4e1a5f'), es: 'Bóveda de Claves', pt: 'Cofre de Chaves', pl: 'Sejf Kluczy', ru: 'Хранилище ключей' },
  yourData:     { en: uiCopy('u_65d9f502ae867785'), es: 'Tus Datos', pt: 'Seus Dados', pl: 'Twoje Dane', ru: 'Ваши данные' },
  yourPayments: { en: uiCopy('u_37a47e4b0fa20c54'), es: 'Tus Pagos', pt: 'Seus Pagamentos', pl: 'Twoje Płatności', ru: 'Ваши платежи' },
  yourWebsite:  { en: uiCopy('u_535d48e31b70cab4'), es: 'Tu Sitio Web', pt: 'Seu Site', pl: 'Twoja Strona', ru: 'Ваш сайт' },
  yourTeam:     { en: uiCopy('u_1073d06a7e6acf8b'), es: 'Tu Equipo', pt: 'Sua Equipe', pl: 'Twój Zespół', ru: 'Ваша команда' },
  manageData:   { en: uiCopy('u_874a8e2e0d82e9ec'), es: 'Gestiona tus datos y cuentas.', pt: 'Gerencie seus dados e contas.', pl: 'Zarządzaj danymi i kontami.', ru: 'Управляйте данными и аккаунтами.' },
  managePay:    { en: uiCopy('u_cb6263422734cda2'), es: 'Gestiona tus pagos y planes.', pt: 'Gerencie seus pagamentos e planos.', pl: 'Zarządzaj płatnościami i planami.', ru: 'Управляйте платежами и тарифами.' },
  manageHost:   { en: uiCopy('u_c515b6bd0a101c27'), es: 'Gestiona tu alojamiento y versiones.', pt: 'Gerencie sua hospedagem e versões.', pl: 'Zarządzaj hostingiem i wersjami.', ru: 'Управляйте хостингом и версиями.' },
  manageTeam:   { en: uiCopy('u_2909a340aaebe499'), es: 'Gestiona roles e historial de actividad.', pt: 'Gerencie funções e histórico de atividade.', pl: 'Zarządzaj rolami i historią aktywności.', ru: 'Управляйте ролями и историей действий.' },
  statusDb:     { en: uiCopy('u_ffe6aaa5bbd70902'), es: 'Base de datos en línea', pt: 'Banco de dados online', pl: 'Baza danych działa', ru: 'База данных в сети' },
  statusDbDown: { en: uiCopy('u_c04ff30ca2c15242'), es: 'Problema con la base de datos', pt: 'Problema no banco de dados', pl: 'Problem z bazą danych', ru: 'Проблема с базой данных' },
  statusPay:    { en: uiCopy('u_7d643c332c1e1a9a'), es: 'Pagos conectados', pt: 'Pagamentos conectados', pl: 'Płatności połączone', ru: 'Платежи подключены' },
  statusPayDown:{ en: uiCopy('u_a9b9dd5e3bb06c1a'), es: 'Problema con pagos', pt: 'Problema nos pagamentos', pl: 'Problem z płatnościami', ru: 'Проблема с платежами' },
  statusHost:   { en: uiCopy('u_c12042d2d080f98c'), es: 'Alojamiento conectado', pt: 'Hospedagem conectada', pl: 'Hosting połączony', ru: 'Хостинг подключён' },
  statusNoToken:{ en: uiCopy('u_4f0dc140b241a942'), es: 'Aún no conectado', pt: 'Ainda não conectado', pl: 'Jeszcze nie połączono', ru: 'Ещё не подключено' },
  tokenHint:    { en: uiCopy('u_dbd0e1fb68a59790'), es: 'Agrega la variable de entorno VERCEL_TOKEN para activar esta tarjeta.', pt: 'Adicione a variável de ambiente VERCEL_TOKEN para ativar este cartão.', pl: 'Dodaj zmienną środowiskową VERCEL_TOKEN, aby aktywować tę kartę.', ru: 'Добавьте переменную окружения VERCEL_TOKEN, чтобы активировать эту карту.' },
  statusRoles:  { en: uiCopy('u_bd7d725f8de04aa6'), es: 'Roles asignados', pt: 'Funções atribuídas', pl: 'Role przypisane', ru: 'Роли назначены' },
  openSupabase: { en: uiCopy('u_9d64e6689a049afe'), es: 'Abrir Configuración de Supabase', pt: 'Abrir Configurações do Supabase', pl: 'Otwórz Ustawienia Supabase', ru: 'Открыть настройки Supabase' },
  openStripe:   { en: uiCopy('u_6151fb2b239a8e87'), es: 'Abrir Planes de Stripe', pt: 'Abrir Planos da Stripe', pl: 'Otwórz Plany Stripe', ru: 'Открыть тарифы Stripe' },
  openVercel:   { en: uiCopy('u_6dba04f48bb8d315'), es: 'Abrir Configuración de Vercel', pt: 'Abrir Configurações da Vercel', pl: 'Otwórz Ustawienia Vercel', ru: 'Открыть настройки Vercel' },
  openTeam:     { en: uiCopy('u_a6ba9503b2703cac'), es: 'Abrir Actividad del Equipo', pt: 'Abrir Atividade da Equipe', pl: 'Otwórz Aktywność Zespołu', ru: 'Открыть активность команды' },
  showDetails:  { en: uiCopy('u_e4656707fd7d455c'), es: 'Mostrar detalles', pt: 'Mostrar detalhes', pl: 'Pokaż szczegóły', ru: 'Показать детали' },
  hideDetails:  { en: uiCopy('u_f104732b20a3acc6'), es: 'Ocultar detalles', pt: 'Ocultar detalhes', pl: 'Ukryj szczegóły', ru: 'Скрыть детали' },
  projectUrl:   { en: uiCopy('u_39aa6c2719002184'), es: 'Proyecto', pt: 'Projeto', pl: 'Projekt', ru: 'Проект' },
  anonKey:      { en: uiCopy('u_6112f9bd88ae76b2'), es: 'Clave anónima pública', pt: 'Chave anônima pública', pl: 'Publiczny klucz anon', ru: 'Публичный anon-ключ' },
  latency:      { en: uiCopy('u_21547134e64e8320'), es: 'Tiempo de respuesta', pt: 'Tempo de resposta', pl: 'Czas odpowiedzi', ru: 'Время ответа' },
  webhooks:     { en: uiCopy('u_5308035675ba63c9'), es: 'Suscripciones de webhooks', pt: 'Assinaturas de webhooks', pl: 'Subskrypcje webhooków', ru: 'Подписки вебхуков' },
  events:       { en: uiCopy('u_6043c728b6744e7b'), es: 'eventos', pt: 'eventos', pl: 'zdarzeń', ru: 'событий' },
  priceIds:     { en: uiCopy('u_7d5e04a9abd8b4c7'), es: 'IDs de precios', pt: 'IDs de preços', pl: 'ID cen', ru: 'ID цен' },
  envVars:      { en: uiCopy('u_38fa6520c5cd4085'), es: 'Nombres de variables (valores ocultos)', pt: 'Nomes de variáveis (valores ocultos)', pl: 'Nazwy zmiennych (wartości ukryte)', ru: 'Имена переменных (значения скрыты)' },
  timeline:     { en: uiCopy('u_054feead593e10ed'), es: 'Línea de actividad (ejemplo)', pt: 'Linha de atividade (exemplo)', pl: 'Oś aktywności (przykład)', ru: 'Лента активности (пример)' },
  allClear:     { en: uiCopy('u_8714ab00467640a0'), es: 'Todos los sistemas sincronizados — sin problemas.', pt: 'Todos os sistemas sincronizados — nenhum problema.', pl: 'Wszystkie systemy zsynchronizowane — brak problemów.', ru: 'Все системы синхронизированы — проблем нет.' },
  fixStripe:    { en: uiCopy('u_54dfee13a030a129'), es: 'Corregir en Stripe', pt: 'Corrigir na Stripe', pl: 'Napraw w Stripe', ru: 'Исправить в Stripe' },
  fixVercel:    { en: uiCopy('u_93dc47af02ea0c73'), es: 'Corregir en Vercel', pt: 'Corrigir na Vercel', pl: 'Napraw w Vercel', ru: 'Исправить в Vercel' },
  roleBilling:  { en: uiCopy('u_2aa85302a0353aa1'), es: 'Admin de Facturación', pt: 'Admin de Cobrança', pl: 'Admin Rozliczeń', ru: 'Админ биллинга' },
  roleDev:      { en: uiCopy('u_ad50311cd3167b26'), es: 'Desarrollador', pt: 'Desenvolvedor', pl: 'Programista', ru: 'Разработчик' },
  roleTeam:     { en: uiCopy('u_90be944affda5c83'), es: 'Miembro del Equipo', pt: 'Membro da Equipe', pl: 'Członek Zespołu', ru: 'Участник команды' },
  futureTitle:  { en: uiCopy('u_5ad50041eec5d4d1'), es: 'Espacios de proveedor listos', pt: 'Slots de provedores prontos', pl: 'Gotowe miejsca na dostawców', ru: 'Слоты для провайдеров готовы' },
  futureNote:   { en: uiCopy('u_f8e86f68c3cf49ac'), es: 'Cada nuevo proveedor es una tarjeta. Planificado para la fase de expansión de IA.', pt: 'Cada novo provedor é um cartão. Planejado para a fase de expansão de IA.', pl: 'Każdy nowy dostawca to jedna karta. Zaplanowane na fazę ekspansji AI.', ru: 'Каждый новый провайдер — одна карта. Запланировано на фазу расширения ИИ.' },
  vaultTitle:   { en: uiCopy('u_00cc4abca6ddf480'), es: 'Inventario de credenciales', pt: 'Inventário de credenciais', pl: 'Inwentarz poświadczeń', ru: 'Инвентарь учётных данных' },
  vaultSub:     { en: uiCopy('u_4a128b227e72791a'), es: 'Cada clave que usa tu plataforma — solo nombres y cobertura. Los valores nunca se muestran ni se guardan aquí.', pt: 'Cada chave que sua plataforma usa — apenas nomes e cobertura. Os valores nunca são mostrados ou armazenados aqui.', pl: 'Każdy klucz używany przez platformę — tylko nazwy i pokrycie. Wartości nigdy nie są pokazywane ani przechowywane.', ru: 'Каждый ключ платформы — только имена и покрытие. Значения никогда не показываются и не хранятся.' },
  vaultCoverage:{ en: uiCopy('u_b6013f4ff6426c72'), es: 'Cobertura de entornos', pt: 'Cobertura de ambientes', pl: 'Pokrycie środowisk', ru: 'Покрытие окружений' },
  vaultMissing: { en: uiCopy('u_20b0b9a0eadac59b'), es: 'falta en', pt: 'faltando em', pl: 'brakuje w', ru: 'отсутствует в' },
  vaultOther:   { en: uiCopy('u_c243ff8a7949e66a'), es: 'Otros', pt: 'Outros', pl: 'Inne', ru: 'Прочее' },
  vaultNeedsToken:{ en: uiCopy('u_07bc1a0bfa1c6505'), es: 'La Bóveda lee desde Vercel. Agrega la variable VERCEL_TOKEN para activarla.', pt: 'O Cofre lê da Vercel. Adicione a variável VERCEL_TOKEN para ativá-lo.', pl: 'Sejf czyta z Vercel. Dodaj zmienną VERCEL_TOKEN, aby go aktywować.', ru: 'Хранилище читает из Vercel. Добавьте переменную VERCEL_TOKEN для активации.' },
  vaultKeys:    { en: uiCopy('u_b22114d5d9dcedb6'), es: 'claves', pt: 'chaves', pl: 'kluczy', ru: 'ключей' },
}

export function c(key: string, lang: Lang): string {
  const entry = COPY[key]
  if (!entry) return key
  return entry[lang] || entry.en
}


// ═══════════════════════════════════════════════════════════════════════════
// DESIGN SYSTEM — one source of truth for the entire Hub Console.
// Principles: calm deep-navy surfaces, hairline structure, a restrained
// gold/cyan accent pair used in small deliberate doses, and a consistent
// type + spacing + radius scale. Refine values here and every provider,
// card, and page updates in lockstep.
// ═══════════════════════════════════════════════════════════════════════════

// Surfaces
export const SURFACE = {
  page:   '#080c16',
  raised: 'linear-gradient(165deg, rgba(22,31,54,.55), rgba(8,12,22,.86))',
  sunken: 'rgba(4,8,16,.55)',
  inset:  'rgba(255,255,255,.03)',
  insetStrong: 'rgba(255,255,255,.05)',
}

// Hairline borders
export const LINE = {
  faint:  'rgba(255,255,255,.06)',
  soft:   'rgba(255,255,255,.10)',
  medium: 'rgba(255,255,255,.16)',
}

// Text levels (a clear ramp, not a rainbow)
export const TEXT = {
  primary:   uiCopy('u_8cc04cf65ad3a56d'),
  secondary: uiCopy('u_ff91d5113196dbe0'),
  muted:     uiCopy('u_6a8ed9c104843e61'),
  faint:     uiCopy('u_e7953ee734116773'),
}

// Brand accents — used sparingly for emphasis and interactivity
export const ACCENT = { gold: '#ffc300', cyan: '#1af0ff' }

// Semantic status colors (softened, less neon)
export const SEMANTIC = { green: '#34d399', amber: '#fbbf24', red: '#f87171' }

// Geometry — one consistent family
export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 }
export const SPACE  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 }

// Elevation — restrained, no glow
export const SHADOW = {
  sm: '0 1px 2px rgba(0,0,0,.28)',
  md: '0 10px 30px rgba(0,0,0,.34)',
  lg: '0 24px 64px rgba(0,0,0,.46)',
}

// Type
export const FONT = {
  sans: 'inherit',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
export const TYPE = {
  display: { fontSize: 20, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.2 },
  title:   { fontSize: 16, fontWeight: 700, letterSpacing: '-.005em', lineHeight: 1.25 },
  body:    { fontSize: 13, fontWeight: 500, lineHeight: 1.5 },
  small:   { fontSize: 12, fontWeight: 500, lineHeight: 1.45 },
  eyebrow: { fontSize: 10, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' as const },
}

// Tone palette (refined: calmer fills, hairline borders). Same shape + keys.
export type Tone = { strong: string; soft: string; border: string }
export const TONES: Record<string, Tone> = {
  green:  { strong: '#34d399', soft: 'rgba(52,211,153,.12)',  border: 'rgba(52,211,153,.30)' },
  blue:   { strong: '#60a5fa', soft: 'rgba(96,165,250,.12)',  border: 'rgba(96,165,250,.30)' },
  purple: { strong: '#a78bfa', soft: 'rgba(167,139,250,.12)', border: 'rgba(167,139,250,.30)' },
  gray:   { strong: '#94a3b8', soft: 'rgba(148,163,184,.10)', border: 'rgba(148,163,184,.26)' },
  gold:   { strong: '#ffc300', soft: 'rgba(255,195,0,.10)',   border: 'rgba(255,195,0,.30)' },
  cyan:   { strong: '#1af0ff', soft: 'rgba(26,240,255,.10)',  border: 'rgba(26,240,255,.30)' },
}

// ── Core style tokens (same export names — used across every Hub page) ──────
export const cardStyle: React.CSSProperties = {
  background: SURFACE.raised,
  border: `1px solid ${LINE.soft}`,
  borderRadius: RADIUS.lg,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: SHADOW.md,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflow: 'hidden',
}

export const bodyStyle: React.CSSProperties = {
  padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.xl}px`,
  display: 'flex',
  flexDirection: 'column',
  gap: SPACE.md,
  flex: 1,
  minHeight: 0,
}

export const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: TEXT.muted,
}

export const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: SPACE.md,
  padding: `${SPACE.sm + 2}px ${SPACE.md}px`,
  background: SURFACE.inset,
  border: `1px solid ${LINE.faint}`,
  borderRadius: RADIUS.md,
  fontSize: 13,
}

export const monoStyle: React.CSSProperties = {
  fontFamily: FONT.mono,
  fontSize: 12,
  color: TEXT.secondary,
}

// Shared interactive surfaces (exported for forms/inputs across the Hub)
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: `${SPACE.sm + 3}px ${SPACE.md}px`,
  borderRadius: RADIUS.md,
  border: `1px solid ${LINE.medium}`,
  background: SURFACE.sunken,
  color: TEXT.primary,
  fontSize: 13,
  fontFamily: FONT.sans,
  outline: 'none',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
}

export const primaryBtnStyle: React.CSSProperties = {
  padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
  borderRadius: RADIUS.md,
  border: `1px solid ${ACCENT.cyan}`,
  background: 'rgba(26,240,255,.12)',
  color: ACCENT.cyan,
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: '.01em',
  cursor: 'pointer',
}

export const ghostBtnStyle: React.CSSProperties = {
  padding: `${SPACE.sm + 2}px ${SPACE.lg}px`,
  borderRadius: RADIUS.md,
  border: `1px solid ${LINE.medium}`,
  background: SURFACE.inset,
  color: TEXT.secondary,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
}

// ── Component primitives (same signatures, refined visuals) ────────────────
export function Dot({ tone }: { tone: 'green' | 'yellow' | 'red' }) {
  const color = tone === 'green' ? SEMANTIC.green : tone === 'yellow' ? ACCENT.gold : SEMANTIC.red
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22`, display: 'inline-block', flexShrink: 0 }} />
}

export function Band({ tone, icon, title, plain, sub }: { tone: Tone; icon: string; title: string; plain: string; sub: string }) {
  return (
    <div style={{ padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.md}px`, background: `linear-gradient(135deg, ${tone.soft}, rgba(8,12,22,0) 72%)`, borderBottom: `1px solid ${LINE.soft}`, position: 'relative' }}>
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: 56, background: tone.strong, opacity: .85 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md }}>
        <span style={{ width: 42, height: 42, borderRadius: RADIUS.md, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, background: tone.soft, border: `1px solid ${tone.border}`, flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)' }}>{icon}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' }}>
            <span style={{ ...TYPE.display, color: TEXT.primary }}>{title}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: tone.strong }}>{plain}</span>
          </div>
          <div style={{ ...TYPE.small, color: TEXT.secondary, marginTop: 2 }}>{sub}</div>
        </div>
      </div>
    </div>
  )
}

export function Status({ ok, text }: { ok: boolean; text: string }) {
  const color = ok ? SEMANTIC.green : ACCENT.gold
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: 13, fontWeight: 600, color }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}22`, flexShrink: 0 }} />
      {text}
    </div>
  )
}

export function ActionButton({ tone, label, href }: { tone: Tone; label: string; href: string }) {
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="hub-btn" style={{ marginTop: 'auto', display: 'block', textAlign: 'center', padding: `${SPACE.sm + 3}px ${SPACE.lg}px`, borderRadius: RADIUS.md, border: `1px solid ${tone.border}`, background: tone.soft, color: TEXT.primary, fontSize: 13, fontWeight: 700, letterSpacing: '.01em', textDecoration: 'none', transition: 'background .15s ease, border-color .15s ease' }}>{label}</a>
  )
}

export function DetailsToggle({ open, onClick, lang }: { open: boolean; onClick: () => void; lang: Lang }) {
  return (
    <button onClick={onClick} className="hub-chip" style={{ alignSelf: 'flex-start', padding: `${SPACE.xs + 2}px ${SPACE.md + 1}px`, borderRadius: RADIUS.pill, fontSize: 12, fontWeight: 600, background: SURFACE.inset, border: `1px solid ${LINE.medium}`, color: TEXT.secondary, cursor: 'pointer' }}>{open ? '▴ ' + c('hideDetails', lang) : '▾ ' + c('showDetails', lang)}</button>
  )
}
