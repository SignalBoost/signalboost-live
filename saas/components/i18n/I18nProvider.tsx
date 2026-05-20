'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'

import { useRouter } from 'next/navigation'
import { detectLanguage } from '@/lib/i18n/detectLanguage'
import { loadLanguage } from '@/lib/i18n/loadLanguage'

type Dict = Record<string, string>

type I18nContextType = {
  lang: string
  dict: Dict
  setLang: (lang: string) => void
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()

  const [lang, setLangState] = useState('en')
  const [dict, setDict] = useState<Dict>({})

  useEffect(() => {
    async function init() {
      const saved =
        localStorage.getItem('site-language')

      const detected =
        saved || detectLanguage()

      const loaded =
        await loadLanguage(detected)

      setLangState(detected)
      setDict(loaded)
    }

    init()
  }, [])

  const setLang = async (newLang: string) => {
    localStorage.setItem(
      'site-language',
      newLang
    )

    localStorage.setItem(
      'signalboost_language',
      newLang
    )

    const loaded =
      await loadLanguage(newLang)

    setLangState(newLang)
    setDict(loaded)

    // Force components to refresh
    router.refresh()
  }

  return (
    <I18nContext.Provider
      value={{
        lang,
        dict,
        setLang,
      }}
    >
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const ctx = useContext(I18nContext)

  if (!ctx) {
    throw new Error(
      'useI18n must be used inside I18nProvider'
    )
  }

  return ctx
}
