# Enterprise Social Outreach — Plug-and-Play Backend

SignalBoost social outreach is designed as an enterprise connector layer, not as a single-company shortcut.

## Goal

A buyer or enterprise tenant should be able to enable the social outreach engine by configuring provider apps, connecting social accounts, and using the same draft/approval/publish workflow without code changes.

## Supported provider adapters

The backend registry currently supports:

- LinkedIn company pages
- Reddit subreddit posts
- Instagram Business publishing
- Facebook Pages
- X/Twitter
- TikTok video publishing
- YouTube channel uploads

Adapters live in `saas/lib/outreach/social-connectors.ts`.

## Backend tables

The setup/migration creates:

- `outreach_social_tokens` — per-user stored OAuth tokens and destination account refs.
- `outreach_social_campaigns` — enterprise social campaign parent records.
- `outreach_social_campaign_posts` — one platform-specific post draft/result per campaign/platform.

## Runtime APIs

- `GET /api/outreach/social/setup`
  - Creates/verifies the backend social outreach schema through the existing owner/admin setup mechanism.

- `GET /api/outreach/social/capabilities`
  - Reports which platforms are supported, which provider apps are configured, which accounts are connected, which destination refs are missing, and which platforms are publish-ready.
  - Does not expose token values.

- `GET /api/outreach/social/campaigns`
  - Lists enterprise social campaigns and their platform-specific draft posts.

- `POST /api/outreach/social/campaigns`
  - Creates one campaign and platform-specific drafts for all requested networks.

- `POST /api/outreach/social/campaigns/publish`
  - Publishes approved campaign posts only.
  - Uses stored OAuth tokens.
  - Requires account refs for LinkedIn, Facebook, Instagram, and Reddit.
  - Requires video URLs for TikTok and YouTube.
  - Records success/failure per platform.

- `POST /api/outreach/social/post`
  - Legacy/one-off approved outreach social publisher, now using stored OAuth tokens and honest provider results.

## Enterprise safety rules

The backend must never fake success. It only reports a post as live when the provider returns a real provider post ID. Missing OAuth credentials, missing destination refs, missing media, provider API failure, or token refresh failure must return a failed result and be audit logged.

Publishing remains gated by:

- owner/admin approval,
- panic switch,
- daily send limit,
- stored OAuth token,
- provider/destination requirements,
- real provider response.

## Configuration pattern

Each platform uses environment variables with this pattern:

```text
SOCIAL_<PLATFORM>_CLIENT_ID
SOCIAL_<PLATFORM>_CLIENT_SECRET
```

Examples:

```text
SOCIAL_LINKEDIN_COMPANY_CLIENT_ID
SOCIAL_LINKEDIN_COMPANY_CLIENT_SECRET
SOCIAL_REDDIT_CLIENT_ID
SOCIAL_REDDIT_CLIENT_SECRET
SOCIAL_INSTAGRAM_BUSINESS_CLIENT_ID
SOCIAL_INSTAGRAM_BUSINESS_CLIENT_SECRET
```

## Tenant onboarding flow

1. Run `/api/outreach/social/setup`.
2. Configure provider apps and env vars.
3. Connect tenant/user social accounts and store tokens in `outreach_social_tokens`.
4. Store required `account_ref` values where needed:
   - LinkedIn: organization id.
   - Facebook: page id.
   - Instagram: IG business account id.
   - Reddit: subreddit name.
5. Check `/api/outreach/social/capabilities`.
6. Create campaigns through `/api/outreach/social/campaigns`.
7. Approve and publish through `/api/outreach/social/campaigns/publish`.

## Sale-readiness note

The feature can exist unused by SignalBoost itself while still being sale-ready. Enterprise buyers care that the architecture is real: schema, token model, connector registry, readiness checks, audit trail, approval gates, and honest error reporting. That is what this module provides.
