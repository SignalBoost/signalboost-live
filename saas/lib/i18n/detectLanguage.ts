// lib/i18n/detectLanguage.ts
export function detectLanguage(req?: Request | null): string {
  // Default to English
  let lang = 'en';

  // You can expand this later with headers, cookies, etc.
  if (typeof navigator !== 'undefined') {
    lang = navigator.language.split('-')[0] || 'en';
  }

  return lang;
}
