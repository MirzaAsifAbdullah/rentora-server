import { Router } from "express";
import { uploadImage } from "../controllers/imageController.js";

const router = Router();

// UPLOAD EQUIPMENT IMAGE TO IMGBB
router.post("/upload-image", uploadImage);

export default router;
