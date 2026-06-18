# Chief of Staff — Localization Playbook (SignalBoost, 5 languages)

**Mission:** finish translating the SignalBoost SaaS UI into all 5 languages
(en/es/pt/pl/ru) by wiring hardcoded English strings to the `t()` system and
adding the translations. Work on an `ai/i18n-*` branch, one file (or small
batch) per commit, **verify every file before committing**, and report
`COMMIT SUCCEEDED` with the branch name. Owner merges.

This playbook encodes hard-won rules. Follow them exactly — several prevent
real runtime bugs that `tsc`/esbuild will NOT catch.

---

## 1. Two locale stores — route each file correctly

| File location | Store to edit | Lookup namespace |
|---|---|---|
| `saas/components/hub/**`, `saas/lib/infra-pr/ui/**` | `saas/lib/i18n/console.<lang>.json` (one file per language) | `console.*` |
| everything else (`app/admin/**`, `app/dashboard/**`, other `components/**`) | `saas/locales/en.json` + `es/pt/pl/ru.json` | top-level keys |

**Console store — FIVE per-language files** (`console.en.json`, `console.es.json`, `console.pt.json`, `console.pl.json`, `console.ru.json`), each ~33-48KB and individually readable. Each file's TOP LEVEL is the namespace map directly: `{ "ui": {...}, "env": {...}, "vault": {...}, ... }`. A key `console.vault.done` is stored at path `vault.done` inside `console.<lang>.json` — **drop the leading `console.`** (the `console.` prefix maps to the file, not a nested key). To add a key you must edit ALL FIVE files. Read the whole file (they're small now), add the key, write the whole file back.

**Main store (`locales/<lang>.json`):** five separate files, one per language. Add the same key path to all five.

Missing keys fall back to English automatically — so a half-done file is never "broken", just partly English.

---

## 2. The wiring pattern (identical for both stores)

Get the hook in the component, replace each hardcoded string with `t('<key>', '<English fallback>')`.

```tsx
// import (add if absent):
import { useTranslation } from '@/components/i18n/useTranslation'

// inside the component body (NOT module scope):
const { t } = useTranslation()

// before:  <h2>Rotate Key</h2>
// after:   <h2>{t('console.vault.rotate_key', 'Rotate Key')}</h2>
```

The English fallback string must be the **exact original text**. The key name: `console.<namespace>.<snake_case>` for console files; a sensible existing or new top-level path for main-store files.

---

## 3. ⚠️ CRITICAL: every sub-component needs its OWN hook

A file often defines several components/functions (e.g. `EmbeddedVercelEnvList`, `RemoteSelect`, `UtilityFrame`). `const { t } = useTranslation()` only exists in the component where you wrote it. A `t()` call inside a *different* function with no hook compiles fine but **crashes at runtime: `t is not defined`**. esbuild/tsc will NOT catch this.

**Rule:** for EVERY function that contains a `t()` call, confirm that same function body declares `const { t } = useTranslation()`. Add it to each sub-component that needs one. (This bug shipped twice this session before being caught.)

---

## 4. Interpolation — no template syntax in keys

Keep placeholders literal in the stored string, substitute with `.replace()`:

```tsx
// stored:  "rotate_title": "Rotate {name}"
{t('console.vault.rotate_title', 'Rotate {name}').replace('{name}', secret.secret_name)}
// plurals: pick the key, then replace
{(n === 1 ? t('...steps_one','{n} step') : t('...steps_many','{n} steps')).replace('{n}', String(n))}
```

Also localize **label maps / conditionals** (e.g. `{m === 'totp' && 'Authenticator App'}`) — these are user-facing too.

---

## 5. Reuse existing keys

`console.ui.*` already exists with: `close, cancel, execute, confirm, preview, error, success, running, workspace`. Reuse `t('console.ui.close','Close')` / `t('console.ui.cancel','Cancel')` instead of new keys. Existing namespaces in each `console.<lang>.json`: `ui, tier, util, sub, sec, fld, opt, tpl, domains, env, logs, deploy, settings, pr, cui, vault`. (The old single `consoleLocales.json` has been deleted — do not reference it.)

---

## 6. MANDATORY verification before EVERY commit

Do not commit a file until all three pass:

1. **Parses** — the file compiles (esbuild/tsc clean).
2. **Every `t()` is scoped** — each function containing `t()` declares the hook (see §3).
3. **Every key exists in all 5 languages** — for each `t('a.b.c', …)` used, confirm `a.b.c` resolves in en/es/pt/pl/ru. For console keys that means the key exists in all five `console.<lang>.json` files.

Then use the **post-commit verify tool** to confirm the committed file on the `ai/*` branch matches (line count + content). Only then report `COMMIT SUCCEEDED — <branch>`.

Note: `readRepoFile` reads from **main**, not your branch. Read source from main; verify writes against the branch.

