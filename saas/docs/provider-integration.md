# Provider Integration Reference

The Hub Console talks to external providers through a registry of action
templates and executors. This document covers each **live** provider: the
credentials it needs, the permissions those credentials require, and the actions
it exposes. Providers not listed here are present in the UI as **"coming soon"**
and are not yet executable (see the last section).

A provider with no credentials configured simply reports "not connected" — it
never errors. Set only the providers you intend to use.

---

## How credentials are supplied

Provider credentials are read from environment variables (see `.env.example` for
the full list). Sensitive keys can also be stored in the encrypted **Key Vault**
and synced to your host. All provider actions run server-side; no provider secret
is ever exposed to the browser.

Every action passes through the action pipeline — **validate → permission →
execute → audit** — so each call is policy-checked and recorded via the audit
adapter before it touches a provider.

---

## Stripe — billing

**Credentials**

| Variable | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | Server-side API access. |
| `STRIPE_WEBHOOK_SECRET` | Verifies incoming webhook signatures. |
| `STRIPE_PRICE_*` | Price IDs per plan (website + podcast tiers). |

**Permissions:** a standard secret key works. For least privilege, use a Stripe
**restricted key** granting only Products, Prices, Customers, Charges, and
Refunds.

**Actions (14):** view/create/edit/delete/archive **products**;
view/create/edit/archive **prices**; apply **plan templates**; view **customers**
and **charges**; **adjust balance**; **issue refunds**. Destructive actions
(delete product, refund, adjust balance) are policy-gated and audited.

**Example:** "View Products" lists your live catalog; "Create Price" attaches a
new price to an existing product after a preview step.

---

## Supabase — database, auth, storage

**Credentials**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret key. **Bypasses RLS** — never expose it. |

**Permissions:** the service-role key has full project access. Because it bypasses
row-level security, all Supabase actions are owner/admin-gated in the console.

**Actions (19):** list **tables/rows/users/buckets**; insert/edit/archive/delete
**rows**; invite/edit/delete **users**, reset passwords, **auth management**; SQL
editor and **run migration**; storage panel, create/empty **buckets**; **rotate
service key**. Delete/empty/rotate are destructive and require owner approval.

---

## Vercel — hosting & deployments

**Credentials**

| Variable | Purpose |
|---|---|
| `VERCEL_TOKEN` | API token. |
| `VERCEL_HUB_PROJECT` | Project id (`prj_…`). `VERCEL_PROJECT_ID` is an automatic fallback. |
| `VERCEL_TEAM_ID` | Team id (`team_…`), optional for personal projects. `VERCEL_TEAM` is a fallback. |

**Permissions:** a token scoped to the team/project that owns the deployment.

**Actions (9):** view/add/edit/delete **environment variables**; **logs viewer**;
**deployments panel**; **rollback** a deploy; **cancel build**; **domains/DNS**.
Env writes and rollbacks are policy-gated.

---

## GitHub — source control

**Credentials**

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Read access (also relieves rate limits). |
| `GITHUB_WRITE_TOKEN` | Write access (merges, branch deletes, secrets, autonomous commits). |
| `GITHUB_DEFAULT_OWNER` / `GITHUB_DEFAULT_REPO` | Default repo target. |

**Permissions:** a classic PAT needs the **`repo`** scope for write actions; a
fine-grained token needs **Contents**, **Pull requests**, **Issues**, and
**Administration** (for secrets) on the target repo. Read-only setups can supply
just `GITHUB_TOKEN`.

**Actions (14):** view **repos/branches/commits**; list/view/merge/close **pull
requests**; **delete branch**; list/open/edit/close **issues**; **rotate token**;
**manage secrets**. GitHub actions execute through the portable action engine.

---

## OpenAI

**Credentials:** `OPENAI_API_KEY` (optionally `OPENAI_TRANSCRIPTION_MODEL` to
override the default transcription model).

**Permissions:** a standard API key.

**Actions (5):** view **models** and model details; list **files**; view
**fine-tuning jobs** and **batch jobs**. These are read/inspection actions.

---

## Anthropic, Google Gemini, ElevenLabs, Resend, AssemblyAI

These AI/media providers run through the portable console engine. Each needs a
single API key:

| Provider | Variable | Typical actions |
|---|---|---|
| **Anthropic** | `ANTHROPIC_API_KEY` | Invoke model, inspect available models. |
| **Google Gemini** | `GEMINI_API_KEY` | Invoke model, list models. |
| **ElevenLabs** | `ELEVENLABS_API_KEY` | List voices/models, voice details, subscription & usage, generation history (5 actions). |
| **Resend** | `RESEND_API_KEY` | Send email / transactional messages. |
| **AssemblyAI** | `ASSEMBLYAI_API_KEY` | Audio transcription (used by Video Studio). |

**Permissions:** a standard API key per provider. No additional scopes required.

---

## Key Vault — encrypted secrets

**Credentials:** `VAULT_MASTER_KEY` — a 64-hex-character key used for AES-256-GCM
encryption of stored secrets. Generate once and keep it stable; rotating it
invalidates everything in the vault. Optionally `SLACK_VAULT_WEBHOOK_URL` for
audit notifications.

**Actions (9):** add/edit/reveal/archive/delete **secrets**; unlock/seal the
**vault**; view **audit log**. Reveal and delete are owner-gated and audited.

---

## Coming soon (present in UI, not yet executable)

These providers appear in the console as **"coming soon"** — their cards are
visible (with a "Soon" badge) but actions are disabled until executors ship. The
environment variables are documented now so they can be pre-provisioned:

| Provider | Variables |
|---|---|
| **AWS** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| **GCP** | `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` |
| **Twilio** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `TWILIO_VERIFY_SERVICE_SID` |
| **SendGrid** | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` |
| **Cloudflare** | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` |
| **DigitalOcean** | `DIGITALOCEAN_TOKEN` |
| **Datadog** | `DATADOG_API_KEY`, `DATADOG_APP_KEY`, `DATADOG_API_URL` |
| **Sentry** | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` |
| **PagerDuty** | `PAGERDUTY_API_KEY`, `PAGERDUTY_FROM_EMAIL` |
| **Governance** | (internal team/role management — no external credential) |

> Do not advertise a "coming soon" provider as functional. Each becomes live only
> when its executor is implemented and registered.
