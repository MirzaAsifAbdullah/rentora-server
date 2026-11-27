import { MongoClient } from "mongodb";

// ---------------------------------------------------------------------------
// MongoDB connection
// ---------------------------------------------------------------------------
if (!process.env.MONGODB_URI) {
  console.error(
    "[startup] MONGODB_URI is missing. Add the same connection string the Next.js app uses."
  );
  process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

export const db = client.db("rentora");
export const equipmentsCollection = db.collection("equipments");
export const rentalsCollection = db.collection("rentals");



// Creating the indexes on boot also creates the `rentals` collection, so it
// is visible in MongoDB Compass before the first payment. The unique index is
// what makes webhook retries safe: two deliveries can never create two rows.
try {
  await rentalsCollection.createIndex(
    { stripeSessionId: 1 },
    { unique: true, name: "unique_stripe_session" }
  );
  await rentalsCollection.createIndex(
    {
      equipmentId: 1,
      paymentStatus: 1,
      rentalStatus: 1,
      startDate: 1,
      endDate: 1,
    },
    { name: "equipment_date_availability" }
  );
  console.log("[startup] Rentals indexes ready");
} catch (error) {
  console.error("[startup] Could not create rentals indexes:", error.message);
}
