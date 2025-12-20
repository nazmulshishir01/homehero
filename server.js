
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());


const uri =
  process.env.MONGO_URI ||
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gvkve05.mongodb.net/homeheroDB?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
   
    await client.connect();
    console.log("Connected to MongoDB!");

   
    const database = client.db("homeHeroDB");
    const servicesCollection = database.collection("services");
    const bookingsCollection = database.collection("bookings");

    
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
```

**File: `.env.example`** (নতুন file তৈরি করো)
```
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password
ACCESS_TOKEN_SECRET=your_jwt_secret
PORT=5000