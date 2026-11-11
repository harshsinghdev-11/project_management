import { Router } from "express";
import {
  clearAgentMessages,
  getAgentMessages,
  runAgent,
} from "../controllers/agent.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { agentRunValidator } from "../validators/index.js";
import { agentLimiter, readLimiter, writeLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.use(verifyJWT);

router
  .route("/messages")
  .get(readLimiter, getAgentMessages)
  .delete(writeLimiter, clearAgentMessages);

router.route("/run").post(agentLimiter, agentRunValidator(), validate, runAgent);

router.route("/").post(agentLimiter, agentRunValidator(), validate, runAgent);

export default router;
