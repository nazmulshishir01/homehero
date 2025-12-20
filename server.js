// server.js - Main backend server file
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI
const uri =
  process.env.MONGO_URI ||
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvkve05.mongodb.net/homeheroDB?retryWrites=true&w=majority&appName=Cluster0`;

// Create MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// JWT Middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: "Unauthorized access" });
  }

  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ error: true, message: "Forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const database = client.db("homeHeroDB");
    const servicesCollection = database.collection("services");
    const bookingsCollection = database.collection("bookings");

    // JWT Token Generation
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    // Health check
    app.get("/", (req, res) => {
      res.send("HomeHero Server is running!");
    });

    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`HomeHero Server is running on port ${port}`);
});

// ============ SERVICES ROUTES ============

    // Get all services with optional filters
    app.get("/services", async (req, res) => {
      try {
        const { limit, category, minPrice, maxPrice, search, sortBy } = req.query;
        let query = {};

        // Category filter
        if (category && category !== "all") {
          query.category = category;
        }

        // Price range filter
        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = parseFloat(minPrice);
          if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        // Search filter (case-insensitive)
        if (search) {
          query.$or = [
            { serviceName: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }

        // Build query
        let cursor = servicesCollection.find(query);

        // Sorting
        if (sortBy === "price-asc") {
          cursor = cursor.sort({ price: 1 });
        } else if (sortBy === "price-desc") {
          cursor = cursor.sort({ price: -1 });
        } else if (sortBy === "rating") {
          cursor = cursor.sort({ averageRating: -1 });
        }

        // Limit results
        if (limit) {
          cursor = cursor.limit(parseInt(limit));
        }

        const services = await cursor.toArray();
        res.send(services);
      } catch (error) {
        res.status(500).send({ error: true, message: "Failed to fetch services" });
      }
    });

    // Get single service by ID
    app.get("/services/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const service = await servicesCollection.findOne(query);

        if (!service) {
          return res.status(404).send({ error: true, message: "Service not found" });
        }

        res.send(service);
      } catch (error) {
        console.error("Error:", error);
        res.status(500).send({ error: true, message: "Failed to fetch service" });
      }
    });

    // Get categories
    app.get("/categories", async (req, res) => {
      try {
        const categories = await servicesCollection.distinct("category");
        res.send(categories);
      } catch (error) {
        res.status(500).send({ error: true, message: "Failed to fetch categories" });
      }
    });

    // Get services by provider email (Protected)
    app.get("/my-services", verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;

        // Verify that the user is requesting their own services
        if (req.decoded.email !== email) {
          return res.status(403).send({ error: true, message: "Forbidden access" });
        }

        const query = { providerEmail: email };
        const services = await servicesCollection.find(query).toArray();
        res.send(services);
      } catch (error) {
        res.status(500).send({ error: true, message: "Failed to fetch services" });
      }
    });

    // Add new service (Protected)
    app.post("/services", verifyJWT, async (req, res) => {
      try {
        const service = req.body;

        // Add timestamp and initial rating
        service.createdAt = new Date();
        service.averageRating = 4.5; // Default rating for new services
        service.reviews = [];

        const result = await servicesCollection.insertOne(service);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: "Failed to add service" });
      }
    });