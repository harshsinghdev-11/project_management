import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import connectDB from "./db/index.js";
import { initializeSocket, closePubSub } from "./socket/index.js";

dotenv.config({
  path: "./.env",
});

const port = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.CORS_ORIGIN?.split(","),
    credentials: true,
  },
});

app.set("io", io);

initializeSocket(io);

let dbErrorReported = false;
const initializeDB = () => {
  connectDB().catch((error) => {
    if (!dbErrorReported) {           
      Sentry.captureException(error);
      dbErrorReported = true;
    }
    console.error("Database unavailable; server remains running.", error.message);
    setTimeout(initializeDB, 5000);
  });
};

initializeDB();

httpServer.listen(port, () => {
  console.log(`app listening on port http://localhost:${port}`);
});

const handleShutdown = async () => {
  console.log("Shutting down gracefully...");
  closePubSub();
  httpServer.close(async () => {
    await Sentry.close(2000);
    process.exit(0);
  });
};

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

