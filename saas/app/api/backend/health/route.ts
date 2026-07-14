import { NextResponse } from "next/server";
import { backendProvider } from "@/lib/backend/config";
import { pocketBaseHealth } from "@/lib/backend/pocketbase";

export const dynamic = "force-dynamic";

export async function GET() {
  const provider = backendProvider();

  if (provider === "pocketbase") {
    const result = await pocketBaseHealth();
    return NextResponse.json(
      { provider, ...result, checkedAt: new Date().toISOString() },
      { status: result.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      provider,
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      checkedAt: new Date().toISOString(),
      note: "Supabase compatibility mode",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
