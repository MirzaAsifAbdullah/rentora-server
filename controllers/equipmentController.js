import { ObjectId } from "mongodb";
import { equipmentsCollection } from "../config/db.js";
import { getAvailability } from "../services/availabilityService.js";
import { parseDateOnly, parseObjectId } from "../utils/helpers.js";

// GET all equipment or equipment by owner email
export async function getAllEquipments(req, res) {
  try {
    // The owner dashboard sends `ownerEmail`; older callers used `email`.
    const email = req.query.email || req.query.ownerEmail;

    let query = {};

    if (email) {
      // Get equipment of a specific owner
      query.ownerEmail = email;
    } else {
      // Get all approved equipment for public marketplace
      query.status = "approved";
    }

    const result = await equipmentsCollection.find(query).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get equipment",
    });
  }
}

// GET SINGLE EQUIPMENT
export async function getEquipmentById(req, res) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid equipment ID" });
    }

    const equipment = await equipmentsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!equipment) {
      return res.status(404).send({ message: "Equipment not found" });
    }

    res.send({
      ...equipment,
      isAvailable: equipment.isAvailable !== false,
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}

// GET AVAILABILITY FOR A DATE RANGE
// Example: /all-equipments/ID/availability?startDate=2026-12-01&endDate=2026-12-05
export async function getEquipmentAvailability(req, res) {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;
    const objectId = parseObjectId(id);
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);

    if (!objectId) {
      return res.status(400).send({ message: "Invalid equipment ID" });
    }

    if (!start || !end || end.getTime() <= start.getTime()) {
      return res.status(400).send({
        message:
          "Please provide valid startDate and endDate (YYYY-MM-DD, end after start).",
      });
    }

    const equipment = await equipmentsCollection.findOne({ _id: objectId });

    if (!equipment) {
      return res.status(404).send({ message: "Equipment not found" });
    }

    const availability = await getAvailability({
      equipment,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });

    res.send({
      ...availability,
      // An owner can hide a listing without changing its stock.
      availableQuantity:
        equipment.isAvailable === false ? 0 : availability.availableQuantity,
      isAvailable: equipment.isAvailable !== false,
    });
  } catch (error) {
    console.error("[availability] Failed to calculate availability:", error);
    res.status(500).send({ message: "Failed to calculate availability" });
  }
}

// ADD NEW EQUIPMENT
export async function addEquipment(req, res) {
  try {
    const {
      name,
      description,
      category,
      location,
      price,
      rentalType,
      availableQuantity,
      condition,
      brand,
      model,
      image,
      terms,
      ownerEmail,
      ownerName,
    } = req.body;

    if (
      !name ||
      !description ||
      !category ||
      !location ||
      !price ||
      !rentalType ||
      availableQuantity === undefined ||
      !condition ||
      !brand ||
      !model ||
      !image ||
      !terms ||
      !ownerEmail
    ) {
      return res.status(400).send({
        message: "Please provide all required fields",
      });
    }

    const equipment = {
      name,
      description,
      category,
      location,
      price: Number(price),
      rentalType,
      availableQuantity: Number(availableQuantity),
      condition,
      brand,
      model,
      image,
      terms,
      ownerEmail,
      ownerName: ownerName || "",
      status: "pending",
      isAvailable: true,
      createdAt: new Date(),
    };

    const result = await equipmentsCollection.insertOne(equipment);

    res.status(201).send({
      ...equipment,
      _id: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}

// UPDATE EQUIPMENT
export async function updateEquipment(req, res) {
  try {
    const { id } = req.params;
    const { ownerEmail } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid equipment ID" });
    }

    if (!ownerEmail) {
      return res.status(400).send({ message: "Owner email is required" });
    }

    // Only these fields can be updated
    const allowedFields = [
      "name",
      "description",
      "category",
      "location",
      "price",
      "rentalType",
      "availableQuantity",
      "condition",
      "brand",
      "model",
      "image",
      "terms",
      "isAvailable",
    ];

    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).send({ message: "No fields to update" });
    }

    if (update.price !== undefined) {
      update.price = Number(update.price);

      if (!Number.isFinite(update.price) || update.price <= 0) {
        return res.status(400).send({ message: "Invalid price" });
      }
    }

    if (update.availableQuantity !== undefined) {
      update.availableQuantity = Number(update.availableQuantity);

      if (
        !Number.isInteger(update.availableQuantity) ||
        update.availableQuantity < 0
      ) {
        return res.status(400).send({ message: "Invalid quantity" });
      }
    }

    update.updatedAt = new Date();

    const result = await equipmentsCollection.updateOne(
      { _id: new ObjectId(id), ownerEmail },
      { $set: update },
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Equipment not found for this owner",
      });
    }

    const updatedEquipment = await equipmentsCollection.findOne({
      _id: new ObjectId(id),
    });

    res.send(updatedEquipment);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}

// DELETE EQUIPMENT
export async function deleteEquipment(req, res) {
  try {
    const { id } = req.params;
    const ownerEmail = req.query.ownerEmail || req.body?.ownerEmail;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid equipment ID" });
    }

    if (!ownerEmail) {
      return res.status(400).send({ message: "Owner email is required" });
    }

    const result = await equipmentsCollection.deleteOne({
      _id: new ObjectId(id),
      ownerEmail,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Equipment not found for this owner",
      });
    }

    res.send({ message: "Equipment deleted successfully" });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}