---

## 7. Whitespace & editing

Indentation varies line to line. When replacing a string that sits alone on a line, match leading whitespace tolerantly (regex `^\s*TEXT\s*$`) and preserve the indent — do not assume a fixed number of spaces.

---

## 8. Commit cadence

- Branch: `ai/i18n-<area>` (e.g. `ai/i18n-hub-vault`).
- One file, or a small coherent batch (≤4 files), per commit.
- After each commit: run the verify tool, report `COMMIT SUCCEEDED — <branch> — <file>`.
- **Do the first 2-3 files, then STOP and let the owner review the branch** before continuing. Do not autonomously push 60 files unreviewed.

---

## 9. Translation quality caveat (tell the owner)

You (the COS) writing es/pt/pl/ru is acceptable for shipping, but this product is being **sold**. Flag clearly that the machine-written translations should get a **native-speaker pass** before a sale closes. Do not claim native-quality.

---

## 10. Worklist (priority order — Hub Console first, admin last)

Already done (do NOT redo): the 5 Hub pages (Env/Deployments/Logs/Domains/Settings), the PR cockpit (`InfrastructurePage`), `CommandConsole`, `ProviderConsoleCard`, `ProviderActionModal`, `ProviderActionForm`, `vault/RotationModal`.

### HUB CONSOLE — the product (store: lib/i18n/console.<lang>.json (all 5), namespace console.*)  (20 files, ~139 strings)

- [ ] `saas/components/hub/pages/ProviderHealthPage.tsx` (~15+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/UsersPage.tsx` (~13+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/WebhooksPage.tsx` (~12+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/KeyVaultV2Page.tsx` (~12+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/VaultV2Page.tsx` (~11+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/ProviderExpansionPage.tsx` (~10+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/vault/UnlockScreen.tsx` (~8+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/DashboardPage.tsx` (~8+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/vault/MFAVerification.tsx` (~7+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/ProviderGridPage.tsx` (~6+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/ProviderRegistryPage.tsx` (~5+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/UsageCostPage.tsx` (~4+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/TeamAccessPage.tsx` (~4+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/SetupCenterPage.tsx` (~4+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/SecurityAlertsPage.tsx` (~4+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/AuditLogPage.tsx` (~4+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/AIOperationsPage.tsx` (~4+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/pages/KeyVaultPage.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/vault/VaultAuditLog.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/hub/vault/VaultSecretsGrid.tsx` (~2+ strings — READ FULLY, regex undercounts)

### CUSTOMER DASHBOARD (store: locales/<lang>.json)  (12 files, ~55 strings)

- [ ] `saas/app/dashboard/video-page.tsx` (~30+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/video/VideoEditor.tsx` (~5+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/command-control/MissionBar.tsx` (~5+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/lab/page.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/command-control/CommandRail.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/reviews/page.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/promote/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/launchpad/store/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/launchpad/creator/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/launchpad/business/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/wireframes/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/dashboard/outreach/outreach/page.tsx` (~1+ strings — READ FULLY, regex undercounts)

### ADMIN — internal only (store: locales/<lang>.json)  (10 files, ~174 strings)

- [ ] `saas/app/admin/onboarding/page.tsx` (~40+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/admin/outreach/AdmConsoleClient.tsx` (~35+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/admin/page.tsx` (~21+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/admin/overview/page.tsx` (~14+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/admin/AdminSectionView.tsx` (~13+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/admin/settings/roles/page.tsx` (~12+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/admin/revenue/page.tsx` (~12+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/admin/partners/page.tsx` (~12+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/admin/AdminLayoutShell.tsx` (~8+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/admin/settings/page.tsx` (~7+ strings — READ FULLY, regex undercounts)

### OTHER — layout/marketing (store: locales/<lang>.json)  (25 files, ~62 strings)

- [ ] `saas/components/DashboardLayout.tsx` (~14+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/review/[slug]/page.tsx` (~13+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/Testimonials.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/offline/page.tsx` (~3+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/onboarding/page.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/operator/OperatorStatus.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/operator/OperatorPlan.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/FeaturesFlow.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/CreditUsage.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/AdminSidebar.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/hub/vercel/page.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/hub/vault/page.tsx` (~2+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/operator/SitePreview.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/Concierge.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/Navbar.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/pricing/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/podcasters/page.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/operator/OperatorRollback.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/operator/OperatorApproval.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/i18n/I18nProvider.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/TrustSignals.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/Sidebar.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/Footer.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/components/AudioPlayer.tsx` (~1+ strings — READ FULLY, regex undercounts)
- [ ] `saas/app/not-found.tsx` (~1+ strings — READ FULLY, regex undercounts)

---

**Definition of done:** a repo-wide scan for hardcoded user-facing JSX text returns only dynamic data (`{variable}`), never literal English sentences/labels, across every file above — verified per §6.
