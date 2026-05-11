"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState
} from "react";

import { detectLanguage } from "@/lib/i18n/detectLanguage";
import { loadLanguage } from "@/lib/i18n/loadLanguage";

type Dict = Record<string, string>;

type I18nContextType = {
  lang: string;
  dict: Dict;
  setLang: (lang: string) => void;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [lang, setLangState] = useState("en");
  const [dict, setDict] = useState<Dict>({});

  useEffect(() => {
    async function init() {
      const detected = detectLanguage();
      const loaded = await loadLanguage(detected);

      setLangState(detected);
      setDict(loaded);
    }

    init();
  }, []);

  const setLang = async (newLang: string) => {
    localStorage.setItem("site-language", newLang);

    const loaded = await loadLanguage(newLang);

    setLangState(newLang);
    setDict(loaded);
  };

  return (
    <I18nContext.Provider value={{ lang, dict, setLang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);

  if (!ctx) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return ctx;
}
