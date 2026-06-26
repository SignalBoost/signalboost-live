// saas/lib/i18n/reportLanguage.ts
// Shared language helpers for Audit/Cybersecurity reports.
// This keeps generated report text aligned with the selected UI language.

export type ReportLang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const SUPPORTED: ReportLang[] = ['en', 'es', 'pt', 'pl', 'ru']

export function normalizeReportLang(value?: string | null): ReportLang {
  const lower = String(value || '').toLowerCase()
  return SUPPORTED.find((lang) => lower.startsWith(lang)) || 'en'
}

export function reportLangFromCookie(cookieHeader?: string | null): ReportLang {
  const cookie = String(cookieHeader || '')
  const found = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('signalboost_language=') || part.startsWith('site-language='))
  if (!found) return 'en'
  return normalizeReportLang(decodeURIComponent(found.split('=').slice(1).join('=') || ''))
}

export function reportLanguageName(lang?: string | null): string {
  const safe = normalizeReportLang(lang)
  return { en: 'English', es: 'Spanish', pt: 'Portuguese', pl: 'Polish', ru: 'Russian' }[safe]
}

type FindingText = { category?: string; title?: string; detail?: string; recommendation?: string }

type GenericCopy = {
  i18nDetail: (text: string) => string
  i18nRecommendation: string
  buttonDetail: string
  buttonRecommendation: string
  xPoweredTitle: string
  xPoweredDetail: string
  xPoweredRecommendation: string
  remotePatternTitle: string
  remotePatternDetail: string
  remotePatternRecommendation: string
}

const CATEGORY: Record<ReportLang, Record<string, string>> = {
  en: {},
  es: { 'i18n-raw-string': 'texto sin i18n', 'ux-dead-link': 'enlace sin destino', 'ux-dead-click': 'clic sin acción', 'ux-placeholder': 'texto provisional', authorization: 'autorización', 'logic-flaw': 'fallo lógico', 'resource-exhaustion': 'agotamiento de recursos', quota: 'cuota', standards: 'estándares', 'Information Disclosure': 'Divulgación de información', 'information disclosure': 'divulgación de información' },
  pt: { 'i18n-raw-string': 'texto sem i18n', 'ux-dead-link': 'link sem destino', 'ux-dead-click': 'clique sem ação', 'ux-placeholder': 'texto provisório', authorization: 'autorização', 'logic-flaw': 'falha lógica', 'resource-exhaustion': 'exaustão de recursos', quota: 'cota', standards: 'padrões', 'Information Disclosure': 'Divulgação de informações', 'information disclosure': 'divulgação de informações' },
  pl: { 'i18n-raw-string': 'tekst bez i18n', 'ux-dead-link': 'martwy link', 'ux-dead-click': 'kliknięcie bez akcji', 'ux-placeholder': 'tekst zastępczy', authorization: 'autoryzacja', 'logic-flaw': 'błąd logiczny', 'resource-exhaustion': 'wyczerpanie zasobów', quota: 'limit', standards: 'standardy', 'Information Disclosure': 'Ujawnianie informacji', 'information disclosure': 'ujawnianie informacji' },
  ru: { 'i18n-raw-string': 'текст без i18n', 'ux-dead-link': 'нерабочая ссылка', 'ux-dead-click': 'клик без действия', 'ux-placeholder': 'временный текст', authorization: 'авторизация', 'logic-flaw': 'логическая ошибка', 'resource-exhaustion': 'исчерпание ресурсов', quota: 'лимит', standards: 'стандарты', 'Information Disclosure': 'Раскрытие информации', 'information disclosure': 'раскрытие информации' },
}

