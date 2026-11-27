import { stripe } from "../config/stripe.js";
import {
  handleFailedCheckout,
  handlePaidCheckout,
} from "../services/rentalService.js";

// ---------------------------------------------------------------------------
// STRIPE WEBHOOK
// ---------------------------------------------------------------------------
// Mounted with express.raw() BEFORE express.json(). Stripe signs the exact raw
// bytes of the request body, and express.json() would replace the Buffer with a
// parsed object, making every signature check fail.
export async function stripeWebhook(req, res) {
  const signature = req.headers["stripe-signature"];

  console.log(
    `[stripe-webhook] Request received (content-type=${
      req.headers["content-type"] || "missing"
    }, body=${
      Buffer.isBuffer(req.body) ? `${req.body.length} bytes` : "NOT a Buffer"
    })`
  );

  if (!signature) {
    console.error(
      "[stripe-webhook] Missing stripe-signature header. Is the Stripe CLI forwarding to this URL?"
    );
    return res.status(400).send("Missing Stripe signature");
  }

  if (!Buffer.isBuffer(req.body)) {
    console.error(
      "[stripe-webhook] Raw body is unavailable. Check that express.json() is registered AFTER this route."
    );
    return res.status(400).send("Webhook body must be raw");
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error(
      "[stripe-webhook] Signature verification FAILED:",
      error.message
    );
    console.error(
      "[stripe-webhook] The most common cause is a stale STRIPE_WEBHOOK_SECRET. Copy the whsec_... printed by the currently running `stripe listen` command into rentora-server/.env and restart the server."
    );
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  console.log(
    `[stripe-webhook] Verified event ${event.id} (type=${event.type}, livemode=${event.livemode})`
  );

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      await handlePaidCheckout(event);
    } else if (event.type === "checkout.session.async_payment_failed") {
      await handleFailedCheckout(event, "failed");
    } else if (event.type === "checkout.session.expired") {
      await handleFailedCheckout(event, "cancelled");
    } else {
      console.log(
        `[stripe-webhook] Event type ${event.type} is not handled; acknowledged.`
      );
    }

    return res.status(200).send({ received: true });
  } catch (error) {
    console.error(
      `[stripe-webhook] FAILED to process event ${event.id} (${event.type}):`,
      error
    );
    // A 500 tells Stripe to retry the delivery.
    return res.status(500).send("Webhook processing failed");
  }
}
