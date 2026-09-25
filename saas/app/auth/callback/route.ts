// saas/app/auth/callback/route.ts
// Handles the redirect from OAuth providers (Google, GitHub) after sign-in.
// Exchanges the auth code for a session and writes the session cookie,
// which is what server-side API routes (like /api/tts) read to identify users.

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";   
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : "/onboarding";

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=missing_code`);
  }

  // Bind every session-cookie mutation produced by exchangeCodeForSession() to the exact
  // redirect response that the browser receives. Do not rely on an ambient cookies() store:
  // a swallowed write failure can make Supabase report a successful token exchange while the
  // browser receives no session and is immediately treated as signed out on /onboarding.
  const redirectResponse = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            redirectResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  return redirectResponse;
}
