// index.js - HomeHero Backend Server (Vercel Compatible)
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// CORS Configuration
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://homehero-bd.web.app",
      "https://homehero-bd.firebaseapp.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvkve05.mongodb.net/homeHeroDB?retryWrites=true&w=majority&appName=Cluster0`;

// Create MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Database collections
let servicesCollection;
let bookingsCollection;

// Connect to MongoDB
async function connectDB() {
  try {
    if (!servicesCollection) {
      await client.connect();
      const db = client.db("homeHeroDB");
      servicesCollection = db.collection("services");
      bookingsCollection = db.collection("bookings");
      console.log("Connected to MongoDB!");
    }
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

// JWT Middleware
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized access" });
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

// ============ ROUTES ============

// Health check - Root route
app.get("/", (req, res) => {
  res.send("HomeHero Server is running!");
});

// JWT Token Generation
app.post("/jwt", (req, res) => {
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "7d",
  });
  res.send({ token });
});

// ============ SERVICES ROUTES ============

// Get all services with optional filters
app.get("/services", async (req, res) => {
  try {
    await connectDB();
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
    console.error("Error:", error);
    res.status(500).send({ error: true, message: "Failed to fetch services" });
  }
});

// Get single service by ID
app.get("/services/:id", async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const service = await servicesCollection.findOne(query);

    if (!service) {
      return res
        .status(404)
        .send({ error: true, message: "Service not found" });
    }

    res.send(service);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ error: true, message: "Failed to fetch service" });
  }
});

// Get services by provider email (Protected)
app.get("/my-services", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const email = req.query.email;

    // Verify that the user is requesting their own services
    if (req.decoded.email !== email) {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden access" });
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
    await connectDB();
    const service = req.body;

    // Add timestamp and initial rating
    service.createdAt = new Date();
    service.averageRating = 4.5;
    service.reviews = [];

    const result = await servicesCollection.insertOne(service);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to add service" });
  }
});

// Update service (Protected)
app.patch("/services/:id", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;
    const updateData = req.body;
    const email = req.query.email;

    // Verify ownership
    const service = await servicesCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!service || service.providerEmail !== email) {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden access" });
    }

    delete updateData._id;
    updateData.updatedAt = new Date();

    const result = await servicesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to update service" });
  }
});

// Delete service (Protected)
app.delete("/services/:id", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;
    const email = req.query.email;

    // Verify ownership
    const service = await servicesCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!service || service.providerEmail !== email) {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden access" });
    }

    // Delete related bookings
    await bookingsCollection.deleteMany({ serviceId: id });

    const result = await servicesCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to delete service" });
  }
});

// ============ BOOKINGS ROUTES ============

// Get all bookings for a user (Protected)
app.get("/bookings", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const email = req.query.email;

    // Verify that the user is requesting their own bookings
    if (req.decoded.email !== email) {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden access" });
    }

    const query = { userEmail: email };
    const bookings = await bookingsCollection.find(query).toArray();

    // Populate service details for each booking
    for (let booking of bookings) {
      const service = await servicesCollection.findOne({
        _id: new ObjectId(booking.serviceId),
      });
      booking.service = service;
    }

    res.send(bookings);
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to fetch bookings" });
  }
});

// Create new booking (Protected)
app.post("/bookings", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const booking = req.body;

    // Check if user is trying to book their own service
    const service = await servicesCollection.findOne({
      _id: new ObjectId(booking.serviceId),
    });

    if (service.providerEmail === booking.userEmail) {
      return res.status(400).send({
        error: true,
        message: "You cannot book your own service",
      });
    }

    // Check for duplicate booking
    const existingBooking = await bookingsCollection.findOne({
      userEmail: booking.userEmail,
      serviceId: booking.serviceId,
      status: { $ne: "cancelled" },
    });

    if (existingBooking) {
      return res.status(400).send({
        error: true,
        message: "You have already booked this service",
      });
    }

    booking.createdAt = new Date();
    booking.status = "pending";

    const result = await bookingsCollection.insertOne(booking);
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to create booking" });
  }
});

// Cancel booking (Protected)
app.delete("/bookings/:id", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const id = req.params.id;
    const email = req.query.email;

    // Verify ownership
    const booking = await bookingsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!booking || booking.userEmail !== email) {
      return res
        .status(403)
        .send({ error: true, message: "Forbidden access" });
    }

    const result = await bookingsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to cancel booking" });
  }
});

// ============ REVIEWS ROUTES ============

// Add review to service (Protected)
app.post("/services/:id/review", verifyJWT, async (req, res) => {
  try {
    await connectDB();
    const serviceId = req.params.id;
    const { rating, comment } = req.body;
    const userEmail = req.decoded.email;

    // Check if user has booked this service
    const booking = await bookingsCollection.findOne({
      userEmail: userEmail,
      serviceId: serviceId,
      status: { $in: ["completed", "pending"] },
    });

    if (!booking) {
      return res.status(403).send({
        error: true,
        message: "You must book this service before reviewing",
      });
    }

    // Check if user has already reviewed
    const service = await servicesCollection.findOne({
      _id: new ObjectId(serviceId),
    });
    const hasReviewed = service.reviews?.some(
      (review) => review.userEmail === userEmail
    );

    if (hasReviewed) {
      return res.status(400).send({
        error: true,
        message: "You have already reviewed this service",
      });
    }

    const review = {
      userEmail,
      userName: req.body.userName || "Anonymous",
      rating: parseFloat(rating),
      comment,
      date: new Date(),
    };

    // Update service with new review
    const updatedService = await servicesCollection.findOneAndUpdate(
      { _id: new ObjectId(serviceId) },
      { $push: { reviews: review } },
      { returnDocument: "after" }
    );

    // Calculate new average rating
    if (updatedService.reviews && updatedService.reviews.length > 0) {
      const totalRating = updatedService.reviews.reduce(
        (sum, r) => sum + r.rating,
        0
      );
      const averageRating = totalRating / updatedService.reviews.length;

      await servicesCollection.updateOne(
        { _id: new ObjectId(serviceId) },
        { $set: { averageRating } }
      );
    }

    res.send({ success: true, message: "Review added successfully" });
  } catch (error) {
    res.status(500).send({ error: true, message: "Failed to add review" });
  }
});

// Get top-rated services
app.get("/top-rated-services", async (req, res) => {
  try {
    await connectDB();
    const services = await servicesCollection
      .find({ averageRating: { $gte: 4 } })
      .sort({ averageRating: -1 })
      .limit(6)
      .toArray();

    res.send(services);
  } catch (error) {
    res
      .status(500)
      .send({ error: true, message: "Failed to fetch top-rated services" });
  }
});

// Get categories
app.get("/categories", async (req, res) => {
  try {
    await connectDB();
    const categories = await servicesCollection.distinct("category");
    res.send(categories);
  } catch (error) {
    res
      .status(500)
      .send({ error: true, message: "Failed to fetch categories" });
  }
});

// Start server (Local development only)
app.listen(port, () => {
  console.log(`HomeHero Server is running on port ${port}`);
});

// Export for Vercel
module.exports = app;