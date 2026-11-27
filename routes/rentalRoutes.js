import { Router } from "express";
import {
  createCheckoutSession,
  verifyCheckoutSession,
} from "../controllers/rentalController.js";

const router = Router();

// CREATE STRIPE CHECKOUT SESSION
router.post("/create-checkout-session", createCheckoutSession);

// VERIFY A CHECKOUT SESSION (used by the /rental/success page)
router.get("/checkout-session/:sessionId", verifyCheckoutSession);

export default router;
