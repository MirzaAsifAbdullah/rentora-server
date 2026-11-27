import { equipmentsCollection, rentalsCollection } from "../config/db.js";
import { getAvailability } from "./availabilityService.js";
import { parseDateOnly, parseObjectId } from "../utils/helpers.js";

// ---------------------------------------------------------------------------
// Rental saving helpers
// ---------------------------------------------------------------------------
// Saves the rental for a paid Checkout Session.
//
// Two things call this:
//   1. the Stripe webhook (checkout.session.completed / async_payment_succeeded)
//   2. GET /checkout-session/:sessionId, which the /rental/success page polls
//
// The second call is a safety net: if a webhook is missed (CLI not running, the
// server was restarting, a delivery failed), the success page still saves the
// paid rental. The upsert plus the unique index on stripeSessionId make it safe
// to run both paths for the same session.
export async function saveRentalFromPaidSession(
  session,
  source,
  eventId = null
) {
  console.log(
    `[rental-save] (${source}) Checkout session ${session.id}: payment_status=${session.payment_status}, status=${session.status}, amount_total=${session.amount_total}, currency=${session.currency}`
  );

  if (session.payment_status !== "paid") {
    console.log(
      `[rental-save] Session ${session.id} is not paid yet (${session.payment_status}). Waiting for checkout.session.async_payment_succeeded.`
    );
    return null;
  }

  const metadata = session.metadata || {};
  const equipmentId = metadata.equipmentId;
  const objectId = parseObjectId(equipmentId);
  const startDate = metadata.startDate;
  const endDate = metadata.endDate;
  const quantity = Number(metadata.quantity);
  const days = Number(metadata.days);

  if (
    !objectId ||
    !parseDateOnly(startDate) ||
    !parseDateOnly(endDate) ||
    endDate <= startDate ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    !Number.isInteger(days) ||
    days < 1
  ) {
    console.error(
      `[rental-save] Session ${session.id} has invalid rental metadata. Nothing was saved. metadata=`,
      {
        equipmentId: metadata.equipmentId,
        startDate: metadata.startDate,
        endDate: metadata.endDate,
        quantity: metadata.quantity,
        days: metadata.days,
      }
    );
    return;
  }

  // Never decrement equipment.availableQuantity here. That field is the
  // owner's total stock; availability is derived from the rentals below.
  const equipment = await equipmentsCollection.findOne({ _id: objectId });

  if (!equipment) {
    console.error(
      `[rental-save] Equipment ${equipmentId} for session ${session.id} no longer exists. The paid rental will still be recorded.`
    );
  }

  const availability = equipment
    ? await getAvailability({
        equipment,
        startDate,
        endDate,
        excludeSessionId: session.id,
      })
    : null;

  const availabilityConflict = Boolean(
    availability && quantity > availability.availableQuantity
  );

  if (availabilityConflict) {
    console.error(
      `[rental-save] OVERBOOKING WARNING: session ${session.id} paid for ${quantity} unit(s), but only ${availability.availableQuantity} of ${availability.totalQuantity} are available for ${startDate} to ${endDate}. The rental is saved as "needs_review" so an admin can refund or reassign stock.`
    );
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const rental = {
    stripeSessionId: session.id,
    stripeEventId: eventId,
    paymentIntentId,
    equipmentId,
    equipmentName: equipment?.name || metadata.equipmentName || "",
    ownerEmail: equipment?.ownerEmail || metadata.ownerEmail || "",
    customerEmail:
      session.customer_details?.email || session.customer_email || "",
    customerName: session.customer_details?.name || "",
    startDate,
    endDate,
    days,
    rentalUnits: Number(metadata.rentalUnits) || days,
    quantity,
    phone: metadata.phone || "",
    address: metadata.address || "",
    instructions: metadata.instructions || "",
    unitPrice: Number(metadata.unitPrice) || null,
    totalPrice:
      session.amount_total !== null && session.amount_total !== undefined
        ? session.amount_total / 100
        : Number(metadata.totalPrice) || 0,
    currency: session.currency || "usd",
    paymentStatus: "paid",
    rentalStatus: availabilityConflict ? "needs_review" : "pending",
    availabilityConflict,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    const result = await rentalsCollection.updateOne(
      { stripeSessionId: session.id },
      { $setOnInsert: rental },
      { upsert: true }
    );

    if (result.upsertedCount === 1) {
      console.log(
        `[rental-save] Saved rental ${result.upsertedId} for session ${session.id} (equipment ${equipmentId}, ${quantity} unit(s), ${startDate} to ${endDate}, $${rental.totalPrice}).`
      );
    } else {
      console.log(
        `[rental-save] Rental for session ${session.id} already exists. Duplicate delivery ignored.`
      );
    }
  } catch (error) {
    // The unique index turns a simultaneous retry into a duplicate-key error.
    // That means the other delivery already saved the rental, so it is safe.
    if (error?.code === 11000) {
      console.log(
        `[rental-save] Rental for session ${session.id} was inserted by a concurrent retry. Duplicate ignored.`
      );
      return null;
    }

    throw error;
  }

  return rental;
}

/** Webhook entry point: the event carries the Checkout Session object. */
export async function handlePaidCheckout(event) {
  return saveRentalFromPaidSession(
    event.data.object,
    `webhook ${event.id}`,
    event.id
  );
}

export async function handleFailedCheckout(event, outcome) {
  const session = event.data.object;

  console.log(
    `[stripe-webhook] Checkout session ${session.id} ended as "${outcome}" (payment_status=${session.payment_status}).`
  );

  const result = await rentalsCollection.updateOne(
    { stripeSessionId: session.id },
    {
      $set: {
        paymentStatus: outcome === "failed" ? "failed" : "cancelled",
        rentalStatus: "cancelled",
        statusReason: outcome,
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    console.log(
      `[stripe-webhook] No rental row exists for session ${session.id}; there is no reserved stock to release.`
    );
    return;
  }

  console.log(
    `[stripe-webhook] Rental for session ${session.id} marked as ${outcome}. Its units are released for future availability checks.`
  );
}
