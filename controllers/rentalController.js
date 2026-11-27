import { equipmentsCollection, rentalsCollection } from "../config/db.js";
import { CLIENT_URL, stripe } from "../config/stripe.js";
import { saveRentalFromPaidSession } from "../services/rentalService.js";
import { getAvailability } from "../services/availabilityService.js";
import {
  getRentalUnits,
  metadataValue,
  parseDateOnly,
  parseObjectId,
} from "../utils/helpers.js";

// CREATE STRIPE CHECKOUT SESSION
export async function createCheckoutSession(req, res) {
  try {
    const {
      equipmentId,
      startDate,
      endDate,
      quantity,
      phone,
      address,
      instructions,
    } = req.body;

    // Validate input
    if (
      !equipmentId ||
      !startDate ||
      !endDate ||
      !quantity ||
      !phone ||
      !address
    ) {
      return res.status(400).send({
        message: "Please provide all required information",
      });
    }

    const objectId = parseObjectId(equipmentId);

    if (!objectId) {
      return res.status(400).send({
        message: "Invalid equipment ID",
      });
    }

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!start || !end || end.getTime() <= start.getTime()) {
      return res.status(400).send({
        message:
          "Please choose valid rental dates. The end date must be after the start date.",
      });
    }

    const rentalQuantity = Number(quantity);

    if (!Number.isInteger(rentalQuantity) || rentalQuantity < 1) {
      return res.status(400).send({
        message: "Invalid rental quantity",
      });
    }

    // Get equipment from MongoDB
    const equipment = await equipmentsCollection.findOne({ _id: objectId });

    if (!equipment) {
      return res.status(404).send({
        message: "Equipment not found",
      });
    }

    if (equipment.status !== "approved" || equipment.isAvailable === false) {
      return res.status(400).send({
        message: "This equipment is not available",
      });
    }

    // Availability is calculated for the requested dates only. A customer is
    // never blocked because they rented this equipment before; only other
    // paid rentals that overlap these dates reduce the free quantity.
    const availability = await getAvailability({
      equipment,
      startDate,
      endDate,
    });

    console.log(
      `[checkout] Availability for equipment ${equipmentId} (${startDate} to ${endDate}): ${availability.availableQuantity} of ${availability.totalQuantity} available (${availability.reservedQuantity} reserved by overlapping paid rentals).`
    );

    if (rentalQuantity > availability.availableQuantity) {
      return res.status(409).send({
        message: `Only ${availability.availableQuantity} unit(s) are available for ${startDate} to ${endDate}.`,
        availableQuantity: availability.availableQuantity,
        totalQuantity: availability.totalQuantity,
      });
    }

    // Calculate rental days from the validated UTC dates.
    const days = Math.round((end.getTime() - start.getTime()) / 86400000);

    // Calculate the total price using the price stored in MongoDB. The
    // browser's price is only a preview and is never trusted here.
    const rentalUnits = getRentalUnits(equipment.rentalType, days);
    const totalPrice = Number(
      (Number(equipment.price) * rentalUnits * rentalQuantity).toFixed(2)
    );

    if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
      return res.status(400).send({
        message: "Invalid rental price",
      });
    }

    const amountInCents = Math.round(totalPrice * 100);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: equipment.name,
              description: `${days} rental day(s) x ${rentalQuantity} item(s)`,
            },
            unit_amount: amountInCents,
          },
          quantity: 1,
        },
      ],

      success_url: `${CLIENT_URL}/rental/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/equipment/${equipmentId}`,

      metadata: {
        equipmentId,
        equipmentName: metadataValue(equipment.name),
        ownerEmail: metadataValue(equipment.ownerEmail || ""),
        startDate,
        endDate,
        days: String(days),
        rentalUnits: String(rentalUnits),
        quantity: String(rentalQuantity),
        unitPrice: String(equipment.price),
        totalPrice: String(totalPrice),
        phone: metadataValue(phone),
        address: metadataValue(address),
        instructions: metadataValue(instructions || ""),
      },
    });

    console.log(
      `[checkout] Created Stripe session ${session.id} for $${totalPrice} (${rentalQuantity} unit(s), ${rentalUnits} rental unit(s), equipment ${equipmentId}).`
    );

    res.send({
      url: session.url,
      sessionId: session.id,
      totalPrice,
      availableQuantity: availability.availableQuantity,
    });
  } catch (error) {
    console.error("[checkout] Failed to create Stripe Checkout session:", error);

    res.status(500).send({
      message: "Failed to create checkout session",
    });
  }
}

// VERIFY A CHECKOUT SESSION (used by the /rental/success page)
// The success page must not assume a payment worked just because Stripe
// redirected the browser. This asks Stripe for the real payment status.
export async function verifyCheckoutSession(req, res) {
  try {
    const { sessionId } = req.params;

    if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
      return res.status(400).send({ message: "Invalid checkout session ID" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    let rental = await rentalsCollection.findOne({
      stripeSessionId: session.id,
    });

    // Safety net: Stripe says this session is paid, but no rental row exists.
    // That means the webhook was missed (CLI not running, server restarting, a
    // failed delivery...). Save it here so a confirmed payment is never lost.
    // If the webhook arrives later it will simply find the row and ignore it.
    if (!rental && session.payment_status === "paid") {
      console.log(
        `[checkout-session] Session ${session.id} is paid but has no rental row. Saving it from the verification request.`
      );

      await saveRentalFromPaidSession(session, "success page verification");
      rental = await rentalsCollection.findOne({
        stripeSessionId: session.id,
      });
    }

    res.send({
      sessionId: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
      amountTotal: session.amount_total,
      currency: session.currency,
      rental: rental
        ? {
            _id: String(rental._id),
            equipmentId: rental.equipmentId,
            equipmentName: rental.equipmentName,
            rentalStatus: rental.rentalStatus,
            paymentStatus: rental.paymentStatus,
            startDate: rental.startDate,
            endDate: rental.endDate,
            quantity: rental.quantity,
            totalPrice: rental.totalPrice,
          }
        : null,
    });
  } catch (error) {
    console.error(
      `[checkout-session] Could not retrieve session ${req.params.sessionId}:`,
      error.message
    );
    res.status(500).send({ message: "Could not verify the checkout session" });
  }
}
