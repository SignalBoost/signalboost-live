// lib/i18n/loadLanguage.ts
const dictionaries: Record<string, () => Promise<Record<string, string>>> = {
  en: () => import('@/locales/en.json').then((m) => m.default),
  es: () => import('@/locales/es.json').then((m) => m.default),
  // Add more languages here
};

export async function loadLanguage(lang: string): Promise<Record<string, string>> {
  const loadDict = dictionaries[lang] || dictionaries['en'];
  return loadDict();
}
