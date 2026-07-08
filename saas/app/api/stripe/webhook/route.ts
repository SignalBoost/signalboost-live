// Compatibility endpoint for Stripe Dashboard webhooks.
//
// The main Stripe webhook implementation lives at /api/webhook.
// Stripe is currently configured to deliver live events to /api/stripe/webhook,
// so this route forwards the same POST handler instead of returning 404.
// Keep this thin wrapper so both endpoint URLs remain supported.

export { POST } from '../../webhook/route'
