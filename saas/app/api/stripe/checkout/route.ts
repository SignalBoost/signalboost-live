import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
 
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
 
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
 
  const { priceId } = await req.json();
 
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email!,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?success=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?canceled=1`,
  });
 
  return NextResponse.json({ url: session.url });
}
 
