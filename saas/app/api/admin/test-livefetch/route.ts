// /saas/app/api/admin/test-livefetch/route.ts
// Browser-testable verification for the live data connector.
// Gated by a secret so it is not publicly abusable.
//
// Required env var (Vercel > signalboost-live):
//   LIVEFETCH_TEST_KEY  (any random string you choose)
//
// Test 1 (valid query returns results):
//   /api/admin/test-livefetch?key=YOUR_SECRET&q=latest+AI+news
// Test 2 (empty query returns fallback):
//   /api/admin/test-livefetch?key=YOUR_SECRET&q=

import { NextRequest, NextResponse } from "next/server";
import { fetchLiveData, formatLiveResults } from "@/lib/ai/liveFetch";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.LIVEFETCH_TEST_KEY;
  const key = req.nextUrl.searchParams.get("key");

  if (!secret || key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const started = Date.now();
  const results = await fetchLiveData(q);
  const elapsedMs = Date.now() - started;

  return NextResponse.json({
    query: q,
    elapsedMs,
    resultCount: results.length,
    formatted: formatLiveResults(results),
    results,
  });
}
