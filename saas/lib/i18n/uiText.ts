// saas/lib/i18n/uiText.ts
import en from '@/locales/en.json' with { type: 'json' }
import type { Dict } from '@/lib/i18n/loadLanguage'
import { PUBLIC_BRAND, publicBrandText } from '@/lib/public-brand'

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
  // The auth wordmark used to assemble "signal" + "boost" from two generated
  // locale slots. Keep those old keys for compatibility but expose one stable
  // public brand instead of leaking the legacy name into the sign-in surface.
  if (path === 'generatedUi.u_d041924c15885af6') return PUBLIC_BRAND.name as T
  if (path === 'generatedUi.u_ca4264faf5970fc6') return '' as T

  const active = lookup(activeDictionary, path)
  if (typeof active === 'string') return publicBrandText(active) as T

  const english = lookup(ENGLISH, path)
  if (typeof english === 'string') return publicBrandText(english) as T

  return path as T
}

export type WebsiteOptimizerReportLang = 'en' | 'pt' | 'es' | 'pl' | 'ru' | 'de' | 'fr' | 'it' | 'ja' | 'ko' | 'ar'

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
  de: {
    medium: 'Mittel', low: 'Niedrig', metrics: 'Seitenmetriken', html: 'HTML', titleLength: 'Titellänge', descriptionLength: 'Beschreibungslänge', scripts: 'Skripte', stylesheets: 'Stylesheets', images: 'Bilder', missingAlt: 'Bilder ohne Alt-Text', h1: 'Anzahl H1', lazyImages: 'Verzögert geladene Bilder', detailLabel: 'Unsere Ergebnisse', fixLabel: 'Empfohlene Behebung', genericFinding: 'Optimierungspotenzial erkannt',
    genericDetail: (category, value) => value === undefined ? `Dieses ${category}-Signal muss geprüft werden.` : `Dieses ${category}-Signal muss geprüft werden. Beobachteter Wert: ${value}.`,
    issueCopy: {
      large_html: { title: 'Große HTML-Seite', detail: value => `Das HTML der Seite ist etwa ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB groß, was den Übertragungs- und Renderingaufwand erhöhen kann.` },
      many_scripts: { title: 'Zu viele JavaScript-Elemente', detail: value => `Die Seite enthält ${value ?? 0} Script-Elemente, was die Browserlast erhöhen und die Interaktion verlangsamen kann.` },
      title_length: { title: 'Seitentitel sollte verbessert werden', detail: value => `Der Seitentitel ist ${value ?? 0} Zeichen lang. Suchtitel sind in der Regel klarer, wenn sie beschreibend und angemessen lang sind.` },
      h1_count: { title: 'Primäre H1-Überschrift fehlt oder ist doppelt', detail: value => Number(value) === 0 ? 'Auf dieser Seite wurde keine H1-Überschrift erkannt.' : `Es wurden ${value} H1-Überschriften erkannt. Eine Seite profitiert normalerweise von einer einzigen klaren Haupt-H1.` },
      missing_cta: { title: 'Kein klarer Call-to-Action erkannt', detail: () => 'Die Analyse hat keinen offensichtlichen nächsten Schritt wie Registrierung, Demo, Preise, Angebot, Buchung oder Kontakt erkannt.' },
    },
    fixes: { performance: 'Verbessern Sie Ladegeschwindigkeit, Caching, Bildverarbeitung und unnötige Skripte.', seo: 'Verbessern Sie Metadaten, Seitenstruktur, Sichtbarkeit in Suchmaschinen und Social-Media-Vorschauen.', accessibility: 'Verbessern Sie Barrierefreiheitssignale wie Sprachangabe, Bildtexte und semantische Struktur.', security: 'Verbessern Sie öffentliche Sicherheits-Header und HTTPS-Vertrauenssignale.', conversion: 'Fügen Sie einen klaren nächsten Schritt hinzu, z. B. Registrierung, Demo, Preise, Angebot oder Buchung.' },
  },
  fr: {
    medium: 'Moyen', low: 'Faible', metrics: 'Métriques de la page', html: 'HTML', titleLength: 'Longueur du titre', descriptionLength: 'Longueur de la description', scripts: 'Scripts', stylesheets: 'Feuilles de style', images: 'Images', missingAlt: 'Images sans attribut alt', h1: 'Nombre de H1', lazyImages: 'Images en chargement différé', detailLabel: 'Ce que nous avons trouvé', fixLabel: 'Correctif recommandé', genericFinding: 'Opportunité d\'optimisation détectée',
    genericDetail: (category, value) => value === undefined ? `Ce signal ${category} doit être examiné.` : `Ce signal ${category} doit être examiné. Valeur observée : ${value}.`,
    issueCopy: {
      large_html: { title: 'Page HTML volumineuse', detail: value => `Le HTML de la page fait environ ${Math.max(1, Math.round(Number(value || 0) / 1024))} Ko, ce qui peut augmenter le transfert et le travail de rendu.` },
      many_scripts: { title: 'Trop d\'éléments JavaScript', detail: value => `La page contient ${value ?? 0} éléments script, ce qui peut augmenter la charge du navigateur et ralentir l'interaction.` },
      title_length: { title: 'Le titre de la page doit être amélioré', detail: value => `Le titre de la page comporte ${value ?? 0} caractères. Les titres de recherche sont généralement plus clairs lorsqu'ils sont descriptifs et de longueur appropriée.` },
      h1_count: { title: 'Titre H1 principal manquant ou en double', detail: value => Number(value) === 0 ? 'Aucun titre H1 n\'a été détecté sur cette page.' : `${value} titres H1 ont été détectés. Une page gagne généralement à avoir un seul titre H1 principal clair.` },
      missing_cta: { title: 'Aucun appel à l’action clair détecté', detail: () => 'L’analyse n’a détecté aucune étape suivante évidente, comme l’inscription, une démo, les tarifs, un devis, une réservation ou un contact.' },
    },
    fixes: { performance: 'Améliorez la vitesse de chargement, la mise en cache, la gestion des images et les scripts inutiles.', seo: 'Améliorez les métadonnées, la structure des pages, la visibilité dans les moteurs de recherche et les aperçus sur les réseaux sociaux.', accessibility: 'Améliorez les signaux d’accessibilité tels que la langue, le texte des images et la structure sémantique.', security: 'Améliorez les en-têtes de sécurité publics et les signaux de confiance HTTPS.', conversion: 'Ajoutez une étape suivante claire, comme l’inscription, une démo, les tarifs, un devis ou une réservation.' },
  },
  it: {
    medium: 'Medio', low: 'Bassa', metrics: 'Metriche della pagina', html: 'HTML', titleLength: 'Lunghezza del titolo', descriptionLength: 'Lunghezza della descrizione', scripts: 'Script', stylesheets: 'Fogli di stile', images: 'Immagini', missingAlt: 'Immagini senza alt', h1: 'Numero di H1', lazyImages: 'Immagini con caricamento differito', detailLabel: 'Cosa abbiamo trovato', fixLabel: 'Correzione consigliata', genericFinding: 'Opportunità di ottimizzazione rilevata',
    genericDetail: (category, value) => value === undefined ? `Questo segnale ${category} richiede una revisione.` : `Questo segnale ${category} richiede una revisione. Valore osservato: ${value}.`,
    issueCopy: {
      large_html: { title: 'Pagina HTML di grandi dimensioni', detail: value => `L'HTML della pagina è di circa ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB, il che può aumentare il trasferimento e il lavoro di rendering.` },
      many_scripts: { title: 'Troppi elementi JavaScript', detail: value => `La pagina contiene ${value ?? 0} elementi script, il che può aumentare il carico del browser e rallentare l'interazione.` },
      title_length: { title: 'Il titolo della pagina va migliorato', detail: value => `Il titolo della pagina è lungo ${value ?? 0} caratteri. I titoli di ricerca sono di solito più chiari quando sono descrittivi e di lunghezza adeguata.` },
      h1_count: { title: 'Intestazione H1 principale mancante o duplicata', detail: value => Number(value) === 0 ? 'Nessuna intestazione H1 rilevata in questa pagina.' : `Sono stati rilevati ${value} titoli H1. Di solito una pagina trae vantaggio da un unico H1 principale chiaro.` },
      missing_cta: { title: 'Nessuna call to action chiara rilevata', detail: () => 'L’analisi non ha rilevato un passo successivo evidente, come registrazione, demo, prezzi, preventivo, prenotazione o contatto.' },
    },
    fixes: { performance: 'Migliora velocità di caricamento, caching, gestione delle immagini e script non necessari.', seo: 'Migliora metadati, struttura della pagina, visibilità nei motori di ricerca e anteprime social.', accessibility: 'Migliora i segnali di accessibilità come lingua, testo alternativo delle immagini e struttura semantica.', security: 'Migliora gli header di sicurezza pubblici e i segnali di affidabilità HTTPS.', conversion: 'Aggiungi un passo successivo chiaro, come registrazione, demo, prezzi, preventivo o prenotazione.' },
  },
  ja: {
    medium: '中', low: '低', metrics: 'ページ指標', html: 'HTML', titleLength: 'タイトルの長さ', descriptionLength: '説明の長さ', scripts: 'スクリプト', stylesheets: 'スタイルシート', images: '画像', missingAlt: 'alt のない画像', h1: 'H1 の数', lazyImages: '遅延読み込み画像', detailLabel: '検出内容', fixLabel: '推奨される修正', genericFinding: '最適化の機会を検出しました',
    genericDetail: (category, value) => value === undefined ? `この ${category} シグナルは確認が必要です。` : `この ${category} シグナルは確認が必要です。観測値：${value}。`,
    issueCopy: {
      large_html: { title: 'HTML ページが大きすぎます', detail: value => `ページの HTML は約 ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB あり、転送量と描画処理が増える可能性があります。` },
      many_scripts: { title: 'JavaScript 要素が多すぎます', detail: value => `このページには ${value ?? 0} 個の script 要素が含まれており、ブラウザーの処理が増えて操作が遅くなる可能性があります。` },
      title_length: { title: 'ページタイトルの改善が必要です', detail: value => `ページタイトルは ${value ?? 0} 文字です。検索タイトルは、内容を説明し適切な長さであるほど分かりやすくなります。` },
      h1_count: { title: 'メインの H1 見出しがないか重複しています', detail: value => Number(value) === 0 ? 'このページで H1 見出しは検出されませんでした。' : `${value} 個の H1 見出しが検出されました。通常、ページには明確なメインの H1 が 1 つあるのが望ましいです。` },
      missing_cta: { title: '明確な CTA が検出されませんでした', detail: () => 'スキャンでは、登録、デモ、料金、見積もり、予約、問い合わせなどの明確な次のステップが検出されませんでした。' },
    },
    fixes: { performance: '読み込み速度、キャッシュ、画像処理、不要なスクリプトを改善します。', seo: 'メタデータ、ページ構造、検索での可視性、ソーシャルプレビューを改善します。', accessibility: '言語、画像の代替テキスト、セマンティック構造などのアクセシビリティ要素を改善します。', security: '公開セキュリティヘッダーと HTTPS の信頼性シグナルを改善します。', conversion: '登録、デモ、料金、見積もり、予約など、明確な次のステップを追加してください。' },
  },
  ko: {
    medium: '보통', low: '낮음', metrics: '페이지 지표', html: 'HTML', titleLength: '제목 길이', descriptionLength: '설명 길이', scripts: '스크립트', stylesheets: '스타일시트', images: '이미지', missingAlt: 'alt 누락 이미지', h1: 'H1 개수', lazyImages: '지연 로드 이미지', detailLabel: '발견 내용', fixLabel: '권장 해결 방법', genericFinding: '최적화 기회 감지됨',
    genericDetail: (category, value) => value === undefined ? `이 ${category} 신호는 검토가 필요합니다.` : `이 ${category} 신호는 검토가 필요합니다. 관측값: ${value}.`,
    issueCopy: {
      large_html: { title: '큰 HTML 페이지', detail: value => `페이지 HTML이 약 ${Math.max(1, Math.round(Number(value || 0) / 1024))} KB로, 전송 및 렌더링 작업이 늘어날 수 있습니다.` },
      many_scripts: { title: 'JavaScript 요소가 너무 많음', detail: value => `페이지에 ${value ?? 0}개의 script 요소가 있어 브라우저 작업이 늘고 상호작용이 느려질 수 있습니다.` },
      title_length: { title: '페이지 제목 개선 필요', detail: value => `페이지 제목은 ${value ?? 0}자입니다. 검색 제목은 설명적이고 적절한 길이일 때 일반적으로 더 명확합니다.` },
      h1_count: { title: '기본 H1 제목이 없거나 중복됨', detail: value => Number(value) === 0 ? '이 페이지에서 H1 제목이 감지되지 않았습니다.' : `H1 제목이 ${value}개 감지되었습니다. 일반적으로 페이지에는 명확한 기본 H1이 하나만 있는 것이 좋습니다.` },
      missing_cta: { title: '명확한 행동 유도(CTA)가 감지되지 않음', detail: () => '스캔에서 가입, 데모, 요금, 견적, 예약, 문의 등 명확한 다음 단계가 감지되지 않았습니다.' },
    },
    fixes: { performance: '로딩 속도, 캐싱, 이미지 처리 및 불필요한 스크립트를 개선하세요.', seo: '메타데이터, 페이지 구조, 검색 노출 및 소셜 미리보기를 개선하세요.', accessibility: '언어, 이미지 대체 텍스트, 시맨틱 구조 등 접근성 신호를 개선하세요.', security: '공개 보안 헤더와 HTTPS 신뢰 신호를 개선하세요.', conversion: '가입, 데모, 요금, 견적, 예약 등 명확한 다음 단계를 추가하세요.' },
  },
  ar: {
    medium: 'متوسط', low: 'منخفض', metrics: 'مقاييس الصفحة', html: 'HTML', titleLength: 'طول العنوان', descriptionLength: 'طول الوصف', scripts: 'البرامج النصية', stylesheets: 'أوراق الأنماط', images: 'الصور', missingAlt: 'صور بدون نص alt', h1: 'عدد H1', lazyImages: 'الصور ذات التحميل المؤجل', detailLabel: 'ما وجدناه', fixLabel: 'الإصلاح الموصى به', genericFinding: 'تم اكتشاف فرصة للتحسين',
    genericDetail: (category, value) => value === undefined ? `تحتاج إشارة ${category} هذه إلى مراجعة.` : `تحتاج إشارة ${category} هذه إلى مراجعة. القيمة المرصودة: ${value}.`,
    issueCopy: {
      large_html: { title: 'صفحة HTML كبيرة', detail: value => `يبلغ حجم HTML للصفحة نحو ${Math.max(1, Math.round(Number(value || 0) / 1024))} كيلوبايت، مما قد يزيد من عبء النقل والعرض.` },
      many_scripts: { title: 'عناصر JavaScript كثيرة جدًا', detail: value => `تحتوي الصفحة على ${value ?? 0} من عناصر script، مما قد يزيد من عبء المتصفح ويبطئ التفاعل.` },
      title_length: { title: 'عنوان الصفحة يحتاج إلى تحسين', detail: value => `يبلغ طول عنوان الصفحة ${value ?? 0} حرفًا. تكون عناوين البحث عادةً أوضح عندما تكون وصفية وذات طول مناسب.` },
      h1_count: { title: 'عنوان H1 الرئيسي مفقود أو مكرر', detail: value => Number(value) === 0 ? 'لم يُكتشف أي عنوان H1 في هذه الصفحة.' : `تم اكتشاف ${value} من عناوين H1. عادةً ما تستفيد الصفحة من عنوان H1 رئيسي واحد وواضح.` },
      missing_cta: { title: 'لم يتم اكتشاف دعوة واضحة لاتخاذ إجراء', detail: () => 'لم يكتشف الفحص خطوة تالية واضحة مثل التسجيل أو العرض التوضيحي أو الأسعار أو طلب عرض سعر أو الحجز أو التواصل.' },
    },
    fixes: { performance: 'حسِّن سرعة التحميل والتخزين المؤقت ومعالجة الصور والنصوص البرمجية غير الضرورية.', seo: 'حسِّن البيانات الوصفية وبنية الصفحة والظهور في نتائج البحث ومعاينات الشبكات الاجتماعية.', accessibility: 'حسِّن مؤشرات إمكانية الوصول مثل اللغة والنص البديل للصور والبنية الدلالية.', security: 'حسِّن ترويسات الأمان العامة ومؤشرات الثقة الخاصة بـ HTTPS.', conversion: 'أضف خطوة تالية واضحة مثل التسجيل أو العرض التوضيحي أو الأسعار أو طلب عرض سعر أو الحجز.' },
  },
}
