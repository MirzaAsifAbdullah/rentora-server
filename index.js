import express from "express";
import "dotenv/config";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// MongoDB connection
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();

console.log("MongoDB connected successfully");

const db = client.db("rentora");
const equipmentsCollection = db.collection("equipments");

/** Escape user input before turning it into a MongoDB regular expression. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `a,b` and repeated `?key=a&key=b` both become `["a", "b"]`. */
function toList(value) {
  const raw = Array.isArray(value) ? value : [value];

  return raw
    .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeEquipment(equipment) {
  return {
    ...equipment,
    isAvailable: equipment.isAvailable !== false,
  };
}

const EQUIPMENT_SORTS = {
  newest: { createdAt: -1, _id: -1 },
  "price-asc": { price: 1, _id: 1 },
  "price-desc": { price: -1, _id: -1 },
};

// GET all equipment or equipment by owner email
app.get("/all-equipments", async (req, res) => {
  try {
    const email = req.query.email;

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
});

// GET SINGLE EQUIPMENT
app.get("/all-equipments/:id", async (req, res) => {
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
});

// ADD NEW EQUIPMENT
app.post("/all-equipments", async (req, res) => {
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
});

// UPDATE EQUIPMENT
app.patch("/all-equipments/:id", async (req, res) => {
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
});

// DELETE EQUIPMENT
app.delete("/all-equipments/:id", async (req, res) => {
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
});

// UPLOAD EQUIPMENT IMAGE TO IMGBB
app.post("/upload-image", async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).send({ message: "Image is required" });
    }

    const base64Image = image.includes(",") ? image.split(",")[1] : image;

    const formData = new FormData();
    formData.append("image", base64Image);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();

    if (!data.success) {
      return res.status(500).send({ message: "Image upload failed" });
    }

    res.send({ url: data.data.url });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

// DEFAULT ROUTE
app.get("/", (req, res) => {
  res.send("Rentora server is running!");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
