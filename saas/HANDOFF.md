SignalBoost SaaS — Project Handoff
> **For the next developer or AI agent picking this up:** read this file first, then check the latest commit on `main`. Confirm assumptions before writing code. Do not trust the previous assistant to have remembered every decision — what's written here is the source of truth.
---
Project at a glance
Live URL: https://saas.signalboostapp.com
Repo: `SignalBoost/signalboost-live`
Working directory: `saas/`
Hosting: Vercel
Supabase project ID: `dwchaygtxubufxkzfpne`
Contact: cadomos@gmail.com
Tech stack
Next.js (App Router) + TypeScript
Tailwind CSS
Supabase (auth + database)
Stripe (payments + webhooks)
Anthropic API (server-side only — see "Naming rules" below)
What is already done
Root layout with shared navbar + footer across all pages
OAuth: Google + GitHub
Pricing page (USD only)
Podcasters landing page
Docs page (transparent background)
Onboarding wizard — skippable, runs once per user
Dashboard with greeting + AI prompt input
Four dashboard sub-pages: builder, reviews, audio, video
Feedback page
Stripe checkout + webhook wired end to end
What is still to do
ElevenLabs TTS integration — for the audio sub-page.
PWA icons — full set: 192, 512, maskable, apple-touch-icon, favicon, plus `manifest.json`.
Vercel + GitHub OAuth for end users — so users can deploy their own generated sites to their own Vercel accounts from their own GitHub repos.
Key decisions (do not change without asking)
Partner trial → Starter plan only. Do not auto-upgrade partner trials to higher tiers.
Supported languages → Portuguese (BR + PT) and Spanish (ES + LATAM). English is used internally for dev but is not the primary user-facing language.
Feedback banner copy: `"We are always improving"` — verbatim. Do not rewrite.
Pricing is USD only. No multi-currency yet.
Naming rules — important: the underlying AI provider must not be mentioned anywhere user-facing. No "Claude", no "Anthropic", no model names in the UI, in marketing copy, in toast messages, or in error states. Server-side code may reference the SDK as needed; that's fine.
Session-tips system (this handoff includes new code)
A user-facing "long sessions" workflow has been added. Files:
`saas/lib/i18n/session-tips.ts` — copy in EN / PT / ES
`saas/hooks/useSessionTimer.ts` — tracks active time via localStorage, fires a warning at 2h
`saas/components/session/SessionTipsBanner.tsx` — dismissible dashboard banner; auto-promotes to a stronger warning at 2h
`saas/components/session/SessionTipsDocsSection.tsx` — docs page section
`saas/components/session/SessionTipsOnboardingStep.tsx` — wizard step
`saas/components/session/SummarizeSessionButton.tsx` — one-click "summarize this session" action
Wiring checklist
[ ] Import `<SessionTipsBanner locale={userLocale} />` near the top of `app/dashboard/page.tsx`.
[ ] Import `<SessionTipsDocsSection locale={userLocale} />` into the docs page, ideally as its own anchored section (`#long-sessions`).
[ ] Add `<SessionTipsOnboardingStep />` as the final step of the onboarding wizard (before the "finish" CTA). Wizard remains skippable; this step is optional, not gating.
[ ] Wire `<SummarizeSessionButton onInsertPrompt={...} />` into the dashboard AI prompt area so clicking it inserts the summary request into the user's prompt input.
[ ] On "new session" actions (e.g. user clicks a "start fresh" button), call the timer's `reset()` so the 2h warning recalibrates.
Why the timer is time-based, not AI-self-reported
The 2-hour warning is triggered by elapsed wall-clock time stored in localStorage, not by the AI assistant deciding it is "running low on memory". The assistant cannot reliably know its own context-window state — it can only guess, and the guess is wrong often enough that gating UX on it would be worse than not having the feature. Time elapsed and turn count are the reliable signals. Do not refactor this to ask the model to self-report.
How to resume work (for the next agent)
Read this file in full.
`git log --oneline -20` to see recent commits.
Run the app locally and visit `/dashboard`, `/docs`, and the onboarding flow to confirm the current state matches what's described above.
Pick a single item from "What is still to do" — confirm scope with the project owner before starting.
Respect the "Key decisions" section. If a request seems to conflict with one of those decisions, surface the conflict rather than silently overriding it.
At the end of your working session, update this file: move completed items out of "still to do", add anything new under a dated changelog at the bottom.
Recommended session rhythm
Work in blocks of 2–3 hours max.
At the end of each block, generate a summary of what you did and append it to a notes file (or to the changelog below).
Start the next block by re-reading this file plus the latest changelog entry.
---
Changelog
2026-05-17
Added session-tips system (banner, docs section, onboarding step, timer hook, summarize button) with EN/PT/ES copy.
Created this HANDOFF.md.
