import { Router } from "express";
import {
  addMembersToProject,
  createProject,
  deleteMember,
  getProjects,
  getProjectById,
  getProjectMembers,
  updateProject,
  deleteProject,
  updateMemberRole,
} from "../controllers/project.controllers.js";

import { validate } from "../middlewares/validator.middleware.js";

import {
  createProjectValidator,
  addMembertoProjectValidator,
} from "../validators/index.js";

import {
  verifyJWT,
  validateProjectPermission,
} from "../middlewares/auth.middleware.js";

import { AvailableUserRole, UserRolesEnum } from "../utils/constants.js";
import { readLimiter, writeLimiter } from "../middlewares/rateLimiter.js";

const router = Router();
router.use(verifyJWT);

router
  .route("/")
  .get(readLimiter, getProjects)
  .post(writeLimiter, createProjectValidator(), validate, createProject);

router
  .route("/:projectId")
  .get(readLimiter, validateProjectPermission(AvailableUserRole), getProjectById)
  .put(
    writeLimiter,
    validateProjectPermission([UserRolesEnum.ADMIN]),
    createProjectValidator(),
    validate,
    updateProject,
  )
  .delete(
    writeLimiter,
    validateProjectPermission([UserRolesEnum.ADMIN]),
    deleteProject,
  );

router
  .route("/:projectId/members")
  .get(readLimiter, getProjectMembers)
  .post(
    writeLimiter,
    validateProjectPermission([UserRolesEnum.ADMIN]),
    addMembertoProjectValidator(),
    validate,
    addMembersToProject,
  );

router
  .route("/:projectId/members/:userId")
  .put(
    writeLimiter,
    validateProjectPermission([UserRolesEnum.ADMIN]),
    updateMemberRole,
  )
  .delete(
    writeLimiter,
    validateProjectPermission([UserRolesEnum.ADMIN]),
    deleteMember,
  );

export default router;
