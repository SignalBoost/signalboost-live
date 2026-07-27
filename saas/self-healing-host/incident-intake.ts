CODEX TASK — ELIMINATE HARDCODED ENGLISH ACROSS THE SAAS UI
Repository: SignalBoost/signalboost-live
Working directory: saas/
Branch: ai/i18n-hardcoded-sweep-2 (create from current main)

=====================================================================
CONTEXT YOU MUST VERIFY BEFORE CHANGING ANYTHING
=====================================================================
The app supports five languages: en, es, pt, pl, ru.

Translations live in saas/locales/ as several dictionary files per
language: <lang>.json, cos.<lang>.json, pages.<lang>.json.

Components translate via the useI18n() hook from
saas/components/i18n/I18nProvider.tsx, called as:

    t('some.key', 'English fallback')

The second argument renders whenever the key is absent from the active
language's dictionary. That fallback is the bug's hiding place: a
missing key does not throw, does not warn, and does not show a broken
string — it silently renders English. Every language therefore looks
"mostly working" while being mostly untranslated.

A measurement taken on current main, which you should REPRODUCE rather
than trust:
  - 639 distinct t() keys are referenced across app/ and components/
  - 631 of them exist in NO dictionary for ANY language
  - dictionary sizes are out of sync: en 535, pt 535, es 519, pl 519,
    ru 519
  - pages.*.json exists only for en and pt; es, pl and ru are absent
  - 169 of 324 .tsx files use the i18n hook at all; the remaining 155
    are either non-visual or contain untranslated literals

Reproduce these numbers first and report them. If your count differs
from the above, investigate why before proceeding — a discrepancy means
one of us is scanning the wrong set of files, and acting on the wrong
inventory would produce hundreds of misplaced keys.

=====================================================================
DELIVERABLE 1 — THE AUDIT (do this alone, in one PR, before any fix)
=====================================================================
Produce saas/locales/i18n-audit.json containing, per key:
  - the key
  - the English fallback string found at the call site
  - every file:line that references it
  - which language dictionaries currently contain it

Also list separately:
  a) visible string literals in .tsx that are NOT wrapped in t() at all
     — button labels, headings, placeholders, aria-labels, alt text,
     option labels, toast and error messages shown to a user
  b) files with no i18n hook wiring that render visible text
  c) keys present in a dictionary but referenced nowhere (dead keys)
  d) values in es/pt/pl/ru that are byte-identical to the English value
     (these are untranslated placeholders, not translations)

Do NOT fix anything in this PR. The audit is the artifact; a fix
without an inventory cannot be reviewed or resumed.

=====================================================================
DELIVERABLE 2 — THE FIX, IN BATCHES OF ONE AREA PER PR
=====================================================================
Suggested batch order, highest user visibility first:
  1. navigation (components/PremiumCustomerNavbarV2.tsx) and shared
     layout/chrome
  2. public marketing pages (home, pricing, faq, support, login)
  3. dashboard shell and the ten most-visited dashboard pages
  4. admin and operator pages
  5. everything remaining

For each batch:
  - add the missing keys to ALL FIVE dictionaries in the same commit
  - keep the English fallback argument in the t() call, unchanged
  - wrap any bare visible literal in t() with a new key
  - never change the key of an existing working translation

=====================================================================
TRANSLATION RULES
=====================================================================
- Translate into real es / pt / pl / ru. Copying the English string
  into another language file is what created the current problem and
  is worse than leaving the key absent, because it looks translated in
  every audit that only counts keys.
- DO NOT translate: product names, portable names, brand terms, code
  identifiers, HTTP verbs, header names, environment variable names,
  log/audit event types, or anything a user types verbatim.
- Keep interpolation placeholders exactly as they appear.
- Keep translations short enough for their UI slot; German-style
  overflow in a nav item is a visual regression.
- If a term is genuinely ambiguous out of context, leave the key absent
  and list it in an "needs-human-decision" section rather than guessing.
  A confident wrong translation is harder to find than a missing one.

=====================================================================
HARD CONSTRAINTS
=====================================================================
- No behaviour changes. This sweep only moves strings; it must not
  alter logic, routing, auth, or data flow.
- Do not touch anything under saas/lib/supervisor/portable/,
  saas/portable-license/, saas/portable-kernel/,
  saas/press-media-core/ or any other portable payload directory.
  Those ship to buyers and must contain no platform coupling; a
  translation import there breaks the boundary guard.
- Do not modify tests to make them pass.
- Every relative import must keep its .ts / .tsx extension — the repo
  enforces this and omitting it fails at runtime, not at compile time.

=====================================================================
VERIFY BEFORE EVERY PR
=====================================================================
From saas/:
    npx tsc --noEmit                                  # must be 0 errors
    node scripts/validate-next-route-config.mjs
    node scripts/validate-strip-safe.mjs
    node scripts/validate-relative-import-extensions.mjs
    npx next build                                    # must compile
    node --import ./scripts/test-alias-loader.mjs --test tests/*.node.test.ts

Also confirm, for each batch, that every JSON dictionary still parses
and that all five language files gained the SAME set of keys. A batch
that adds a key to en.json only has reintroduced the original bug.

=====================================================================
WHAT DONE LOOKS LIKE
=====================================================================
Switching the language selector to es, pt, pl or ru changes every
visible string on the page. No English remains except brand and
product names. The audit file's "missing from all dictionaries" count
is zero, and the "identical to English" count is zero for every
language.
