// saas/app/api/stripe/portal/route.ts

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer_email: user.email!,
    return_url: `${process.env.NEXT_PUBLIC_URL}/dashboard`,
  });

  return NextResponse.json({ url: portal.url });
}
