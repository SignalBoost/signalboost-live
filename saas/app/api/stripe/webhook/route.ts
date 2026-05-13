// saas/app/api/stripe/webhook/route.ts

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // ⭐ Auto Top-Up Logic
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;

    const email = invoice.customer_email;
    if (!email) return NextResponse.json({ ok: true });

    // Find user by email
    const { data: user } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .single();

    if (!user) return NextResponse.json({ ok: true });

    // If this is a top-up product
    const isTopUp = invoice.lines.data.some(
      (line) => line.price?.id === process.env.STRIPE_TOPUP_PRICE_ID
    );

    if (isTopUp) {
      await supabase.rpc("add_credits", {
        uid: user.id,
        amount: 50, // ⭐ 50 credits per top-up
      });
    }
  }

  return NextResponse.json({ received: true });
}
