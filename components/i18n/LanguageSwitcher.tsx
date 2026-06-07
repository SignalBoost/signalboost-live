'use client'

import { useTranslation } from '@/lib/i18n/useTranslation'

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'pt', label: 'PT' },
  { code: 'pl', label: 'PL' },
  { code: 'ru', label: 'RU' },
]

type Props = {
  current?: string
  onChange?: (lang: string) => void
}

export default function LanguageSwitcher({ current, onChange }: Props) {
  const { t, lang, setLang } = useTranslation()
  const selected = current || lang

  function changeLanguage(code: string) {
    setLang(code)
    onChange?.(code)
  }

  return (
    <div className="flex items-center gap-2" aria-label={t('common.languageSwitcher')}>
      <span className="sr-only">{t('common.languageSwitcher')}</span>
      {LANGUAGES.map((language) => (
        <button
          key={language.code}
          type="button"
          onClick={() => changeLanguage(language.code)}
          className={[
            'rounded border px-2 py-1 text-xs transition-colors',
            selected === language.code
              ? 'border-[#FFD700] bg-[#FFD700] text-black'
              : 'border-neutral-700 bg-transparent text-white hover:border-[#FFD700]',
          ].join(' ')}
        >
          {language.label}
        </button>
      ))}
    </div>
  )
}
