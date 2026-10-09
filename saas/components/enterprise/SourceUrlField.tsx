'use client'

import { useId, useMemo } from 'react'
import { useTranslation } from '@/components/i18n/useTranslation'
import { uiText } from '@/lib/i18n/uiText'

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  loading?: boolean
  error?: string
  helperText?: string
  required?: boolean
}

type ValidationCopy = {
  required: string
  protocol: string
  publicUrl: string
  invalid: string
}

const COPY = {
  en: {
    validation: { required: uiText('generatedUi.u_0a5050acd722b067'), protocol: uiText('generatedUi.u_ed4d1d773874d2f1'), publicUrl: uiText('generatedUi.u_ae162547ad259e30'), invalid: uiText('generatedUi.u_cabf6d7c0fe283fb') },
    placeholder: uiText('generatedUi.u_a231ac201ef7c2ec'), analyzing: uiText('generatedUi.u_89b633adede66a05'), analyze: uiText('generatedUi.u_0d4f89f98ca0d154'), helper: uiText('generatedUi.u_33df4d6aa4b94224'),
  },
  es: {
    validation: { required: 'Ingresa la URL de un sitio web o de GitHub.', protocol: 'Solo se admiten URL HTTP y HTTPS.', publicUrl: 'Usa una URL de acceso público.', invalid: 'Ingresa una URL válida.' },
    placeholder: 'https://ejemplo.com o https://github.com/org/repo', analyzing: 'Analizando…', analyze: 'Analizar fuente', helper: 'El servidor validará y extraerá los metadatos antes de usar esta fuente.',
  },
  pt: {
    validation: { required: 'Insira a URL de um site ou do GitHub.', protocol: 'Somente URLs HTTP e HTTPS são compatíveis.', publicUrl: 'Use uma URL acessível publicamente.', invalid: 'Insira uma URL válida.' },
    placeholder: 'https://exemplo.com ou https://github.com/org/repo', analyzing: 'Analisando…', analyze: 'Analisar fonte', helper: 'O servidor validará e extrairá os metadados antes de usar esta fonte.',
  },
  pl: {
    validation: { required: 'Wprowadź adres witryny lub repozytorium GitHub.', protocol: 'Obsługiwane są tylko adresy HTTP i HTTPS.', publicUrl: 'Użyj publicznie dostępnego adresu URL.', invalid: 'Wprowadź prawidłowy adres URL.' },
    placeholder: 'https://przyklad.com lub https://github.com/org/repo', analyzing: 'Analizowanie…', analyze: 'Analizuj źródło', helper: 'Serwer zweryfikuje i pobierze metadane przed użyciem tego źródła.',
  },
  ru: {
    validation: { required: 'Введите адрес сайта или репозитория GitHub.', protocol: 'Поддерживаются только URL-адреса HTTP и HTTPS.', publicUrl: 'Используйте общедоступный URL-адрес.', invalid: 'Введите корректный URL-адрес.' },
    placeholder: 'https://example.com или https://github.com/org/repo', analyzing: 'Анализ…', analyze: 'Анализировать источник', helper: 'Сервер проверит и извлечет метаданные перед использованием этого источника.',
  },
  de: {
    validation: { required: 'Geben Sie eine Website- oder GitHub-URL ein.', protocol: 'Nur HTTP- und HTTPS-URLs werden unterstützt.', publicUrl: 'Verwenden Sie eine öffentlich zugängliche URL.', invalid: 'Geben Sie eine gültige URL ein.' },
    placeholder: 'https://example.com oder https://github.com/org/repo', analyzing: 'Wird analysiert…', analyze: 'Quelle analysieren', helper: 'Der Server validiert die Quelle und extrahiert Metadaten, bevor er sie verwendet.',
  },
  fr: {
    validation: { required: 'Saisissez l\'URL d\'un site web ou de GitHub.', protocol: 'Seules les URL HTTP et HTTPS sont prises en charge.', publicUrl: 'Utilisez une URL accessible publiquement.', invalid: 'Saisissez une URL valide.' },
    placeholder: 'https://example.com ou https://github.com/org/repo', analyzing: 'Analyse en cours…', analyze: 'Analyser la source', helper: 'Le serveur validera la source et en extraira les métadonnées avant de l\'utiliser.',
  },
  it: {
    validation: { required: 'Inserisci un sito web o un URL GitHub.', protocol: 'Sono supportati solo URL HTTP e HTTPS.', publicUrl: 'Usa un URL accessibile pubblicamente.', invalid: 'Inserisci un URL valido.' },
    placeholder: 'https://example.com o https://github.com/org/repo', analyzing: 'Analisi in corso…', analyze: 'Analizza fonte', helper: 'Il server convaliderà la fonte ed estrarrà i metadati prima di utilizzarla.',
  },
  ja: {
    validation: { required: 'ウェブサイトまたは GitHub の URL を入力してください。', protocol: 'HTTP および HTTPS の URL のみサポートされています。', publicUrl: '公開アクセス可能なURLを使用してください。', invalid: '有効なURLを入力してください。' },
    placeholder: 'https://example.com または https://github.com/org/repo', analyzing: '分析中…', analyze: 'ソースを分析', helper: 'サーバーはこのソースを使用する前に、検証とメタデータの抽出を行います。',
  },
  ko: {
    validation: { required: '웹사이트 또는 GitHub URL을 입력하세요.', protocol: 'HTTP 및 HTTPS URL만 지원됩니다.', publicUrl: '공개적으로 접근 가능한 URL을 사용하세요.', invalid: '유효한 URL을 입력하세요.' },
    placeholder: 'https://example.com 또는 https://github.com/org/repo', analyzing: '분석 중…', analyze: '소스 분석', helper: '서버는 이 소스를 사용하기 전에 유효성을 검사하고 메타데이터를 추출합니다.',
  },
  ar: {
    validation: { required: 'أدخل موقعًا إلكترونيًا أو URL على GitHub.', protocol: 'يتم دعم عناوين URL من نوع HTTP وHTTPS فقط.', publicUrl: 'استخدم URL متاحًا للعامة.', invalid: 'أدخل URL صالحًا.' },
    placeholder: 'https://example.com أو https://github.com/org/repo', analyzing: 'جارٍ التحليل…', analyze: 'تحليل المصدر', helper: 'سيتحقق الخادم من صحة هذا المصدر ويستخرج بياناته الوصفية قبل استخدامه.',
  },
} as const

