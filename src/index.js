import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import connectDB from "./db/index.js";
import { initializeSocket } from "./socket/index.js";

dotenv.config({
  path: "./.env",
});

const port = process.env.PORT || 3000;

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  pingTimeout: 60000,
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") || "http://localhost:3001",
    credentials: true,
  },
});

app.set("io", io);

initializeSocket(io);

const initializeDB = () => {
  connectDB().catch((error) => {
    console.error("Database unavailable; server remains running.");
    setTimeout(initializeDB, 5000);
  });
};

initializeDB();

httpServer.listen(port, () => {
  console.log(`app listening on port http://localhost:${port}`);
});

