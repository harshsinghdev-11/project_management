
import mongoose from "mongoose";

let connectionPromise = null;

const connectDB = () => {
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoURI = process.env.MONGO_URI;

  if (!mongoURI) {
    return Promise.reject(
      new Error("MONGO_URI is not defined")
    );
  }

  connectionPromise = mongoose
    .connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
    })
    .then((mongooseInstance) => {
      console.log("MongoDB connected");
      return mongooseInstance.connection;
    })
    .catch((error) => {
      connectionPromise = null;
      console.error("MongoDB connection failed:", error.message);
      throw error;
    });

  return connectionPromise;
};

export default connectDB;