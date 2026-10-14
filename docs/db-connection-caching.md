# Database Connection Singleton with Promise Caching

In cloud and containerized environments like Render, server cold starts and concurrent incoming traffic can trigger multiple simultaneous database connection attempts.

This project implements a **Promise-Cached Singleton Pattern** in [`src/db/index.js`](../src/db/index.js) to guarantee only one database connection is ever created.

---

## 1. The Race Condition Problem

In traditional Node setups:
```javascript
// NAIVE APPROACH (Risk of race conditions):
const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
};
```
If 10 requests arrive during a server cold start before the first connection finishes handshaking:
1. Each request checks `mongoose.connection.readyState` (which is `0` / disconnected).
2. All 10 requests initiate `mongoose.connect()`.
3. 10 duplicate sockets are opened to MongoDB Atlas, quickly burning through the **100 connection limit** on free-tier clusters.

---

## 2. The Solution: Cached `connectionPromise`

```javascript
// src/db/index.js
import mongoose from "mongoose";

let connectionPromise = null;

const connectDB = () => {
  // 1. If already connected, resolve immediately
  if (mongoose.connection.readyState === 1) {
    return Promise.resolve(mongoose.connection);
  }

  // 2. If a connection is already in progress, return the existing pending promise
  if (connectionPromise) {
    return connectionPromise;
  }

  // 3. First caller: initiate connection and cache the promise
  connectionPromise = mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    .then((mongooseInstance) => {
      console.log("MongoDB connected");
      return mongooseInstance.connection;
    })
    .catch((error) => {
      // 4. Reset promise on failure so future calls can retry
      connectionPromise = null;
      console.error("MongoDB connection failed:", error.message);
      throw error;
    });

  return connectionPromise;
};

export default connectDB;
```

---

## 3. Key Advantages

1. **Zero Duplicate Sockets:** Concurrent requests simply await the **same pending promise**, sharing the single connection lifecycle.
2. **Instant Resolution on Warm Requests:** When `readyState === 1`, it returns `Promise.resolve()` immediately without touching the network.
3. **Automatic Error Recovery:** If connection fails, `connectionPromise` is reset to `null`, ensuring the next request can attempt a fresh connection cleanly rather than permanently failing on a cached rejection.
