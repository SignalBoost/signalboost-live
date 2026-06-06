import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { saasSupabaseCookieOptions } from "@/lib/auth/cookies";
import {
  defaultVideoQuotaMb,
  evaluateVideoAccess,
  normalizeSubscriptionTier,
  type SubscriptionTier,
  type VideoUsageSnapshot,
} from "@/lib/video/tieredAccess";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function getUserId() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: saasSupabaseCookieOptions,
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function readUsage(accountId: string): Promise<VideoUsageSnapshot> {
  const supabase = adminClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status")
    .eq("user_id", accountId)
    .in("status", ["active", "trialing", "past_due"])
    .maybeSingle();

  const tier: SubscriptionTier = normalizeSubscriptionTier(subscription?.plan);
  const quotaMb = defaultVideoQuotaMb(tier);

  const { data: existing } = await supabase
    .from("video_usage")
    .select("quota_mb, used_mb, overage_charges, subscription_tier")
    .eq("account_id", accountId)
    .maybeSingle();

  if (!existing) {
    await supabase.from("video_usage").upsert(
      {
        account_id: accountId,
        subscription_tier: tier,
        quota_mb: quotaMb,
        used_mb: 0,
        overage_charges: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
  }

  return {
    accountId,
    subscriptionTier: normalizeSubscriptionTier(
      existing?.subscription_tier ?? tier,
    ),
    quotaMb: Number(existing?.quota_mb ?? quotaMb),
    usedMb: Number(existing?.used_mb ?? 0),
    overageCharges: Number(existing?.overage_charges ?? 0),
  };
}

export async function GET() {
  const accountId = await getUserId();
  if (!accountId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usage = await readUsage(accountId);
  const decision = evaluateVideoAccess({ usage, uploadSizeMb: 0 });
  return NextResponse.json({ usage, decision });
}

export async function POST(req: NextRequest) {
  const accountId = await getUserId();
  if (!accountId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const uploadSizeMb = Number(body?.uploadSizeMb ?? 0);
  const durationSec =
    body?.durationSec == null ? null : Number(body.durationSec);
  const overageAccepted = Boolean(body?.overageAccepted);
  const billingProvider =
    body?.billingProvider === "paypal" ? "paypal" : "stripe";
  const usage = await readUsage(accountId);
  const decision = evaluateVideoAccess({
    usage,
    uploadSizeMb,
    durationSec,
    overageAccepted,
    billingProvider,
  });

  return NextResponse.json({ usage, decision });
}
