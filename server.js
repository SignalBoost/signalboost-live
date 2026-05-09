import express from "express"
import dotenv from "dotenv"
import Stripe from "stripe"
import { createClient } from "@supabase/supabase-js"

dotenv.config()
const app = express()
app.use(express.json())

// Supabase client (service role key for secure ops)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Health check
app.get("/", (req, res) => res.send("Backend running"))

// Create checkout session
app.post("/create-checkout-session", async (req, res) => {
  const { userId } = req.body
  try {
    const customer = await stripe.customers.create({ metadata: { userId } })
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: "SignalBoost Subscription" },
          unit_amount: 1000
        },
        quantity: 1
      }],
      mode: "subscription",
      success_url: "https://saas.signalboostapp.com/success",
      cancel_url: "https://saas.signalboostapp.com/cancel"
    })
    res.json({ id: session.id })
  } catch (err) {
    console.error(err)
    res.status(500).send({ error: "Checkout session failed" })
  }
})

// Stripe webhook
app.post("/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"]
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object
      console.log("Payment success:", session)
      // TODO: update Supabase subscription table
    }
    res.json({ received: true })
  } catch (err) {
    console.error("Webhook error:", err.message)
    res.status(400).send(`Webhook Error: ${err.message}`)
  }
})

app.listen(5000, () => console.log("Backend running on port 5000"))