const TITLE: Record<ReportLang, Record<string, string>> = {
  en: {},
  es: { 'Raw text not wired to i18n': 'Texto visible no conectado a i18n', 'Possible dead button (no handler)': 'Posible botón sin acción', 'Dead link (href="#")': 'Enlace sin destino (href="#")', 'Dead link (javascript:void(0))': 'Enlace sin destino (javascript:void(0))', 'Dead click (empty / no-op handler)': 'Clic sin acción (handler vacío)', 'Placeholder text: "Coming soon"': 'Texto provisional: "Coming soon"', 'Placeholder text: "Not tracked yet"': 'Texto provisional: "Not tracked yet"', 'Placeholder text: Lorem ipsum': 'Texto provisional: Lorem ipsum', 'Unfinished marker (TODO/FIXME)': 'Marcador inacabado (TODO/FIXME)', 'Next.js X-Powered-By header is not disabled': 'La cabecera X-Powered-By de Next.js no está desactivada', 'Image remote pattern is broader than necessary': 'El patrón remoto de imágenes es más amplio de lo necesario' },
  pt: { 'Raw text not wired to i18n': 'Texto visível não conectado ao i18n', 'Possible dead button (no handler)': 'Possível botão sem ação', 'Dead link (href="#")': 'Link sem destino (href="#")', 'Dead link (javascript:void(0))': 'Link sem destino (javascript:void(0))', 'Dead click (empty / no-op handler)': 'Clique sem ação (handler vazio)', 'Placeholder text: "Coming soon"': 'Texto provisório: "Coming soon"', 'Placeholder text: "Not tracked yet"': 'Texto provisório: "Not tracked yet"', 'Placeholder text: Lorem ipsum': 'Texto provisório: Lorem ipsum', 'Unfinished marker (TODO/FIXME)': 'Marcador inacabado (TODO/FIXME)', 'Next.js X-Powered-By header is not disabled': 'O cabeçalho X-Powered-By do Next.js não está desativado', 'Image remote pattern is broader than necessary': 'O padrão remoto de imagens é mais amplo do que o necessário' },
  pl: { 'Raw text not wired to i18n': 'Tekst widoczny dla użytkownika nie jest podłączony do i18n', 'Possible dead button (no handler)': 'Możliwy przycisk bez akcji', 'Dead link (href="#")': 'Martwy link (href="#")', 'Dead link (javascript:void(0))': 'Martwy link (javascript:void(0))', 'Dead click (empty / no-op handler)': 'Kliknięcie bez akcji (pusty handler)', 'Placeholder text: "Coming soon"': 'Tekst zastępczy: "Coming soon"', 'Placeholder text: "Not tracked yet"': 'Tekst zastępczy: "Not tracked yet"', 'Placeholder text: Lorem ipsum': 'Tekst zastępczy: Lorem ipsum', 'Unfinished marker (TODO/FIXME)': 'Niedokończony marker (TODO/FIXME)', 'Next.js X-Powered-By header is not disabled': 'Nagłówek X-Powered-By w Next.js nie jest wyłączony', 'Image remote pattern is broader than necessary': 'Wzorzec zdalnych obrazów jest szerszy niż potrzebny' },
  ru: { 'Raw text not wired to i18n': 'Пользовательский текст не подключён к i18n', 'Possible dead button (no handler)': 'Возможная кнопка без действия', 'Dead link (href="#")': 'Нерабочая ссылка (href="#")', 'Dead link (javascript:void(0))': 'Нерабочая ссылка (javascript:void(0))', 'Dead click (empty / no-op handler)': 'Клик без действия (пустой обработчик)', 'Placeholder text: "Coming soon"': 'Временный текст: "Coming soon"', 'Placeholder text: "Not tracked yet"': 'Временный текст: "Not tracked yet"', 'Placeholder text: Lorem ipsum': 'Временный текст: Lorem ipsum', 'Unfinished marker (TODO/FIXME)': 'Незавершённый маркер (TODO/FIXME)', 'Next.js X-Powered-By header is not disabled': 'Заголовок X-Powered-By в Next.js не отключён', 'Image remote pattern is broader than necessary': 'Шаблон удалённых изображений шире, чем нужно' },
}

