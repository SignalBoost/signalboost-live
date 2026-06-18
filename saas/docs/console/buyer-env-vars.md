# Console Hub & PR Cockpit — Environment Variables

This is the buyer-facing environment reference for the portable Console Hub and
PR Cockpit. Set these in your hosting provider (e.g. Vercel → Project → Settings
→ Environment Variables). Only the **Core** group is required to boot the
console; provider keys are needed only for the providers you actually use.

> Naming note: variables prefixed `NEXT_PUBLIC_` are exposed to the browser by
> design. Never put a secret behind a `NEXT_PUBLIC_` name.

## Core (required)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Verifies the operator's session. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Used for session resolution. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key. Used server-side by the PR engine, the credential vault, and the hub-user/role lookup. Never exposed to the browser. |
| `VAULT_MASTER_KEY` | Master key the credential vault uses to encrypt stored provider keys at rest. Generate a strong random value and keep it stable. |

## PR Cockpit

| Variable | Required | Purpose |
| --- | --- | --- |
| `VERCEL_DEPLOY_HOOK_URL` | Optional | If set, merging a PR triggers a production redeploy via this hook. Without it, merge still runs the action and records that redeploy was skipped. |
| `AUDIT_SECRET` | Recommended | Used to sign/identify audit entries written on every PR transition. |

The PR Cockpit replays each approved step through your existing
`/api/hub/action` engine, so a merge needs whatever provider keys its steps
touch (see **Providers** below).

## Deployments / Vercel actions

| Variable | Required | Purpose |
| --- | --- | --- |
| `VERCEL_TOKEN` | For Vercel actions | Vercel API token. |
| `VERCEL_HUB_PROJECT` | For Vercel actions | The project the console operates on (name or id). Falls back to `VERCEL_PROJECT_ID` if unset. There is **no hardcoded project default** — set one of these. |
| `VERCEL_PROJECT_ID` | Optional | Alternative to `VERCEL_HUB_PROJECT`. |
| `VERCEL_TEAM_ID` / `VERCEL_TEAM` | If team-scoped | Required when the project lives under a Vercel team. |

## GitHub provider

| Variable | Required | Purpose |
| --- | --- | --- |
| `GITHUB_WRITE_TOKEN` | For GitHub actions | Personal access / fine-grained token with the scopes you intend to use. |
| `GITHUB_DEFAULT_OWNER` | Optional | Fallback owner when a request does not specify `owner/name`. **No SignalBoost default** — unset means the operator must select a repo. |
| `GITHUB_DEFAULT_REPO` | Optional | Fallback repository name, paired with `GITHUB_DEFAULT_OWNER`. |
| `NEXT_PUBLIC_CONSOLE_DEFAULT_REPO` | Optional | Pre-selects a repo (`owner/name`) in the console's repository picker. Unset → the picker opens with no pre-selection, so a buyer never sees another tenant's repo. |

## Supabase management (SQL Editor / project picker)

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | For SQL Editor & project picker | Supabase Management API token used to list projects and run gated SQL. |

## Providers (set only what you use)

Each provider's actions are inert until its key is present.

| Provider | Variables |
| --- | --- |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| ElevenLabs | `ELEVENLABS_API_KEY` |
| AssemblyAI | `ASSEMBLYAI_API_KEY` |
| Resend | `RESEND_API_KEY` |
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_VERIFY_SERVICE_SID` |
| SendGrid | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` |
| Cloudflare | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` |
| DigitalOcean | `DIGITALOCEAN_TOKEN` |
| Datadog | `DATADOG_API_KEY`, `DATADOG_APP_KEY`, `DATADOG_API_URL` |
| Sentry | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` |
| PagerDuty | `PAGERDUTY_API_KEY`, `PAGERDUTY_FROM_EMAIL` |
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| GCP | `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` |
| Auth0 | `AUTH0_DOMAIN`, `AUTH0_MGMT_CLIENT_ID`, `AUTH0_MGMT_CLIENT_SECRET` |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` |
| Slack (vault alerts) | `SLACK_VAULT_WEBHOOK_URL` |

## Secondary / multi-project Supabase (optional)

Only relevant if you operate more than one Supabase project from the console:
`MARKETING_SUPABASE_URL`, `MARKETING_SUPABASE_SERVICE_ROLE_KEY`,
`SECONDARY_SUPABASE_URL`, `SECONDARY_SUPABASE_SERVICE_ROLE_KEY`.
