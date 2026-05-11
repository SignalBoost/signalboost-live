export async function loadLanguage(
  lang: string
) {
  try {
    const res = await fetch(`/i18n/${lang}.json`);

    if (!res.ok) {
      throw new Error("Language file not found");
    }

    return await res.json();
  } catch (err) {
    const fallback = await fetch("/i18n/en.json");

    return await fallback.json();
  }
}
