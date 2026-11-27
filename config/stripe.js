import Stripe from "stripe";

export const CLIENT_URL = (
  process.env.CLIENT_URL || "http://localhost:3000"
).replace(/\/+$/, "");

// ---------------------------------------------------------------------------
// Startup configuration checks
// ---------------------------------------------------------------------------
// A wrong key here is the most common reason a checkout or webhook silently
// fails, so fail fast with a clear message instead of a Stripe stack trace.
if (!process.env.STRIPE_SECRET_KEY) {
  console.error(
    "[startup] STRIPE_SECRET_KEY is missing. Add the secret key from https://dashboard.stripe.com/test/apikeys to rentora-server/.env"
  );
  process.exit(1);
}

if (process.env.STRIPE_SECRET_KEY.startsWith("pk_")) {
  console.error(
    "[startup] STRIPE_SECRET_KEY is a publishable key (pk_...). Use the secret key (sk_test_... or sk_live_...)."
  );
  process.exit(1);
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
  console.error(
    "[startup] STRIPE_WEBHOOK_SECRET is missing. Run `stripe listen --forward-to localhost:5000/stripe-webhook` and copy the whsec_... value into rentora-server/.env"
  );
  process.exit(1);
}

if (!process.env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_")) {
  console.error(
    "[startup] STRIPE_WEBHOOK_SECRET does not start with whsec_. Use the signing secret printed by the Stripe CLI or Dashboard endpoint, not an API key."
  );
  process.exit(1);
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log(
  `[startup] Stripe ready (${process.env.STRIPE_SECRET_KEY.startsWith("sk_test_") ? "TEST mode" : "LIVE mode"})`
);
console.log(
  `[startup] Webhook secret loaded (${process.env.STRIPE_WEBHOOK_SECRET.length} chars)`
);
