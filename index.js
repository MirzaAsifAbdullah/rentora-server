import express from "express";
import "dotenv/config";
import cors from "cors";

// Config is imported first: Stripe checks run before the MongoDB connection.
import "./config/stripe.js";
import "./config/db.js";

import webhookRouter from "./routes/stripeRoutes.js";
import rentalRoutes from "./routes/rentalRoutes.js";
import equipmentRoutes from "./routes/equipmentRoutes.js";
import imageRoutes from "./routes/imageRoutes.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// ---------------------------------------------------------------------------
// STRIPE WEBHOOK
// ---------------------------------------------------------------------------
// IMPORTANT: this route MUST be registered before express.json(). Stripe signs
// the exact raw bytes of the request body, and express.json() would replace
// the Buffer with a parsed object, making every signature check fail.
app.use(webhookRouter);

// The JSON parser must stay AFTER the webhook route above.
app.use(express.json({ limit: "10mb" }));

// All other routes
app.use(rentalRoutes);
app.use(equipmentRoutes);
app.use(imageRoutes);

// DEFAULT ROUTE
app.get("/", (req, res) => {
  res.send("Rentora server is running!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
