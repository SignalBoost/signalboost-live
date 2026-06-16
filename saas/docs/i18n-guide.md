# Internationalization (i18n) Guide

The app ships in **five languages** — English (`en`), Spanish (`es`), Portuguese
(`pt`), Polish (`pl`), and Russian (`ru`) — with an English-fallback design: any
key missing from a target language automatically falls back to English, so a
partial translation never renders a blank string.

---

## How it works

Translation lookups go through a single helper:

```ts
t(dict, 'some.nested.key', 'English fallback')
```

- `dict` is the loaded dictionary for the active language (from the `useI18n()` /
  `useTranslation()` hook).
- The second argument is a **dot-path** into the dictionary.
- The third is a literal **English fallback** — used if the path is missing.

Because every call carries a fallback, you can add a feature in English first and
translate later without breaking the UI.

### Loading & fallback

`lib/i18n/loadLanguage.ts` builds the dictionary for a language:

1. Loads the main dictionary `@/locales/<lang>.json`.
2. Merges it over English via `mergeWithEnglishFallback(english, localized)` — any
   key absent in the target language inherits the English value.
3. Attaches two namespaces, each English-fallback-merged the same way:
   - `console` — from `lib/i18n/consoleLocales.json`
   - `onboarding` — from `lib/i18n/onboardingLocales.json`
4. Stamps `__lang` so the renderer knows the active language.

---

## File structure

| File | Contents |
|---|---|
| `locales/en.json`, `es.json`, `pt.json`, `pl.json`, `ru.json` | The main per-language dictionaries (lazy-loaded). `en.json` is canonical. |
| `lib/i18n/consoleLocales.json` | The **console** namespace — one JSON file with all five languages, so the Hub Console is translated by editing string values in one place. |
| `lib/i18n/onboardingLocales.json` | The **onboarding** namespace — same single-file, all-languages pattern. |
| `lib/i18n/loadLanguage.ts` | Loader + English-fallback merge. |
| `lib/i18n/t.ts` | The `t(dict, path, fallback)` lookup. |

> The console/onboarding namespaces deliberately live in **one JSON file each**
> (not per-language files) so a buyer can translate a whole surface by editing one
> file, and so the build never breaks on a missing per-language file.

---

## Add a translation key

**For general UI** (main dictionaries):

1. Add the key to `locales/en.json` (canonical).
2. Add the same key to the other four language files (or rely on the English
   fallback until translated).
3. Use it in code:

```tsx
import { useI18n } from '@/components/i18n/I18nProvider'
import { t } from '@/lib/i18n/t'

const { dict } = useI18n()
…
<span>{t(dict, 'dashboard.greeting', 'Welcome back')}</span>
```

**For the console or onboarding surfaces**, add the key under the right language
block in `consoleLocales.json` or `onboardingLocales.json` instead, and reference
it as `console.…` / `onboarding.…`.

Always pass a real English fallback — it's the safety net and the source of truth
for translators.

---

## Add a new language

1. Create `locales/<lang>.json` (copy `en.json` and translate the values).
2. Register it in the `dictionaries` map in `lib/i18n/loadLanguage.ts`:

```ts
const dictionaries: Record<string, () => Promise<Dict>> = {
  en: () => import('@/locales/en.json').then(m => m.default as Dict),
  // …existing…
  de: () => import('@/locales/de.json').then(m => m.default as Dict),  // new
}
```

3. Add a `"<lang>": { … }` block to `consoleLocales.json` and
   `onboardingLocales.json` (untranslated keys fall back to English automatically).
4. Add the language to your language switcher UI.

That's all the wiring — the fallback merge handles any gaps while translation is
in progress.

---

## Conventions

- **English is canonical.** New strings land in `en.json` (or the English block of
  a namespace) first.
- **Always supply the `t(...)` fallback.** It keeps the UI intact for any
  not-yet-translated key.
- **Never hard-code user-facing text.** Wrap it in `t(dict, key, fallback)` so it's
  translatable.
- Keep keys **namespaced and descriptive** (`pricing_v2.command.name`,
  `wireframes.modules.reviews.metricLabel`) rather than flat or generic.
