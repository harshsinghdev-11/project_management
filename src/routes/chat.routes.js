import { Router } from "express";
import {
  getProjectDefaultChat,
  getConversationMessages,
  sendMessage,
} from "../controllers/chat.controllers.js";
import {
  verifyJWT,
  validateProjectPermission,
  validateConversationMember,
} from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validator.middleware.js";
import { sendMessageValidator } from "../validators/index.js";
import { upload } from "../middlewares/multer.middleware.js";
import { readLimiter, writeLimiter } from "../middlewares/rateLimiter.js";
import { AvailableUserRole } from "../utils/constants.js";

const router = Router();

router.use(verifyJWT);

// Get default chat group for a project (accessible by any project member)
router
  .route("/project/:projectId")
  .get(
    readLimiter,
    validateProjectPermission(AvailableUserRole),
    getProjectDefaultChat,
  );

// Get messages and send a message within a conversation (restricted strictly to group members)
router
  .route("/:conversationId/messages")
  .get(readLimiter, validateConversationMember, getConversationMessages)
  .post(
    writeLimiter,
    validateConversationMember,
    upload.array("attachments"),
    sendMessageValidator(),
    validate,
    sendMessage,
  );

export default router;
