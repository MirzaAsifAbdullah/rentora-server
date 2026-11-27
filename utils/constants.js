// A paid rental with one of these statuses still holds its units. Anything
// else (cancelled, completed, returned, rejected, expired) is ignored by
// availability checks, so changing the status releases the stock.
// "needs_review" is a paid rental that arrived after the last unit was taken;
// it still counts so the system does not keep overselling while an admin
// refunds or reassigns it.
export const RESERVING_RENTAL_STATUSES = [
  "pending",
  "confirmed",
  "active",
  "needs_review",
];

export const EQUIPMENT_SORTS = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { price: 1, _id: 1 },
  "price-desc": { price: -1, _id: -1 },
};
