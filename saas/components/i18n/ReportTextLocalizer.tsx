'use client'

import { useEffect } from 'react'
import { useI18n } from '@/components/i18n/I18nProvider'

type Lang = 'en' | 'es' | 'pt' | 'pl' | 'ru'

const ORIGINAL_TEXT = new WeakMap<Text, string>()

const STRINGS: Record<Lang, Record<string, string>> = {
  en: {},
  pt: {
    'Possible dead button (no handler)': 'Possível botão sem ação',
    'A <button> has no onClick handler and is not a submit button — likely a dead click. (Heuristic: a handler passed via spread/variable can be a false positive — verify.)': 'Um <button> não tem onClick e também não é do tipo submit — provavelmente é um clique sem ação. Verifique se não é um falso positivo.',
    'Bind an onClick to the action, turn it into a link with a real href, set type="submit" inside a form, or remove the control.': 'Conecte um onClick à ação, transforme em um link com href real, use type="submit" dentro de um formulário ou remova o controle.',
    'Next.js X-Powered-By header is not disabled': 'O cabeçalho X-Powered-By do Next.js não está desativado',
    'The configuration does not set `poweredByHeader: false`, so Next.js may expose the `X-Powered-By` header by default. This can reveal framework information to attackers and add fingerprinting.': 'A configuração não define `poweredByHeader: false`, então o Next.js pode expor o cabeçalho `X-Powered-By` por padrão. Isso pode revelar informações do framework e facilitar fingerprinting.',
    'Set `poweredByHeader: false` in `nextConfig` to reduce framework fingerprinting.': 'Defina `poweredByHeader: false` em `nextConfig` para reduzir o fingerprinting do framework.',
    'Image remote pattern is broader than necessary': 'O padrão remoto de imagens é mais amplo do que o necessário',
    'The image remote pattern allows a wider external image source than necessary. A broad allowlist increases exposure to untrusted remote media.': 'O padrão remoto de imagens permite uma fonte externa mais ampla do que o necessário. Uma lista ampla aumenta a exposição a mídia remota não confiável.',
    'Restrict remote image patterns to the exact protocol, hostname, and path patterns required by the application.': 'Restrinja os padrões remotos de imagens ao protocolo, hostname e caminhos exatos exigidos pela aplicação.',
    'Information Disclosure': 'Divulgação de informações',
  },
  es: {
    'Possible dead button (no handler)': 'Posible botón sin acción',
    'A <button> has no onClick handler and is not a submit button — likely a dead click. (Heuristic: a handler passed via spread/variable can be a false positive — verify.)': 'Un <button> no tiene onClick y tampoco es de tipo submit — probablemente es un clic sin acción. Verifica que no sea un falso positivo.',
    'Bind an onClick to the action, turn it into a link with a real href, set type="submit" inside a form, or remove the control.': 'Conecta un onClick a la acción, conviértelo en un enlace con href real, usa type="submit" dentro de un formulario o elimina el control.',
    'Next.js X-Powered-By header is not disabled': 'La cabecera X-Powered-By de Next.js no está desactivada',
    'The configuration does not set `poweredByHeader: false`, so Next.js may expose the `X-Powered-By` header by default. This can reveal framework information to attackers and add fingerprinting.': 'La configuración no establece `poweredByHeader: false`, por lo que Next.js puede exponer la cabecera `X-Powered-By` por defecto. Esto puede revelar información del framework y facilitar fingerprinting.',
    'Set `poweredByHeader: false` in `nextConfig` to reduce framework fingerprinting.': 'Configura `poweredByHeader: false` en `nextConfig` para reducir el fingerprinting del framework.',
    'Image remote pattern is broader than necessary': 'El patrón remoto de imágenes es más amplio de lo necesario',
    'The image remote pattern allows a wider external image source than necessary. A broad allowlist increases exposure to untrusted remote media.': 'El patrón remoto de imágenes permite una fuente externa más amplia de lo necesario. Una lista amplia aumenta la exposición a medios remotos no confiables.',
    'Restrict remote image patterns to the exact protocol, hostname, and path patterns required by the application.': 'Restringe los patrones remotos de imágenes al protocolo, hostname y rutas exactas que necesita la aplicación.',
    'Information Disclosure': 'Divulgación de información',
  },
  pl: {
    'Possible dead button (no handler)': 'Możliwy przycisk bez akcji',
    'A <button> has no onClick handler and is not a submit button — likely a dead click. (Heuristic: a handler passed via spread/variable can be a false positive — verify.)': 'Element <button> nie ma onClick i nie jest przyciskiem submit — prawdopodobnie jest to kliknięcie bez akcji. Sprawdź, czy to nie fałszywy alarm.',
    'Bind an onClick to the action, turn it into a link with a real href, set type="submit" inside a form, or remove the control.': 'Podłącz onClick do właściwej akcji, zamień element na link z prawdziwym href, ustaw type="submit" w formularzu albo usuń kontrolkę.',
    'Next.js X-Powered-By header is not disabled': 'Nagłówek X-Powered-By w Next.js nie jest wyłączony',
    'The configuration does not set `poweredByHeader: false`, so Next.js may expose the `X-Powered-By` header by default. This can reveal framework information to attackers and add fingerprinting.': 'Konfiguracja nie ustawia `poweredByHeader: false`, więc Next.js może domyślnie ujawniać nagłówek `X-Powered-By`. Może to ujawniać informacje o frameworku i ułatwiać fingerprinting.',
    'Set `poweredByHeader: false` in `nextConfig` to reduce framework fingerprinting.': 'Ustaw `poweredByHeader: false` w `nextConfig`, aby ograniczyć fingerprinting frameworku.',
    'Image remote pattern is broader than necessary': 'Wzorzec zdalnych obrazów jest szerszy niż potrzebny',
    'The image remote pattern allows a wider external image source than necessary. A broad allowlist increases exposure to untrusted remote media.': 'Wzorzec zdalnych obrazów dopuszcza szersze źródło zewnętrzne niż potrzeba. Szeroka lista zwiększa ekspozycję na niezaufane zdalne media.',
    'Restrict remote image patterns to the exact protocol, hostname, and path patterns required by the application.': 'Ogranicz zdalne wzorce obrazów do dokładnego protokołu, hosta i ścieżek wymaganych przez aplikację.',
    'Information Disclosure': 'Ujawnianie informacji',
  },
  ru: {
    'Possible dead button (no handler)': 'Возможная кнопка без действия',
    'A <button> has no onClick handler and is not a submit button — likely a dead click. (Heuristic: a handler passed via spread/variable can be a false positive — verify.)': 'У <button> нет onClick, и он не является submit-кнопкой — вероятно, это клик без действия. Проверьте, не ложное ли это срабатывание.',
    'Bind an onClick to the action, turn it into a link with a real href, set type="submit" inside a form, or remove the control.': 'Подключите onClick к нужному действию, замените на ссылку с реальным href, используйте type="submit" внутри формы или удалите элемент.',
    'Next.js X-Powered-By header is not disabled': 'Заголовок X-Powered-By в Next.js не отключён',
    'The configuration does not set `poweredByHeader: false`, so Next.js may expose the `X-Powered-By` header by default. This can reveal framework information to attackers and add fingerprinting.': 'Конфигурация не задаёт `poweredByHeader: false`, поэтому Next.js может по умолчанию раскрывать заголовок `X-Powered-By`. Это может раскрыть сведения о framework и облегчить fingerprinting.',
    'Set `poweredByHeader: false` in `nextConfig` to reduce framework fingerprinting.': 'Установите `poweredByHeader: false` в `nextConfig`, чтобы уменьшить fingerprinting framework.',
    'Image remote pattern is broader than necessary': 'Шаблон удалённых изображений шире, чем нужно',
    'The image remote pattern allows a wider external image source than necessary. A broad allowlist increases exposure to untrusted remote media.': 'Шаблон удалённых изображений разрешает более широкий внешний источник, чем необходимо. Широкий allowlist повышает риск работы с недоверенными удалёнными медиа.',
    'Restrict remote image patterns to the exact protocol, hostname, and path patterns required by the application.': 'Ограничьте remote image patterns точным протоколом, hostname и путями, которые действительно нужны приложению.',
    'Information Disclosure': 'Раскрытие информации',
  },
}

