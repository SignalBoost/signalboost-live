// saas/lib/i18n/uiText.ts
import en from '@/locales/en.json' with { type: 'json' }
import type { Dict } from '@/lib/i18n/loadLanguage'

const ENGLISH = en as Dict
let activeDictionary: Dict = ENGLISH

function lookup(dict: Dict | null | undefined, path: string): unknown {
  if (!dict) return undefined
  return path
    .split('.')
    .reduce<unknown>((value, key) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      return (value as Record<string, unknown>)[key]
    }, dict)
}

export function setRuntimeDictionary(dict: Dict | null | undefined): void {
  if (typeof window === 'undefined') return
  activeDictionary = dict ?? ENGLISH
}

export function uiText<T extends string = string>(path: string): T {
  const active = lookup(activeDictionary, path)
  if (typeof active === 'string') return active as T

  const english = lookup(ENGLISH, path)
  if (typeof english === 'string') return english as T

  return path as T
}

export type WebsiteOptimizerReportLang = 'en' | 'pt' | 'es' | 'pl' | 'ru'

type IssueCopy = { title: string; detail: (value?: string | number | boolean) => string }

export type WebsiteOptimizerReportCopy = {
  medium: string
  low: string
  metrics: string
  html: string
  titleLength: string
  descriptionLength: string
  scripts: string
  stylesheets: string
  images: string
  missingAlt: string
  h1: string
  lazyImages: string
  detailLabel: string
  fixLabel: string
  genericFinding: string
  genericDetail: (category: string, value?: string | number | boolean) => string
  issueCopy: Record<string, IssueCopy>
  fixes: Record<'performance' | 'seo' | 'accessibility' | 'security' | 'conversion', string>
}

