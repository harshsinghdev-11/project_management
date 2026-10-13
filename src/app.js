import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import swaggerUi from "swagger-ui-express";
import fs from "fs";

const swaggerDocument = JSON.parse(
  fs.readFileSync(new URL("./openapi.json", import.meta.url), "utf-8")
);

const app = express();

app.set("trust proxy", 1);


app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",") || "http://locahost:3001",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

import healthCheckRouter from "./routes/healthcheck.routes.js";
import authRouter from "./routes/auth.routes.js";
import projectRouter from "./routes/project.routes.js";
import taskRouter from "./routes/task.routes.js";
import { errorHandler } from "./middlewares/error.middlewares.js";
import { globalLimiter } from "./middlewares/rateLimiter.js";

app.use("/api/v1/healthcheck", healthCheckRouter);

app.use("/api", globalLimiter);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/tasks", taskRouter);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get("/", (req, res) => {
  res.send("visit /docs");
});

app.use(errorHandler);

export default app;
