const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    await mongoose.connect(
      "mongodb://admin:Admin%402025@89.116.236.84:27017/portfolio?authSource=admin&authMechanism=SCRAM-SHA-256",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true
      }
    );
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;