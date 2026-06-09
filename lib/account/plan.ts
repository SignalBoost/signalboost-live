export type Plan = "free" | "launch" | "growth" | "command";

export type SubscriptionStatus = "active" | "inactive" | "trial";

export interface Subscription {
  plan: Plan;
  status: SubscriptionStatus;
  expiresAt?: Date | string | null;
}

type AccountUser = {
  email?: string | null;
  user_metadata?: {
    avatar_url?: string | null;
    full_name?: string | null;
    name?: string | null;
  } | null;
};

export type WorkspaceStatus = "active" | "trialing" | "attention" | "inactive";

export type AccountPlanSnapshot = {
  key: Plan;
  name: string;
  badge: string;
  includedModules: string[];
};

export type AccountSnapshot = {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  isAuthenticated: boolean;
  workspaceStatus: WorkspaceStatus;
  subscriptionStatusLabel: string;
  effectivePlan: AccountPlanSnapshot;
};

const PLAN_SNAPSHOTS: Record<Plan, AccountPlanSnapshot> = {
  free: {
    key: "free",
    name: "Free Demo",
    badge: "Free Demo",
    includedModules: ["promote", "reviews", "calendar"],
  },
  launch: {
    key: "launch",
    name: "Launch",
    badge: "Launch plan",
    includedModules: ["promote", "reviews", "calendar", "spreadsheets", "outreach", "creative"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    badge: "Growth plan",
    includedModules: ["promote", "reviews", "calendar", "spreadsheets", "outreach", "creative", "assistant", "video"],
  },
  command: {
    key: "command",
    name: "Command",
    badge: "Command plan",
    includedModules: ["promote", "reviews", "calendar", "spreadsheets", "outreach", "creative", "assistant", "video", "metrics", "team"],
  },
};

// normalizePlan: maps any legacy or real plan string to the canonical Plan type.
// Old aliases (starter, enterprise, pro, basic, etc.) are preserved so existing
// callers keep working without changes.
export function normalizePlan(plan?: string | null): Plan {
  switch ((plan || "").toLowerCase().trim()) {
    case "free":
    case "demo":
    case "free demo":
      return "free";

    case "launch":
    case "starter":
    case "basic":
      return "launch";

    case "growth":
    case "pro":
    case "paid":
    case "scale":
      return "growth";

    case "command":
    case "enterprise":
    case "business":
      return "command";

    default:
      return "free";
  }
}

export function formatPlanName(plan?: string | null): string {
  const normalized = normalizePlan(plan);
  if (normalized === "free")    return "Free Demo";
  if (normalized === "launch")  return "Launch";
  if (normalized === "growth")  return "Growth";
  return "Command";
}

export function isActiveSubscription(subscription?: Subscription | null): boolean {
  return subscription?.status === "active" || subscription?.status === "trial";
}

export function formatSubscription(subscription?: Subscription | null): string {
  if (!subscription) return "Free Demo plan — inactive";

  const planName = formatPlanName(subscription.plan);

  if (subscription.status === "active") {
    const expiresAt = subscription.expiresAt
      ? new Date(subscription.expiresAt).toLocaleDateString()
      : null;
    return expiresAt
      ? `${planName} plan — active until ${expiresAt}`
      : `${planName} plan — active`;
  }

  if (subscription.status === "trial") {
    return `${planName} plan — trial active`;
  }

  return `${planName} plan — inactive`;
}

function normalizeWorkspaceStatus(status?: string | null): WorkspaceStatus {
  const normalized = (status || "").toLowerCase().trim();
  if (normalized === "active") return "active";
  if (normalized === "trial" || normalized === "trialing") return "trialing";
  if (normalized === "past_due" || normalized === "past due") return "attention";
  return "inactive";
}

function subscriptionStatusLabel(status: WorkspaceStatus): string {
  if (status === "active")    return "Subscription active";
  if (status === "trialing")  return "Trial active";
  if (status === "attention") return "Needs attention";
  return "No active subscription";
}

function displayNameForUser(user?: AccountUser | null): string {
  const metadata = user?.user_metadata;
  const metadataName = metadata?.full_name || metadata?.name;
  if (metadataName) return metadataName;
  if (user?.email) return user.email.split("@")[0] || "SignalBoost user";
  return "SignalBoost guest";
}

export function buildAccountSnapshot(
  user?: AccountUser | null,
  plan?: string | null,
  status?: string | null,
): AccountSnapshot {
  const normalizedPlan  = normalizePlan(plan);
  const workspaceStatus = user ? normalizeWorkspaceStatus(status) : "inactive";

  return {
    displayName:             displayNameForUser(user),
    email:                   user?.email ?? null,
    avatarUrl:               user?.user_metadata?.avatar_url ?? null,
    isAuthenticated:         Boolean(user),
    workspaceStatus,
    subscriptionStatusLabel: subscriptionStatusLabel(workspaceStatus),
    effectivePlan:           PLAN_SNAPSHOTS[normalizedPlan],
  };
}
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { saasSupabaseCookieOptions } from '@/lib/auth/cookies'
import { cookies } from 'next/headers'

// ─── Website plan price IDs ───────────────────────────────────────────────────
// Keys are now the real plan names (launch/growth/command).
// Env var names are unchanged — no Vercel config update needed.
const WEBSITE_PRICE_IDS: Record<string, string> = {
  launch:  process.env.STRIPE_PRICE_WEBSITE_STARTER  as string, // $29
  growth:  process.env.STRIPE_PRICE_WEBSITE_PRO      as string, // $99
  command: process.env.STRIPE_PRICE_WEBSITE_BUSINESS as string, // $249
}

// ─── Podcast plan price IDs ───────────────────────────────────────────────────
const PODCAST_PRICE_IDS: Record<string, string> = {
  indie:   process.env.STRIPE_PRICE_PODCAST_INDIE   as string,
  pro:     process.env.STRIPE_PRICE_PODCAST_PRO     as string,
  network: process.env.STRIPE_PRICE_PODCAST_NETWORK as string,
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const plan: string = body.plan
    // productLine defaults to 'website' so the existing pricing page works unchanged
    const productLine: 'website' | 'podcast' = body.productLine ?? 'website'

    const priceMap =
      productLine === 'podcast' ? PODCAST_PRICE_IDS : WEBSITE_PRICE_IDS
    const priceId = priceMap[plan]

    if (!priceId) {
      console.error('Checkout: invalid plan/productLine combo', { plan, productLine })
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    // ── Read the logged-in user from Supabase cookies ────────────────────────
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: saasSupabaseCookieOptions,
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              )
            } catch {
              // Called from a Server Component — safe to ignore
            }
          },
        },
      },
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user?.id) {
      console.error('Checkout: no authenticated user', authError?.message)
      return NextResponse.json(
        { error: 'You must be signed in to subscribe.' },
        { status: 401 },
      )
    }

    const userId    = user.id
    const userEmail = user.email || ''

    console.log('Checkout: creating session for', { userId, plan, productLine, priceId })

    // ── Build Stripe Checkout Session params ─────────────────────────────────
    const params: Record<string, string> = {
      mode:                                       'subscription',
      'payment_method_types[0]':                  'card',
      'line_items[0][price]':                     priceId,
      'line_items[0][quantity]':                  '1',
      success_url:                                `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?success=true`,
      cancel_url:                                 `${process.env.NEXT_PUBLIC_APP_URL}/pricing?cancelled=true`,
      // Session metadata (available on checkout.session.completed)
      'metadata[userId]':                         userId,
      'metadata[priceId]':                        priceId,
      'metadata[plan]':                           plan,
      'metadata[productLine]':                    productLine,
      // Subscription metadata (available on all subscription events)
      'subscription_data[metadata][userId]':      userId,
      'subscription_data[metadata][priceId]':     priceId,
      'subscription_data[metadata][plan]':        plan,
      'subscription_data[metadata][productLine]': productLine,
    }

    // Pre-fill the email on the Stripe Checkout form for smoother UX
    if (userEmail) {
      params['customer_email'] = userEmail
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params).toString(),
    })

    const session = await stripeRes.json()

    if (!stripeRes.ok) {
      console.error('Stripe checkout creation failed', session.error)
      return NextResponse.json(
        { error: session.error?.message || 'Stripe error' },
        { status: 400 },
      )
    }

    console.log('Checkout: session created', session.id)
    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Checkout route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
