// /lib/i18n/detectLanguage.ts
export function detectLanguage(): string {
  // Browser language detection
  const browserLang = (typeof navigator !== "undefined" && navigator.language) 
    ? navigator.language.split("-")[0] 
    : "en";

  // Supported languages
  const supported = ["en", "es", "pt", "pl", "ru"];

  // Default fallback
  return supported.includes(browserLang) ? browserLang : "en";
}
