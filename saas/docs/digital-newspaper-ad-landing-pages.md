# Digital Newspaper Ad Landing Pages

Use this note when preparing digital free-newspaper, community classified, or local directory ads.

## Preferred public links

### 1. Free Website Optimization Scan

- URL: `https://www.saas.signalboostapp.com/website-optimizer`
- Route: `/website-optimizer`
- Goal key: `website_optimization`
- Best for: website optimization, SEO, performance, accessibility, conversion, business growth.
- Recommended newspaper CTA: **Try a free website optimization scan.**

### 2. Free Cybersecurity Preview

- URL: `https://www.saas.signalboostapp.com/cybersecurity-check`
- Route: `/cybersecurity-check`
- Goal key: `cybersecurity_preview`
- Best for: safe public cybersecurity checks, HTTPS, security headers, cookie flags, and public exposure signals.
- Recommended newspaper CTA: **Try a free cybersecurity preview.**

## Internal/reference link

### 3. Audit Console

- URL: `https://www.saas.signalboostapp.com/dashboard/audit`
- Route: `/dashboard/audit`
- Goal key: `audit_console`
- Best for: logged-in product/dashboard users.
- Newspaper-ad use: **Do not use as the default public CTA.** Prefer `/website-optimizer` or `/cybersecurity-check`.

## Source of truth in code

The canonical registry is:

`saas/lib/outreach/adLandingPages.ts`

The digital newspaper ad planner should use this registry instead of hardcoding landing-page URLs in multiple places.

## Safety rule

Newspaper/classified ads must point to public-safe pages unless the ad is explicitly targeting existing logged-in users. Do not link cold public ads directly to owner/admin dashboards.
