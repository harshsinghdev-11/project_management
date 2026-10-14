# Authentication & Authorization Architecture

This project implements a **stateless JWT** authentication strategy paired with a granular **Role-Based Access Control (RBAC)** authorization engine.

---

## 1. Stateless Dual-Token JWT Architecture

The server stores no active user session state in memory, allowing effortless horizontal scaling across cloud instances.

### Token Rotation Mechanism
1. **Access Token (Short-Lived):**
   - Signed with `ACCESS_TOKEN_SECRET`.
   - Contains minimal claims (`_id`, `email`, `username`).
   - Carried in the `Authorization: Bearer <token>` header or `accessToken` cookie.
2. **Refresh Token (Long-Lived):**
   - Signed with `REFRESH_TOKEN_SECRET`.
   - Stored in an `httpOnly`, `secure` cookie and recorded in the user's database document.
3. **Session Refresh Flow:**
   - When an access token expires, the client calls `POST /api/v1/auth/refresh-token`.
   - The server verifies the token signature and validates that it matches the stored token in the database.
   - A new access token is generated without requiring the user to re-enter credentials.
4. **Instant Session Invalidation on Logout:**
   - Calling `POST /api/v1/auth/logout` sets the user's `refreshToken` field to `undefined` in MongoDB and clears client cookies, immediately invalidating the session.

---

## 2. Role-Based Access Control (RBAC)

Authorization is enforced per project using the `validateProjectPermission` middleware ([`src/middlewares/auth.middleware.js`](../src/middlewares/auth.middleware.js)).

### Permission Hierarchy
* **`admin`**: Full workspace control. Can delete projects, invite members, change collaborator roles, and delete any task.
* **`project_admin`**: Operational control. Can create tasks, assign work, delete tasks, and manage subtasks.
* **`member`**: Execution role. Can view project tasks, toggle checklist subtasks assigned to them, and post project notes.

### Middleware Implementation Pattern
```javascript
// Example: Only Admins can modify member roles
router
  .route("/:projectId/members/:userId")
  .put(validateProjectPermission([UserRolesEnum.ADMIN]), updateMemberRole)
  .delete(validateProjectPermission([UserRolesEnum.ADMIN]), deleteMember);
```
If a user belongs to the project but lacks the required role, the middleware immediately rejects with `403 Forbidden`.
