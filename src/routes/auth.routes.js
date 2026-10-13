import { Router } from "express";
import {
  changeCurrentPassword,
  forgotPasswordRequest,
  getCurrentUser,
  login,
  logoutUser,
  refreshAccessToken,
  registerUser,
  resetForgotPassword,
} from "../controllers/auth.controllers.js";
import { validate } from "../middlewares/validator.middleware.js";
import {
  userChangeCurrentPasswordValidator,
  userForgotPasswordValidator,
  userLoginValidator,
  userRegisterValidator,
  userResetForgotPasswordValidator,
} from "../validators/index.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { constantTimeResponse } from "../middlewares/timing.middleware.js";
import {
  authLimiter,
  passwordResetLimiter,
  sessionLimiter,
} from "../middlewares/rateLimiter.js";

const router = Router();

// Apply uniform response timing mitigation across all auth endpoints
router.use(constantTimeResponse());

// unsecured route
router
  .route("/register")
  .post(authLimiter, userRegisterValidator(), validate, registerUser);

router.route("/login").post(authLimiter, userLoginValidator(), validate, login);

router.route("/refresh-token").post(sessionLimiter, refreshAccessToken);

router
  .route("/forgot-password")
  .post(
    passwordResetLimiter,
    userForgotPasswordValidator(),
    validate,
    forgotPasswordRequest,
  );

router
  .route("/reset-password/:resetToken")
  .post(
    passwordResetLimiter,
    userResetForgotPasswordValidator(),
    validate,
    resetForgotPassword,
  );

//secure routes
router.route("/logout").post(verifyJWT, sessionLimiter, logoutUser);

router.route("/current-user").post(verifyJWT, sessionLimiter, getCurrentUser);

router
  .route("/change-password")
  .post(
    verifyJWT,
    authLimiter,
    userChangeCurrentPasswordValidator(),
    validate,
    changeCurrentPassword,
  );

export default router;
