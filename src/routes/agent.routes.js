import { Router } from "express";
import { runAgent } from "../controllers/agent.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { agentRunValidator } from "../validators/index.js";
import { agentLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

// Protect all agent routes with JWT authentication
router.use(verifyJWT);

// Primary endpoint: POST /api/v1/agent/run
router.route("/run").post(agentLimiter, agentRunValidator(), validate, runAgent);

// Convenience alias: POST /api/v1/agent
router.route("/").post(agentLimiter, agentRunValidator(), validate, runAgent);

export default router;

