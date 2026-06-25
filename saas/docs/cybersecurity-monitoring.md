# SignalBoost Cybersecurity Monitoring

This document explains the first production-ready Cybersecurity Center workflow.

## What is implemented

- Manual dependency advisory scans from `/dashboard/cybersecurity`
- Monitor configuration for public GitHub repositories
- Scheduled scan API route at `/api/cron/cyber-dependency-monitor`
- Alert inbox for new critical/high dependency advisories
- Optional email alerts through Resend
- Scan history in `cyber_dependency_scans`
- Monitor/alert storage in `cyber_monitored_repositories` and `cyber_alerts`

## Required migrations

Apply these Supabase migrations:

- `20260623_cyber_dependency_scans.sql`
- `20260624_cyber_monitors_alerts.sql`

## Required environment variables

```env
CRON_SECRET=generate-a-long-random-secret
```

Optional email alert variables:

```env
RESEND_API_KEY=your-resend-key
CYBER_ALERT_EMAIL=owner-or-security-inbox@example.com
RESEND_FROM_EMAIL="SignalBoost Alerts <alerts@signalboostapp.com>"
```

If `RESEND_API_KEY` or `CYBER_ALERT_EMAIL` is missing, scans still run and alerts still appear in the UI; email sending is skipped.

## Scheduler

Configure Vercel Cron or an external scheduler to call:

```text
GET /api/cron/cyber-dependency-monitor
Authorization: Bearer $CRON_SECRET
```

Suggested schedule:

```text
0 8 * * *
```

The route checks every enabled monitor and only scans repositories that are due based on their frequency:

- `daily`: roughly every 23 hours
- `weekly`: roughly every 6.5 days

## Current limitations

- Public GitHub repositories only
- npm package manifests and package-lock files only
- Alerts are generated for critical/high dependency advisories
- Private GitHub repo scanning requires connected GitHub OAuth/App installation and is not wired yet
- Domain, SSL, header, and runtime threat checks are not yet implemented
