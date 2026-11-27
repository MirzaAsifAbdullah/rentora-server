import { ObjectId } from "mongodb";

export function parseObjectId(value) {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{24}$/.test(value)) {
    return null;
  }

  return new ObjectId(value);
}

/** Parses "YYYY-MM-DD" and rejects impossible dates such as 2026-02-31. */
export function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10) === value ? date : null;
}

/** Daily rentals are charged per day, weekly per started week, monthly per 30 days. */
export function getRentalUnits(rentalType, days) {
  const type = String(rentalType || "").toLowerCase();

  if (type.includes("week")) {
    return Math.ceil(days / 7);
  }

  if (type.includes("month")) {
    return Math.ceil(days / 30);
  }

  return days;
}

/** Stripe metadata values must be strings and at most 500 characters. */
export function metadataValue(value) {
  return String(value ?? "").slice(0, 500);
}

/** Escape user input before turning it into a MongoDB regular expression. */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `a,b` and repeated `?key=a&key=b` both become `["a", "b"]`. */
export function toList(value) {
  const raw = Array.isArray(value) ? value : [value];

  return raw
    .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeEquipment(equipment) {
  return {
    ...equipment,
    isAvailable: equipment.isAvailable !== false,
  };
}
