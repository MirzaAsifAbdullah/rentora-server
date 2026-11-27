import { rentalsCollection } from "../config/db.js";
import { RESERVING_RENTAL_STATUSES } from "../utils/constants.js";
import { parseObjectId } from "../utils/helpers.js";

/**
 * Units already reserved by paid rentals that overlap the requested dates.
 * Dates are stored as "YYYY-MM-DD" strings, so $lt/$gt compare them correctly.
 * This is the only place that decides availability — it never looks at the
 * customer, so the same customer can rent the same equipment again.
 */
export async function getReservedQuantity({
  equipmentId,
  startDate,
  endDate,
  excludeSessionId,
}) {
  const objectId = parseObjectId(equipmentId);
  const match = {
    // New rentals store the id as a string; the ObjectId variant keeps older
    // or manually inserted documents visible too.
    equipmentId: { $in: objectId ? [equipmentId, objectId] : [equipmentId] },
    paymentStatus: "paid",
    rentalStatus: { $in: RESERVING_RENTAL_STATUSES },
    startDate: { $lt: endDate },
    endDate: { $gt: startDate },
  };

  if (excludeSessionId) {
    match.stripeSessionId = { $ne: excludeSessionId };
  }

  const [result] = await rentalsCollection
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          reserved: { $sum: { $ifNull: ["$quantity", 0] } },
        },
      },
    ])
    .toArray();

  return result?.reserved ?? 0;
}

/** Total stock minus the units reserved by overlapping paid rentals. */
export async function getAvailability({
  equipment,
  startDate,
  endDate,
  excludeSessionId,
}) {
  const equipmentId = String(equipment._id);
  const totalQuantity = Math.max(0, Number(equipment.availableQuantity) || 0);
  const reservedQuantity = await getReservedQuantity({
    equipmentId,
    startDate,
    endDate,
    excludeSessionId,
  });

  return {
    equipmentId,
    totalQuantity,
    reservedQuantity,
    availableQuantity: Math.max(0, totalQuantity - reservedQuantity),
    startDate,
    endDate,
  };
}
