import { Router } from "express";
import {
  addEquipment,
  deleteEquipment,
  getAllEquipments,
  getEquipmentAvailability,
  getEquipmentById,
  updateEquipment,
} from "../controllers/equipmentController.js";

const router = Router();

// GET all equipment or equipment by owner email
router.get("/all-equipments", getAllEquipments);

// GET SINGLE EQUIPMENT
router.get("/all-equipments/:id", getEquipmentById);

// GET AVAILABILITY FOR A DATE RANGE
router.get("/all-equipments/:id/availability", getEquipmentAvailability);

// ADD NEW EQUIPMENT
router.post("/all-equipments", addEquipment);

// UPDATE EQUIPMENT
router.patch("/all-equipments/:id", updateEquipment);

// DELETE EQUIPMENT
router.delete("/all-equipments/:id", deleteEquipment);

export default router;
