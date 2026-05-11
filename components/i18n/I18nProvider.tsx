// /components/i18n/I18nProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { detectLanguage } from "@/lib/i18n/detectLanguage";
import { loadLanguage } from "@/lib/i18n/loadLanguage";

type Dict = Record<string, string>;

interface I18nContextProps {
  dict: Dict;
  lang: string;
}

const I18nContext = createContext<I18nContextProps>({
  dict: {},
  lang: "en"
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [dict, setDict] = useState<Dict>({});
  const [lang, setLang] = useState("en");

  useEffect(() => {
    const detected = detectLanguage();
    setLang(detected);
    loadLanguage(detected).then(setDict);
  }, []);

  return (
    <I18nContext.Provider value={{ dict, lang }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
