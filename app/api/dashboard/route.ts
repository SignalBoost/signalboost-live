import { NextResponse } from "next/server";
import { createMarketingServerSupabase } from "@/lib/auth/supabaseServer";

export const dynamic = "force-dynamic";

// Mock dashboard data. Hardened so it can NEVER serve from a deployed
// environment:
//   • NODE_ENV must be exactly "development" — Vercel preview AND production
//     both run as "production", so this is false on every deploy and the route
//     only ever activates under a local `next dev`.
//   • The explicit ENABLE_DASHBOARD_MOCK=true opt-in is still required.
//   • An authenticated user is still required, even locally (defense in depth).
// Every failed gate returns an identical 404 so the route never advertises its
// own existence, and the catch logs nothing raw.
export async function GET() {
  try {
    const enabled =
      process.env.NODE_ENV === "development" &&
      process.env.ENABLE_DASHBOARD_MOCK === "true";
    if (!enabled) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const supabase = await createMarketingServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      mock: true,
      stats: { projects: 12, automations: 5, blogs: 24 },
    });
  } catch {
    // Cloak the catch path too: return the identical 404 so a thrown
    // Supabase/auth error can't distinguish this route from a non-existent one.
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
}
