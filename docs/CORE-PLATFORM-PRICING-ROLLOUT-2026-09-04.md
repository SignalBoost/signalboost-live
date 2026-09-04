# Core Platform Launch Pricing Rollout — 2026-09-04

## Accepted result

The Core Platform Launch tier is live at **$15 USD per month** and includes the full isolated AI coding workspace: create, edit, run, test, debug, and repair code.

## Implementation

- PR: `#1833`
- Merge commit: `261062951945ff8b7cbe24d656b161b5fd348a58`
- Public catalog: `saas/lib/config/unifiedPricing.ts`
- Localized capability copy: `saas/lib/i18n/unifiedPricingCopy.ts`
- Checkout route: `saas/app/api/checkout/route.ts`
- Regression: `saas/tests/pricingCatalog.node.test.ts`
- Revenue calculations were updated from $29 to $15.
- Checkout fails closed unless Stripe returns an active monthly USD Price with an exact `unit_amount` of `1500` cents.

## Stripe and Vercel

- Stripe account: Operations (`acct_1TVXgVFDz5G5gxte`)
- Product: `SaaS_LAUNCH`
- Product ID: `prod_VCBZoafYboiBVi`
- Active Price ID: `price_1UBnCKFDz5G5gxteQPKCJwRI`
- Recurrence: monthly
- Amount: `$15.00 USD`
- Existing Vercel variable: `STRIPE_PRICE_WEBSITE_LAUNCH`
- Production variable value: the active Price ID above
- No additional Vercel variable was created or required by the application contract.

Vercel environment changes require a new Production deployment before server routes receive the new value.

## Verification evidence

- Local TypeScript, pricing regression, localization validation, and Next.js Production build passed before merge.
- All completed PR checks passed and the Vercel Preview was READY.
- Production redeployment `dpl_GT7JzfwEzSZUkybdsvWvYJ7LMTwJ` was READY.
- A real authenticated handoff from `https://saas.signalboostapp.com/pricing` opened Stripe Checkout.
- Stripe Checkout displayed `Subscribe to SaaS_LAUNCH` and `$15.00 per month`.
- No payment was submitted or completed during verification.

## Rollback

Stripe Price amounts are immutable. To change the amount again:

1. Create or select the replacement active monthly USD Price under `SaaS_LAUNCH`.
2. Replace the value of `STRIPE_PRICE_WEBSITE_LAUNCH` for Production.
3. Redeploy Production.
4. Open an authenticated Launch Checkout Session and confirm the displayed amount without submitting payment.
5. Deactivate the superseded Price only after the replacement checkout is verified.

