import { Router } from "express";
import {
  createSubTask,
  createTask,
  deleteSubTask,
  deleteTask,
  getTaskById,
  getTasks,
  updateSubTask,
  updateTask,
} from "../controllers/task.controllers.js";

import { validate } from "../middlewares/validator.middleware.js";
import {
  createTaskValidator,
  updateTaskValidator,
  createSubTaskValidator,
  updateSubTaskValidator,
} from "../validators/index.js";
import {
  verifyJWT,
  validateProjectPermission,
} from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";
import { readLimiter, writeLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.use(verifyJWT);

router
  .route("/:projectId")
  .get(readLimiter, validateProjectPermission(AvailableUserRole), getTasks)
  .post(
    writeLimiter,
    validateProjectPermission([
      UserRolesEnum.ADMIN,
      UserRolesEnum.PROJECT_ADMIN,
    ]),
    upload.array("attachments"),
    createTaskValidator(),
    validate,
    createTask,
  );

router
  .route("/:projectId/t/:taskId")
  .get(readLimiter, validateProjectPermission(AvailableUserRole), getTaskById)
  .put(
    writeLimiter,
    validateProjectPermission([
      UserRolesEnum.ADMIN,
      UserRolesEnum.PROJECT_ADMIN,
    ]),
    upload.array("attachments"),
    updateTaskValidator(),
    validate,
    updateTask,
  )
  .delete(
    writeLimiter,
    validateProjectPermission([
      UserRolesEnum.ADMIN,
      UserRolesEnum.PROJECT_ADMIN,
    ]),
    deleteTask,
  );

router
  .route("/:projectId/t/:taskId/subtasks")
  .post(
    writeLimiter,
    validateProjectPermission([
      UserRolesEnum.ADMIN,
      UserRolesEnum.PROJECT_ADMIN,
    ]),
    createSubTaskValidator(),
    validate,
    createSubTask,
  );

router
  .route("/:projectId/st/:subTaskId")
  .put(
    writeLimiter,
    validateProjectPermission(AvailableUserRole),
    updateSubTaskValidator(),
    validate,
    updateSubTask,
  )
  .delete(
    writeLimiter,
    validateProjectPermission([
      UserRolesEnum.ADMIN,
      UserRolesEnum.PROJECT_ADMIN,
    ]),
    deleteSubTask,
  );

export default router;