const GENERIC: Record<ReportLang, GenericCopy> = {
  en: { i18nDetail: (text) => `User-facing text "${text}" is hardcoded in JSX rather than wrapped in the i18n hook.`, i18nRecommendation: "Wrap it with t('namespace.key', 'fallback') via useTranslation() and add the key to all locale dictionaries. Heuristic — verify it is genuinely user-facing copy.", buttonDetail: 'A <button> has no onClick handler and is not a submit button — likely a dead click. Verify this is not a false positive.', buttonRecommendation: 'Bind an onClick to the action, turn it into a link with a real href, set type="submit" inside a form, or remove the control.', xPoweredTitle: 'Next.js X-Powered-By header is not disabled', xPoweredDetail: 'The configuration does not set `poweredByHeader: false`, so Next.js may expose the `X-Powered-By` header by default. This can reveal framework information to attackers and add fingerprinting.', xPoweredRecommendation: 'Set `poweredByHeader: false` in `nextConfig` to reduce framework fingerprinting.', remotePatternTitle: 'Image remote pattern is broader than necessary', remotePatternDetail: 'The image remote pattern allows a wider external image source than necessary. A broad allowlist increases exposure to untrusted remote media.', remotePatternRecommendation: 'Restrict remote image patterns to the exact protocol, hostname, and path patterns required by the application.' },
  es: { i18nDetail: (text) => `El texto visible "${text}" está escrito directamente en JSX en vez de usar el sistema i18n.`, i18nRecommendation: "Envuélvelo con t('namespace.key', 'fallback') mediante useTranslation() y agrega la clave a todos los diccionarios de idioma. Verifica que realmente sea texto visible para el usuario.", buttonDetail: 'Un <button> no tiene onClick y tampoco es de tipo submit; probablemente es un clic sin acción. Verifica que no sea un falso positivo.', buttonRecommendation: 'Conecta un onClick a la acción, conviértelo en un enlace con href real, usa type="submit" dentro de un formulario o elimina el control.', xPoweredTitle: 'La cabecera X-Powered-By de Next.js no está desactivada', xPoweredDetail: 'La configuración no establece `poweredByHeader: false`, por lo que Next.js puede exponer la cabecera `X-Powered-By` por defecto. Esto puede revelar información del framework y facilitar fingerprinting.', xPoweredRecommendation: 'Configura `poweredByHeader: false` en `nextConfig` para reducir el fingerprinting del framework.', remotePatternTitle: 'El patrón remoto de imágenes es más amplio de lo necesario', remotePatternDetail: 'El patrón remoto de imágenes permite una fuente externa más amplia de lo necesario. Una lista amplia aumenta la exposición a medios remotos no confiables.', remotePatternRecommendation: 'Restringe los patrones remotos de imágenes al protocolo, hostname y rutas exactas que necesita la aplicación.' },
  pt: { i18nDetail: (text) => `O texto visível "${text}" está escrito diretamente no JSX em vez de usar o sistema i18n.`, i18nRecommendation: "Envolva com t('namespace.key', 'fallback') via useTranslation() e adicione a chave a todos os dicionários de idioma. Verifique se é realmente texto visível ao usuário.", buttonDetail: 'Um <button> não tem onClick e também não é do tipo submit; provavelmente é um clique sem ação. Verifique se não é falso positivo.', buttonRecommendation: 'Conecte um onClick à ação, transforme em um link com href real, use type="submit" dentro de um formulário ou remova o controle.', xPoweredTitle: 'O cabeçalho X-Powered-By do Next.js não está desativado', xPoweredDetail: 'A configuração não define `poweredByHeader: false`, então o Next.js pode expor o cabeçalho `X-Powered-By` por padrão. Isso pode revelar informações do framework e facilitar fingerprinting.', xPoweredRecommendation: 'Defina `poweredByHeader: false` em `nextConfig` para reduzir o fingerprinting do framework.', remotePatternTitle: 'O padrão remoto de imagens é mais amplo do que o necessário', remotePatternDetail: 'O padrão remoto de imagens permite uma fonte externa mais ampla do que o necessário. Uma lista ampla aumenta a exposição a mídia remota não confiável.', remotePatternRecommendation: 'Restrinja os padrões remotos de imagens ao protocolo, hostname e caminhos exatos exigidos pela aplicação.' },
  pl: { i18nDetail: (text) => `Tekst widoczny dla użytkownika "${text}" jest wpisany bezpośrednio w JSX zamiast używać systemu i18n.`, i18nRecommendation: "Owiń go przez t('namespace.key', 'fallback') z useTranslation() i dodaj klucz do wszystkich słowników językowych. Sprawdź, czy to naprawdę tekst widoczny dla użytkownika.", buttonDetail: 'Element <button> nie ma onClick i nie jest przyciskiem submit; prawdopodobnie jest to kliknięcie bez akcji. Sprawdź, czy to nie fałszywy alarm.', buttonRecommendation: 'Podłącz onClick do właściwej akcji, zamień element na link z prawdziwym href, ustaw type="submit" w formularzu albo usuń kontrolkę.', xPoweredTitle: 'Nagłówek X-Powered-By w Next.js nie jest wyłączony', xPoweredDetail: 'Konfiguracja nie ustawia `poweredByHeader: false`, więc Next.js może domyślnie ujawniać nagłówek `X-Powered-By`. Może to ujawniać informacje o frameworku i ułatwiać fingerprinting.', xPoweredRecommendation: 'Ustaw `poweredByHeader: false` w `nextConfig`, aby ograniczyć fingerprinting frameworku.', remotePatternTitle: 'Wzorzec zdalnych obrazów jest szerszy niż potrzebny', remotePatternDetail: 'Wzorzec zdalnych obrazów dopuszcza szersze źródło zewnętrzne niż potrzeba. Szeroka lista zwiększa ekspozycję na niezaufane zdalne media.', remotePatternRecommendation: 'Ogranicz zdalne wzorce obrazów do dokładnego protokołu, hosta i ścieżek wymaganych przez aplikację.' },
  ru: { i18nDetail: (text) => `Пользовательский текст "${text}" прописан напрямую в JSX вместо использования системы i18n.`, i18nRecommendation: "Оберните его через t('namespace.key', 'fallback') с useTranslation() и добавьте ключ во все языковые словари. Проверьте, что это действительно пользовательский текст.", buttonDetail: 'У <button> нет onClick, и он не является submit-кнопкой; вероятно, это клик без действия. Проверьте, не ложное ли это срабатывание.', buttonRecommendation: 'Подключите onClick к нужному действию, замените на ссылку с реальным href, используйте type="submit" внутри формы или удалите элемент.', xPoweredTitle: 'Заголовок X-Powered-By в Next.js не отключён', xPoweredDetail: 'Конфигурация не задаёт `poweredByHeader: false`, поэтому Next.js может по умолчанию раскрывать заголовок `X-Powered-By`. Это может раскрыть сведения о framework и облегчить fingerprinting.', xPoweredRecommendation: 'Установите `poweredByHeader: false` в `nextConfig`, чтобы уменьшить fingerprinting framework.', remotePatternTitle: 'Шаблон удалённых изображений шире, чем нужно', remotePatternDetail: 'Шаблон удалённых изображений разрешает более широкий внешний источник, чем необходимо. Широкий allowlist повышает риск работы с недоверенными удалёнными медиа.', remotePatternRecommendation: 'Ограничьте remote image patterns точным протоколом, hostname и путями, которые действительно нужны приложению.' },
}

