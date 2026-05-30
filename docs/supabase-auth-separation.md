# SignalBoost Supabase auth separation

## Redirect URLs to keep in Supabase

Add both production callback URLs to the Supabase Auth Redirect URLs allow-list:

- `https://signalboostapp.com/auth/callback` for the marketing site.
- `https://saas.signalboostapp.com/auth/callback` for the SaaS cockpit.

The marketing login page now sends OAuth users back to `/auth/callback` on the current `signalboostapp.com` origin. The SaaS cockpit continues to use the existing `/auth/callback` route on `saas.signalboostapp.com`.

## Cookie scope

Both apps intentionally use host-only Supabase auth cookies by omitting a cookie `domain` value:

- `signalboostapp.com` stores marketing auth in `sb-marketing-auth-token` for that host only.
- `saas.signalboostapp.com` stores SaaS cockpit auth for that host only.

Do not configure `.signalboostapp.com` as the cookie domain unless both apps are intentionally sharing sessions.

## Separate Supabase project option

A second Supabase project is not required for the current code-level separation because host-only cookies and separate callback URLs isolate browser sessions. If operators need fully separate users, providers, audit logs, or auth policies, create a dedicated marketing Supabase project and set the marketing deployment's `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to that project while leaving the SaaS deployment pointed at the cockpit project.
