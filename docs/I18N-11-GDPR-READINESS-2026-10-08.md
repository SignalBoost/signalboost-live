# Eleven-language expansion and GDPR readiness gate

**Status:** implementation specification, **not** localization or GDPR certification. Owner request: 2026-10-08. Tracking: [#3922](https://github.com/SignalBoost/signalboost-live/issues/3922).

## Release invariant
**Activated 2026-10-09:** all eleven languages `en/es/pt/pl/ru/de/fr/it/ja/ko/ar` are canonical in `SUPPORTED_LANGUAGES`. The five-language gate was replaced by `check-eleven-language-platform.mjs`, `check-eleven-language-coverage.mjs --require-all` and `audit-locale-structure.mjs` (exact key parity, blank, placeholder/URL-token and untranslated-English checks across every locale store), wired into `prebuild` so a regression fails the Vercel build. The six new languages were AI-translated and validated automatically; they have **not** had native-speaker review. The GDPR section below is unaffected by this activation and remains open.

## Implementation checklist
1. Add six languages to every user-facing locale store and canonical language routing, translations for AI/COS and generated UI, notifications, onboarding, public pages, accessibility, pricing and legal text. Translate from vetted copy, not duplicate English as a placeholder. Keep locale key parity and add automated missing/extra/blank/untranslated checks.
2. Refactor five-language assumptions in `saas/scripts/check-five-language-platform.mjs`, `saas/scripts/generated-ui-locale-utils.mjs`, response routing, loader/import registration, selectors, and any pinned five-language patterns. Keep a CI build gate.
3. For Arabic use document `dir=rtl`, bidi-aware logical styles, RTL-aware focus/navigation and correct LTR isolation for code, account identifiers, URLs, and email addresses. Validate screen readers and forms. For Japanese and Korean validate typography, input methods and line breaks.
4. Verify per-language end-to-end scenarios including locale persistence, cross-language prompt priority, errors, generated UI, dashboards, account settings, cookie/privacy UI, mobile and email.

## EU/EEA privacy acceptance
1. Publish a controller/processor and subprocessor data-flow inventory for authentication, tenants, payment, telemetry, support, outreach, chat prompts, generated content, logs, AI providers, training/distillation and backups; identify legal bases and retention limits for each purpose.
2. Provide secure, auditable subject rights request workflows (access, correction, export, erasure, restriction, objection and consent withdrawal) with backend deletion/propagation and exceptions where legally required. Test against actual tenant and provider records.
3. Enforce opt-in or other documented lawful authority for independent training/distillation use; forbid data reuse across tenants and prohibit uncontrolled AI provider egress. Consent UI alone does not justify training.
4. Implement appropriate consent controls for optional analytics/marketing cookies, transparency and withdrawal; apply settings across frontend and server.
5. Inventory processing locations and international transfers; determine appropriate DPAs, adequacy decisions or SCCs, transfer impact assessments and technical safeguards. Validate cross-border processing of EU personal data, not just server regions.
6. Assess DPIA, security, incident response and required breach notification, EU representative and DPO obligations where applicable. Obtain independent legal review of policy, contracts, processes and evidence.

## Release decision
Not EU/GDPR certified until deploy-revision-specific testing proves control behavior and the legal/organizational requirements have been satisfied. No inferred compliance from repository code, country-language selections or green unit tests alone.

### Reference
- [European Commission: GDPR application](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en)
- [European Commission: international transfer SCCs](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en)
