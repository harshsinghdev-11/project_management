# Request Validation & Schema Sanitization

Input validation is separated cleanly into declarative validation rules and a reusable middleware, preventing malformed data from ever reaching controllers or the database.

---

## 1. Declarative Validator Rules

All validation rules are centralized in [`src/validators/index.js`](../src/validators/index.js) using **`express-validator`**:

```javascript
// Example: Registration Payload Validator
export const userRegisterValidator = () => {
  return [
    body("email")
      .trim()
      .notEmpty().withMessage("Email is required")
      .isEmail().withMessage("Email is invalid"),
    body("username")
      .trim()
      .notEmpty().withMessage("Username is required")
      .isLowercase().withMessage("Username must be lowercase")
      .isLength({ min: 3 }).withMessage("Username must be at least 3 characters long"),
    body("password")
      .trim()
      .notEmpty().withMessage("Password is required"),
  ];
};
```

---

## 2. Centralized `validate` Middleware

Rather than repeating `validationResult(req)` checks inside every controller, the reusable `validate` middleware handles the check:

```javascript
// src/middlewares/validator.middleware.js
import { validationResult } from "express-validator";
import { ApiError } from "../utils/api-error.js";

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const extractedErrors = [];
  errors.array().map((err) => extractedErrors.push({ [err.path]: err.msg }));

  throw new ApiError(422, "Received data is not valid", extractedErrors);
};
```

---

## 3. Benefits of this Architecture
1. **Fails Fast:** Malformed payloads reject immediately with `422 Unprocessable Entity` before running any database lookups or business logic.
2. **Clean Controllers:** Controllers only receive clean, pre-sanitized data and remain focused solely on business logic.
3. **Structured Client Feedback:** Validation error objects clearly map every invalid field directly to its specific failure message:
   ```json
   {
     "statusCode": 422,
     "message": "Received data is not valid",
     "errors": [
       { "email": "Email is invalid" },
       { "username": "Username must be at least 3 characters long" }
     ],
     "success": false
   }
   ```
