import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 
export async function POST() {
  const supabase = createClient();
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
 