function walkTextNodes(root: Node, callback: (node: Text) => void) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      if (!parent) return NodeFilter.FILTER_REJECT
      if (['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  let node = walker.nextNode()
  while (node) {
    callback(node as Text)
    node = walker.nextNode()
  }
}

function replaceText(value: string, map: Record<string, string>) {
  let next = value
  for (const [from, to] of Object.entries(map)) {
    next = next.split(from).join(to)
  }
  return next
}

function hasKnownSource(value: string) {
  return Object.keys(STRINGS.pt).some((source) => value.includes(source))
}

export default function ReportTextLocalizer() {
  const { lang } = useI18n()

  useEffect(() => {
    const safeLang = String(lang || 'en') as Lang
    const map = STRINGS[safeLang] || {}

    const apply = () => {
      walkTextNodes(document.body, (node) => {
        const current = node.nodeValue || ''
        const existingOriginal = ORIGINAL_TEXT.get(node)
        const original = existingOriginal || current
        if (!existingOriginal && hasKnownSource(current)) {
          ORIGINAL_TEXT.set(node, current)
        }
        const source = ORIGINAL_TEXT.get(node) || original
        const next = safeLang === 'en' ? source : replaceText(source, map)
        if (next !== current) node.nodeValue = next
      })
    }

    apply()
    const observer = new MutationObserver(() => apply())
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [lang])

  return null
}
