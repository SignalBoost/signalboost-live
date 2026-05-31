# SignalBoost auth redirect separation

SignalBoost uses separate auth redirect targets for the marketing site and the SaaS cockpit so a login started on one host completes on that same host.

## Supabase redirect URLs to allow

Add both URLs to the Supabase Auth URL configuration for any shared auth project:

- `https://signalboostapp.com/auth/callback` for the main SignalBoost marketing / partner site.
- `https://saas.signalboostapp.com/auth/callback` for the SaaS dashboard cockpit.

Local development can continue to use the current localhost origin because the redirect helpers preserve localhost and `127.0.0.1` origins.

## Optional project split

For full auth isolation, create a second Supabase project for `signalboostapp.com` and set these main-site environment variables in Vercel:

- `NEXT_PUBLIC_SIGNALBOOST_SUPABASE_URL`
- `NEXT_PUBLIC_SIGNALBOOST_SUPABASE_ANON_KEY`

If those values are absent, the main site falls back to the existing shared `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` values. The SaaS cockpit continues to use its existing Supabase variables.