export const WEBSITE_OPTIMIZER_REPORT_COPY: Record<WebsiteOptimizerReportLang, WebsiteOptimizerReportCopy> = {
  en: {
    medium: 'Medium', low: 'Low', metrics: 'Page metrics', html: 'HTML', titleLength: 'Title length', descriptionLength: 'Description length', scripts: 'Scripts', stylesheets: 'Stylesheets', images: 'Images', missingAlt: 'Images missing alt', h1: 'H1 count', lazyImages: 'Lazy-loaded images', detailLabel: 'What we found', fixLabel: 'Recommended fix', genericFinding: 'Optimization opportunity detected',
    genericDetail: (category, value) => value === undefined ? `This ${category} signal needs review.` : `This ${category} signal needs review. Observed value: ${value}.`,
    issueCopy: {
      large_html: { title: 'Large HTML page', detail: value => `The page HTML is about ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB, which can increase transfer and rendering work.` },
      many_scripts: { title: 'Too many JavaScript elements', detail: value => `The page contains ${value ?? 0} script elements, which can increase browser work and slow interaction.` },
      title_length: { title: 'Page title needs improvement', detail: value => `The page title is ${value ?? 0} characters long. Search titles are usually clearer when they are descriptive and appropriately sized.` },
      h1_count: { title: 'Primary H1 heading is missing or duplicated', detail: value => Number(value) === 0 ? 'No H1 heading was detected on this page.' : `${value} H1 headings were detected. A page normally benefits from one clear primary H1.` },
      missing_cta: { title: 'No clear call to action detected', detail: () => 'The scan did not detect an obvious next step such as signup, demo, pricing, quote, booking, or contact.' },
    },
    fixes: { performance: 'Improve loading speed, caching, image handling, and unnecessary scripts.', seo: 'Improve metadata, page structure, search visibility, and social previews.', accessibility: 'Improve accessibility signals such as language, image text, and semantic structure.', security: 'Improve public security headers and HTTPS trust signals.', conversion: 'Add a clear next step such as signup, demo, pricing, quote, or booking.' },
  },
  pt: {
    medium: 'Média', low: 'Baixa', metrics: 'Métricas da página', html: 'HTML', titleLength: 'Tamanho do título', descriptionLength: 'Tamanho da descrição', scripts: 'Scripts', stylesheets: 'Folhas de estilo', images: 'Imagens', missingAlt: 'Imagens sem alt', h1: 'Quantidade de H1', lazyImages: 'Imagens com lazy loading', detailLabel: 'O que encontramos', fixLabel: 'Correção recomendada', genericFinding: 'Oportunidade de otimização detectada',
    genericDetail: (category, value) => value === undefined ? `Este sinal de ${category} precisa de revisão.` : `Este sinal de ${category} precisa de revisão. Valor observado: ${value}.`,
    issueCopy: {
      large_html: { title: 'Página HTML muito grande', detail: value => `O HTML da página tem cerca de ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB, o que pode aumentar transferência e processamento.` },
      many_scripts: { title: 'JavaScript em excesso', detail: value => `A página contém ${value ?? 0} elementos de script, o que pode aumentar o trabalho do navegador e atrasar a interação.` },
      title_length: { title: 'O título da página precisa melhorar', detail: value => `O título tem ${value ?? 0} caracteres. Títulos descritivos e com tamanho adequado tendem a funcionar melhor em busca.` },
      h1_count: { title: 'H1 principal ausente ou duplicado', detail: value => Number(value) === 0 ? 'Nenhum título H1 foi detectado nesta página.' : `Foram detectados ${value} títulos H1. Normalmente, uma página se beneficia de um único H1 principal claro.` },
      missing_cta: { title: 'Nenhuma chamada para ação clara detectada', detail: () => 'A verificação não encontrou um próximo passo óbvio, como cadastro, demo, preços, orçamento, reserva ou contato.' },
    },
    fixes: { performance: 'Melhore velocidade de carga, cache, imagens e scripts desnecessários.', seo: 'Melhore metadados, estrutura da página, visibilidade de busca e prévias sociais.', accessibility: 'Melhore idioma, texto alternativo e estrutura semântica.', security: 'Melhore cabeçalhos públicos de segurança e sinais HTTPS.', conversion: 'Adicione um próximo passo claro como cadastro, demo, preço, orçamento ou reserva.' },
  },
  es: {
    medium: 'Media', low: 'Baja', metrics: 'Métricas de la página', html: 'HTML', titleLength: 'Longitud del título', descriptionLength: 'Longitud de la descripción', scripts: 'Scripts', stylesheets: 'Hojas de estilo', images: 'Imágenes', missingAlt: 'Imágenes sin alt', h1: 'Cantidad de H1', lazyImages: 'Imágenes con carga diferida', detailLabel: 'Lo que encontramos', fixLabel: 'Corrección recomendada', genericFinding: 'Oportunidad de optimización detectada',
    genericDetail: (category, value) => value === undefined ? `Esta señal de ${category} necesita revisión.` : `Esta señal de ${category} necesita revisión. Valor observado: ${value}.`,
    issueCopy: {
      large_html: { title: 'Página HTML demasiado grande', detail: value => `El HTML de la página tiene aproximadamente ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB, lo que puede aumentar la transferencia y el procesamiento.` },
      many_scripts: { title: 'Demasiados elementos JavaScript', detail: value => `La página contiene ${value ?? 0} elementos de script, lo que puede aumentar el trabajo del navegador y ralentizar la interacción.` },
      title_length: { title: 'El título de la página necesita mejorar', detail: value => `El título tiene ${value ?? 0} caracteres. Los títulos descriptivos y de tamaño adecuado suelen funcionar mejor en búsquedas.` },
      h1_count: { title: 'Falta el H1 principal o está duplicado', detail: value => Number(value) === 0 ? 'No se detectó ningún encabezado H1 en esta página.' : `Se detectaron ${value} encabezados H1. Normalmente conviene tener un único H1 principal claro.` },
      missing_cta: { title: 'No se detectó una llamada a la acción clara', detail: () => 'El análisis no detectó un siguiente paso obvio, como registro, demo, precios, cotización, reserva o contacto.' },
    },
    fixes: { performance: 'Mejora velocidad, caché, imágenes y scripts innecesarios.', seo: 'Mejora metadatos, estructura, visibilidad de búsqueda y vistas sociales.', accessibility: 'Mejora idioma, texto alternativo y estructura semántica.', security: 'Mejora cabeceras públicas de seguridad y señales HTTPS.', conversion: 'Agrega un siguiente paso claro como registro, demo, precios, cotización o reserva.' },
  },
  pl: {
    medium: 'Średnia', low: 'Niska', metrics: 'Metryki strony', html: 'HTML', titleLength: 'Długość tytułu', descriptionLength: 'Długość opisu', scripts: 'Skrypty', stylesheets: 'Arkusze stylów', images: 'Obrazy', missingAlt: 'Obrazy bez alt', h1: 'Liczba H1', lazyImages: 'Obrazy z lazy loading', detailLabel: 'Co znaleźliśmy', fixLabel: 'Zalecana poprawka', genericFinding: 'Wykryto możliwość optymalizacji',
    genericDetail: (category, value) => value === undefined ? `Ten sygnał z kategorii ${category} wymaga przeglądu.` : `Ten sygnał z kategorii ${category} wymaga przeglądu. Zaobserwowana wartość: ${value}.`,
    issueCopy: {
      large_html: { title: 'Zbyt duża strona HTML', detail: value => `Kod HTML strony ma około ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB, co może zwiększać transfer i czas renderowania.` },
      many_scripts: { title: 'Zbyt wiele elementów JavaScript', detail: value => `Strona zawiera ${value ?? 0} elementów skryptowych, co może zwiększać obciążenie przeglądarki i spowalniać interakcję.` },
      title_length: { title: 'Tytuł strony wymaga poprawy', detail: value => `Tytuł ma ${value ?? 0} znaków. Opisowe tytuły o odpowiedniej długości zwykle lepiej działają w wyszukiwarkach.` },
      h1_count: { title: 'Brak głównego H1 lub zduplikowany H1', detail: value => Number(value) === 0 ? 'Na tej stronie nie wykryto nagłówka H1.' : `Wykryto ${value} nagłówki H1. Zwykle najlepiej mieć jeden wyraźny główny H1.` },
      missing_cta: { title: 'Nie wykryto wyraźnego wezwania do działania', detail: () => 'Skan nie wykrył oczywistego następnego kroku, takiego jak rejestracja, demo, cennik, wycena, rezerwacja lub kontakt.' },
    },
    fixes: { performance: 'Popraw szybkość, pamięć podręczną, obrazy i zbędne skrypty.', seo: 'Popraw metadane, strukturę strony, widoczność w wyszukiwarce i podglądy społecznościowe.', accessibility: 'Popraw język strony, tekst alternatywny i strukturę semantyczną.', security: 'Popraw publiczne nagłówki bezpieczeństwa i sygnały HTTPS.', conversion: 'Dodaj jasny następny krok, np. rejestrację, demo, cennik, wycenę lub rezerwację.' },
  },
  ru: {
    medium: 'Средняя', low: 'Низкая', metrics: 'Метрики страницы', html: 'HTML', titleLength: 'Длина заголовка', descriptionLength: 'Длина описания', scripts: 'Скрипты', stylesheets: 'Таблицы стилей', images: 'Изображения', missingAlt: 'Изображения без alt', h1: 'Количество H1', lazyImages: 'Изображения с lazy loading', detailLabel: 'Что мы нашли', fixLabel: 'Рекомендуемое исправление', genericFinding: 'Обнаружена возможность оптимизации',
    genericDetail: (category, value) => value === undefined ? `Этот сигнал категории ${category} требует проверки.` : `Этот сигнал категории ${category} требует проверки. Наблюдаемое значение: ${value}.`,
    issueCopy: {
      large_html: { title: 'Слишком большой HTML-документ', detail: value => `HTML страницы занимает около ${Math.max(1, Math.round(Number(value || 0) / 1024))} КБ, что может увеличивать объём передачи и нагрузку при рендеринге.` },
      many_scripts: { title: 'Слишком много элементов JavaScript', detail: value => `На странице ${value ?? 0} элементов script, что может увеличивать нагрузку на браузер и замедлять взаимодействие.` },
      title_length: { title: 'Заголовок страницы требует улучшения', detail: value => `Заголовок содержит ${value ?? 0} символов. Описательные заголовки подходящей длины обычно лучше работают в поиске.` },
      h1_count: { title: 'Основной H1 отсутствует или дублируется', detail: value => Number(value) === 0 ? 'На этой странице не обнаружен заголовок H1.' : `Обнаружено ${value} заголовков H1. Обычно лучше иметь один чёткий основной H1.` },
      missing_cta: { title: 'Не обнаружен ясный призыв к действию', detail: () => 'Сканирование не обнаружило очевидного следующего шага, например регистрации, демо, цен, запроса предложения, бронирования или контакта.' },
    },
    fixes: { performance: 'Улучшите скорость загрузки, кеширование, обработку изображений и лишние скрипты.', seo: 'Улучшите метаданные, структуру страницы, видимость в поиске и социальные превью.', accessibility: 'Улучшите язык страницы, альтернативный текст и семантическую структуру.', security: 'Улучшите публичные заголовки безопасности и сигналы HTTPS.', conversion: 'Добавьте понятный следующий шаг: регистрацию, демо, цены, запрос предложения или бронирование.' },
  },
}