export function normalizeSourceUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}

export function validateSourceUrl(value: string, copy: ValidationCopy = COPY.en.validation): string | null {
  if (!value.trim()) return copy.required
  try {
    const parsed = new URL(normalizeSourceUrl(value))
    if (!['http:', 'https:'].includes(parsed.protocol)) return copy.protocol
    if (!parsed.hostname || parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) return copy.publicUrl
    return null
  } catch {
    return copy.invalid
  }
}

export function SourceUrlField({ label, value, onChange, onSubmit, loading, error, helperText, required }: Props) {
  const { lang } = useTranslation()
  const copy = COPY[lang as keyof typeof COPY] ?? COPY.en
  const id = useId()
  const localError = useMemo(() => value ? validateSourceUrl(value, copy.validation) : null, [copy.validation, value])
  const displayedError = error || localError
  const invalid = Boolean(validateSourceUrl(value, copy.validation))

  return <div style={{ display: 'grid', gap: 7 }}>
    <label htmlFor={id} style={{ color: '#fff', fontWeight: 850, fontSize: 13 }}>{label}{required ? ' *' : ''}</label>
    <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => value && onChange(normalizeSourceUrl(value))}
        placeholder={copy.placeholder}
        aria-invalid={Boolean(displayedError)}
        aria-describedby={`${id}-help`}
        style={{ minWidth: 260, flex: 1, border: displayedError ? '1px solid #fca5a5' : '1px solid rgba(255,255,255,.14)', background: 'rgba(2,6,23,.78)', color: '#fff', borderRadius: 12, padding: '11px 12px' }}
      />
      {onSubmit && <button type="button" disabled={loading || invalid} onClick={onSubmit} style={{ border: 'none', borderRadius: 12, background: '#ffc300', color: '#000', padding: '10px 14px', fontWeight: 900, cursor: loading ? 'wait' : 'pointer', opacity: loading || invalid ? .55 : 1 }}>{loading ? copy.analyzing : copy.analyze}</button>}
    </div>
    <p id={`${id}-help`} style={{ margin: 0, color: displayedError ? '#fca5a5' : 'rgba(255,255,255,.55)', fontSize: 11 }}>{displayedError || helperText || copy.helper}</p>
  </div>
}
