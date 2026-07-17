require("dotenv").config();

const mongoose = require("mongoose");
 
async function conectDb() {
    try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
            throw new Error("Missing MONGODB_URI in backend/.env");
        }

        await mongoose.connect(uri);
        console.log("✅ Database Connected Successfully.");
    } catch (error) {
        console.log(`❌ MongoDb connection error: ${error.message}`);
        throw error; // Pass the error up to index.js to prevent server start
    }
}

module.exports = conectDb;