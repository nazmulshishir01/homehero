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

// MongoDB URI - Using your cluster URL
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

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("Connected to MongoDB!");

    // Database and Collections
    const database = client.db("homeHeroDB");
    const servicesCollection = database.collection("services");
    const bookingsCollection = database.collection("bookings");
    const reviewsCollection = database.collection("reviews");

    // JWT Token Generation
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      res.send({ token });
    });

    
    app.get("/services", async (req, res) => {
      try {
        const { limit, category, minPrice, maxPrice, search, sortBy } =
          req.query;
        let query = {};

       
        if (category && category !== "all") {
          query.category = category;
        }

        
        if (minPrice || maxPrice) {
          query.price = {};
          if (minPrice) query.price.$gte = parseFloat(minPrice);
          if (maxPrice) query.price.$lte = parseFloat(maxPrice);
        }

        
        if (search) {
          query.$or = [
            { serviceName: { $regex: search, $options: "i" } },
            { category: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
          ];
        }

        
        let cursor = servicesCollection.find(query);

        
        if (sortBy === "price-asc") {
          cursor = cursor.sort({ price: 1 });
        } else if (sortBy === "price-desc") {
          cursor = cursor.sort({ price: -1 });
        } else if (sortBy === "rating") {
          cursor = cursor.sort({ averageRating: -1 });
        }

        
        if (limit) {
          cursor = cursor.limit(parseInt(limit));
        }

        const services = await cursor.toArray();
        res.send(services);
      } catch (error) {
        res
          .status(500)
          .send({ error: true, message: "Failed to fetch services" });
      }
    });

    
    app.get("/services/:id", async (req, res) => {
      try {
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
        res
          .status(500)
          .send({ error: true, message: "Failed to fetch service" });
      }
    });

    
    app.get("/my-services", verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;

        
        if (req.decoded.email !== email) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden access" });
        }

        const query = { providerEmail: email };
        const services = await servicesCollection.find(query).toArray();
        res.send(services);
      } catch (error) {
        res
          .status(500)
          .send({ error: true, message: "Failed to fetch services" });
      }
    });

   
    app.post("/services", verifyJWT, async (req, res) => {
      try {
        const service = req.body;

        
        service.createdAt = new Date();
        service.averageRating = 4.5; 
        service.reviews = [];

        const result = await servicesCollection.insertOne(service);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: true, message: "Failed to add service" });
      }
    });

    
    app.patch("/services/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        const email = req.query.email;

        
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
        res
          .status(500)
          .send({ error: true, message: "Failed to update service" });
      }
    });

    
    app.delete("/services/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.query.email;

        
        const service = await servicesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!service || service.providerEmail !== email) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden access" });
        }

        
        await bookingsCollection.deleteMany({ serviceId: id });

        const result = await servicesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .send({ error: true, message: "Failed to delete service" });
      }
    });

    
    app.get("/bookings", verifyJWT, async (req, res) => {
      try {
        const email = req.query.email;

        
        if (req.decoded.email !== email) {
          return res
            .status(403)
            .send({ error: true, message: "Forbidden access" });
        }

        const query = { userEmail: email };
        const bookings = await bookingsCollection.find(query).toArray();

        
        for (let booking of bookings) {
          const service = await servicesCollection.findOne({
            _id: new ObjectId(booking.serviceId),
          });
          booking.service = service;
        }

        res.send(bookings);
      } catch (error) {
        res
          .status(500)
          .send({ error: true, message: "Failed to fetch bookings" });
      }
    });

    
    app.post("/bookings", verifyJWT, async (req, res) => {
      try {
        const booking = req.body;

        
        const service = await servicesCollection.findOne({
          _id: new ObjectId(booking.serviceId),
        });

        if (service.providerEmail === booking.userEmail) {
          return res.status(400).send({
            error: true,
            message: "You cannot book your own service",
          });
        }

        
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
        res
          .status(500)
          .send({ error: true, message: "Failed to create booking" });
      }
    });

    
    app.delete("/bookings/:id", verifyJWT, async (req, res) => {
      try {
        const id = req.params.id;
        const email = req.query.email;

       
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
        res
          .status(500)
          .send({ error: true, message: "Failed to cancel booking" });
      }
    });

    
    app.post("/services/:id/review", verifyJWT, async (req, res) => {
      try {
        const serviceId = req.params.id;
        const { rating, comment } = req.body;
        const userEmail = req.decoded.email;

        
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

        
        const updatedService = await servicesCollection.findOneAndUpdate(
          { _id: new ObjectId(serviceId) },
          {
            $push: { reviews: review },
          },
          { returnDocument: "after" }
        );

        
        if (
          updatedService.value.reviews &&
          updatedService.value.reviews.length > 0
        ) {
          const totalRating = updatedService.value.reviews.reduce(
            (sum, r) => sum + r.rating,
            0
          );
          const averageRating =
            totalRating / updatedService.value.reviews.length;

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

    
    app.get("/top-rated-services", async (req, res) => {
      try {
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

    
    app.get("/categories", async (req, res) => {
      try {
        const categories = await servicesCollection.distinct("category");
        res.send(categories);
      } catch (error) {
        res
          .status(500)
          .send({ error: true, message: "Failed to fetch categories" });
      }
    });

    
    app.get("/", (req, res) => {
      res.send("HomeHero Server is running!");
    });

    
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`HomeHero Server is running on port ${port}`);
});