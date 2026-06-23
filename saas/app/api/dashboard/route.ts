import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Mock data only. Off by default — requires an explicit env flag AND a
    // non-production build, so staging/preview deploys never expose it.
    const enabled =
      process.env.NODE_ENV !== "production" &&
      process.env.ENABLE_DASHBOARD_MOCK === "true";

    if (!enabled) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      mock: true,
      stats: { projects: 12, automations: 5, blogs: 24 },
    });
  } catch (err) {
    console.error("dashboard mock route error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