function quoted(value?: string) { const match = String(value || '').match(/"([^"]+)"/); return match?.[1] || '' }
function includesTitle(finding: FindingText, needle: string) { return String(finding.title || '').toLowerCase().includes(needle.toLowerCase()) }

export function localizeKnownFindingText(finding: FindingText, lang?: string | null): FindingText {
  const safe = normalizeReportLang(lang)
  if (safe === 'en') return finding
  const out: FindingText = { ...finding }
  const copy = GENERIC[safe]
  if (finding.category) out.category = CATEGORY[safe][finding.category] || CATEGORY[safe][String(finding.category).toLowerCase()] || finding.category
  if (finding.title) out.title = TITLE[safe][finding.title] || finding.title

  if (includesTitle(finding, 'Raw text not wired to i18n')) { out.detail = copy.i18nDetail(quoted(finding.detail)); out.recommendation = copy.i18nRecommendation }
  if (includesTitle(finding, 'Possible dead button')) { out.title = TITLE[safe]['Possible dead button (no handler)'] || out.title; out.detail = copy.buttonDetail; out.recommendation = copy.buttonRecommendation }
  if (includesTitle(finding, 'X-Powered-By')) { out.title = copy.xPoweredTitle; out.detail = copy.xPoweredDetail; out.recommendation = copy.xPoweredRecommendation }
  if (includesTitle(finding, 'Image remote pattern')) { out.title = copy.remotePatternTitle; out.detail = copy.remotePatternDetail; out.recommendation = copy.remotePatternRecommendation }

  return out
}
