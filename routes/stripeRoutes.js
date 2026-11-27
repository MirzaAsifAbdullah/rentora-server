import express, { Router } from "express";
import { stripeWebhook } from "../controllers/stripeController.js";

// IMPORTANT: this router is mounted BEFORE express.json() in index.js.
// Stripe signs the exact raw bytes of the request body, so the route must
// receive the raw Buffer with express.raw() instead of a parsed object.
const webhookRouter = Router();

// STRIPE WEBHOOK
webhookRouter.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

export default webhookRouter;
