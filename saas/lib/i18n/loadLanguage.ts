// /lib/i18n/loadLanguage.ts
export async function loadLanguage(lang: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(`/i18n/${lang}.json`);
    if (!res.ok) throw new Error("Language file not found");
    return await res.json();
  } catch (err) {
    console.error("Failed to load language:", err);
    // Fallback to English
    const res = await fetch(`/i18n/en.json`);
    return await res.json();
  }
}
