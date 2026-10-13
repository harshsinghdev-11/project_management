# Project Camp Backend — API Contracts & Integration Guide

> **Target Audience:** Frontend Engineering Agent building a **Next.js** (App Router) client.  
> **Backend Base URL:** `http://localhost:8000/api/v1`  
> **API Version:** `v1`  
> **Swagger/OpenAPI UI:** `http://localhost:8000/docs`  
> **Specification Version:** 1.1.0 (Email verification removed; Instant Registration & Login active)

---

## 1. Global Architectural Conventions

### 1.1 Base URL & Environment
Configure your Next.js environment file (`.env.local`):
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_SERVER_URL=http://localhost:8000
```

### 1.2 Unified Response Envelope
Every backend route returns a standard response envelope formatted by `ApiResponse`:

```typescript
export interface ApiResponse<T = any> {
  statusCode: number;  // HTTP status code (200, 201, etc.)
  data: T;             // Payload object or array
  message: string;     // User-friendly feedback message
  success: boolean;    // true when statusCode < 400
}
```

### 1.3 Unified Error Envelope
When requests fail, the backend throws `ApiError`:

```typescript
export interface ApiErrorResponse {
  statusCode: number;       // HTTP error status code (400, 401, 403, 404, 409, 422, 500)
  data: null;
  message: string;          // Error summary message
  success: false;
  errors: Array<Record<string, string>> | any[]; // Validation field errors if 422
}
```

#### Validation Error Format (`422 Unprocessable Entity`)
When request validation fails in express-validator, `errors` is an array of key-value objects:
```json
{
  "statusCode": 422,
  "data": null,
  "message": "Recieved data is not valid",
  "success": false,
  "errors": [
    { "email": "Email is invalid" },
    { "password": "Password is required" }
  ]
}
```

### 1.4 Authentication & Session Handling
The API supports dual-mode authentication:
1. **HTTP-Only Cookies:** `accessToken` and `refreshToken` are set as HTTP-Only cookies by the server on login and refresh.
   - In Next.js client-side `fetch`: must pass `credentials: "include"`.
   - In Axios: must set `withCredentials: true`.
   - In Next.js Server Components / Route Handlers: forward the incoming request cookies.
2. **Bearer Authorization Header:**
   - Alternatively or additionally, pass `Authorization: Bearer <accessToken>` in request headers.
3. **Email Verification:**
   - **NOT REQUIRED**. Users register and can immediately log in. `isEmailVerified` defaults to `true`. No email verification tokens or emails are needed.

---

## 2. Shared Data Models & Enums

### 2.1 Enums
```typescript
export type UserRole = "admin" | "project_admin" | "member";

export type TaskStatus = "todo" | "in_progress" | "done";
```

### 2.2 Core Entities

```typescript
export interface UserAvatar {
  url: string;
  localPath?: string;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  fullName?: string;
  avatar: UserAvatar;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  _id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProjectItem {
  project: {
    _id: string;
    name: string;
    description?: string;
    members: number; // Computed member count
    createdBy: string;
    createdAt: string;
  };
  role: UserRole; // Current user's role in this project
}

export interface ProjectMemberDetail {
  project: string;
  user: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  };
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAttachment {
  url: string;
  mimetype: string;
  size: number;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  project: string;
  assignedTo?: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  } | string;
  assignedBy?: string;
  status: TaskStatus;
  attachments: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  _id: string;
  title: string;
  task: string;
  isCompleted: boolean;
  createdBy: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  } | string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Omit<Task, 'assignedTo'> {
  assignedTo?: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  };
  subtasks: Subtask[];
}

export interface ProjectNote {
  _id: string;
  project: string;
  createdBy: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. API Endpoints Contract

### 3.1 Authentication (`/api/v1/auth`)

#### `POST /auth/register`
Register a new user account. Registration is immediate (no email verification needed).

- **Auth Required:** No
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface RegisterPayload {
    username: string; // required, lowercase, min 3 chars
    email: string;    // required, valid email
    password: string; // required
    fullName?: string;// optional
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "statusCode": 201,
    "data": {
      "user": {
        "_id": "6705...",
        "username": "alexdoe",
        "email": "alex@example.com",
        "fullName": "Alex Doe",
        "avatar": { "url": "https://placehold.co/200x200", "localPath": "" },
        "isEmailVerified": true,
        "createdAt": "2026-10-08T09:00:00.000Z",
        "updatedAt": "2026-10-08T09:00:00.000Z"
      }
    },
    "message": "User registered successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `409 Conflict`: User with email or username already exists.
  - `422 Unprocessable Entity`: Field validation failed.

---

#### `POST /auth/login`
Authenticate existing user and initiate session.

- **Auth Required:** No
- **Headers:** `Content-Type: application/json`
- **Cookies Set:** `accessToken` (HttpOnly), `refreshToken` (HttpOnly)
- **Request Body:**
  ```typescript
  interface LoginPayload {
    email: string;    // required, valid email
    password: string; // required
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "user": {
        "_id": "6705...",
        "username": "alexdoe",
        "email": "alex@example.com",
        "fullName": "Alex Doe",
        "avatar": { "url": "https://placehold.co/200x200", "localPath": "" },
        "isEmailVerified": true,
        "createdAt": "2026-10-08T09:00:00.000Z",
        "updatedAt": "2026-10-08T09:00:00.000Z"
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsIn...",
      "refreshToken": "eyJhbGciOiJIUzI1NiIsIn..."
    },
    "message": "User logged in successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `400 Bad Request`: "User does not exists" or "Invalid credentials".
  - `422 Unprocessable Entity`: Validation error.

---

#### `POST /auth/logout`
Terminates the user's active session and clears auth cookies.

- **Auth Required:** Yes (`Bearer <accessToken>` or cookie)
- **Request Body:** None
- **Cookies Cleared:** `accessToken`, `refreshToken`
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {},
    "message": "User logged out",
    "success": true
  }
  ```
- **Error Statuses:** `401 Unauthorized`

---

#### `POST /auth/current-user`
Fetch details of the currently authenticated user.
> ⚠️ **IMPORTANT NOTE FOR FRONTEND:** The backend defines this endpoint with HTTP method **`POST`** (not `GET`).

- **Auth Required:** Yes (`Bearer <accessToken>` or cookie)
- **Request Body:** None
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705...",
      "username": "alexdoe",
      "email": "alex@example.com",
      "fullName": "Alex Doe",
      "avatar": { "url": "https://placehold.co/200x200", "localPath": "" },
      "isEmailVerified": true,
      "createdAt": "2026-10-08T09:00:00.000Z",
      "updatedAt": "2026-10-08T09:00:00.000Z"
    },
    "message": "Current user fetched successfully",
    "success": true
  }
  ```
- **Error Statuses:** `401 Unauthorized`

---

#### `POST /auth/refresh-token`
Refresh expired access tokens using the refresh token.

- **Auth Required:** No (Token passed via Cookie or Body)
- **Request Body (Optional if sent in cookie):**
  ```typescript
  interface RefreshTokenPayload {
    refreshToken?: string;
  }
  ```
- **Cookies Set:** `accessToken` (HttpOnly), `refreshToken` (HttpOnly)
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    },
    "message": "Access token refreshed",
    "success": true
  }
  ```
- **Error Statuses:**
  - `401 Unauthorized`: Missing or invalid refresh token.

---

#### `POST /auth/change-password`
Change the password for the current logged-in user.

- **Auth Required:** Yes
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface ChangePasswordPayload {
    oldPassword: string; // required
    newPassword: string; // required
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {},
    "message": "Password changed successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `400 Bad Request`: "Invalid old Password".
  - `401 Unauthorized`.
  - `422 Unprocessable Entity`.

---

#### `POST /auth/forgot-password`
Initiate password reset email.

- **Auth Required:** No
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface ForgotPasswordPayload {
    email: string; // required, valid email
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {},
    "message": "Password reset mail has been sent on your mail id",
    "success": true
  }
  ```
- **Error Statuses:**
  - `404 Not Found`: "User does not exists".
  - `422 Unprocessable Entity`.

---

#### `POST /auth/reset-password/:resetToken`
Reset password using token from reset email.

- **Auth Required:** No
- **URL Params:** `resetToken: string`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface ResetPasswordPayload {
    newPassword: string; // required
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {},
    "message": "Password reset successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `400 / 489 Bad Request`: "Token is invalid or expired".
  - `422 Unprocessable Entity`.

---

### 3.2 Projects (`/api/v1/projects`)
All project endpoints require authentication via JWT.

#### `GET /projects`
List all projects accessible to the logged-in user, along with total member count and user's role.

- **Auth Required:** Yes
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": [
      {
        "project": {
          "_id": "6705a1...",
          "name": "Design System",
          "description": "Component library and branding guide",
          "members": 4,
          "createdAt": "2026-10-08T09:15:00.000Z",
          "createdBy": "6705..."
        },
        "role": "admin"
      }
    ],
    "message": "Projects fetched successfully",
    "success": true
  }
  ```

---

#### `POST /projects`
Create a new project. The creator is automatically assigned the `admin` role.

- **Auth Required:** Yes
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface CreateProjectPayload {
    name: string;        // required
    description?: string;// optional
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "statusCode": 201,
    "data": {
      "_id": "6705a1...",
      "name": "Design System",
      "description": "Component library and branding guide",
      "createdBy": "6705...",
      "createdAt": "2026-10-08T09:15:00.000Z",
      "updatedAt": "2026-10-08T09:15:00.000Z"
    },
    "message": "Project created Successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `422 Unprocessable Entity`: Name is required.

---

#### `GET /projects/:projectId`
Get details of a single project.

- **Auth Required:** Yes (Must be member of project: `admin` | `project_admin` | `member`)
- **URL Params:** `projectId: string`
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705a1...",
      "name": "Design System",
      "description": "Component library and branding guide",
      "createdBy": "6705...",
      "createdAt": "2026-10-08T09:15:00.000Z",
      "updatedAt": "2026-10-08T09:15:00.000Z"
    },
    "message": "Project fetched successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `400 Bad Request`: "project not found" or not a member.
  - `403 Forbidden`: Insufficient project permissions.
  - `404 Not Found`.

---

#### `PUT /projects/:projectId`
Update project name and description.

- **Auth Required:** Yes (Requires project role: `admin`)
- **URL Params:** `projectId: string`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface UpdateProjectPayload {
    name: string;        // required
    description?: string;// optional
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705a1...",
      "name": "Updated Design System",
      "description": "New description",
      "createdBy": "6705...",
      "createdAt": "2026-10-08T09:15:00.000Z",
      "updatedAt": "2026-10-08T09:30:00.000Z"
    },
    "message": "Project updated successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `403 Forbidden`: If user is not project `admin`.
  - `404 Not Found`.
  - `422 Unprocessable Entity`.

---

#### `DELETE /projects/:projectId`
Delete an entire project.

- **Auth Required:** Yes (Requires project role: `admin`)
- **URL Params:** `projectId: string`
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705a1...",
      "name": "Design System"
    },
    "message": "Project deleted successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `403 Forbidden`: If user is not project `admin`.
  - `404 Not Found`.

---

### 3.3 Project Members (`/api/v1/projects/:projectId/members`)

#### `GET /projects/:projectId/members`
List all members in the project along with user profile details.

- **Auth Required:** Yes
- **URL Params:** `projectId: string`
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": [
      {
        "project": "6705a1...",
        "user": {
          "_id": "6705...",
          "username": "alexdoe",
          "fullName": "Alex Doe",
          "avatar": { "url": "https://placehold.co/200x200", "localPath": "" }
        },
        "role": "admin",
        "createdAt": "2026-10-08T09:15:00.000Z",
        "updatedAt": "2026-10-08T09:15:00.000Z"
      }
    ],
    "message": "Project members fetched",
    "success": true
  }
  ```

---

#### `POST /projects/:projectId/members`
Add or invite a member to the project by user email.

- **Auth Required:** Yes (Requires project role: `admin`)
- **URL Params:** `projectId: string`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface AddMemberPayload {
    email: string;      // required, valid email of existing user
    role: UserRole;     // required: "admin" | "project_admin" | "member"
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "statusCode": 201,
    "data": {},
    "message": "Project member added successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `403 Forbidden`: Only project admin can add members.
  - `404 Not Found`: "User does not exists" (Target user must be registered in the system).
  - `422 Unprocessable Entity`: Validation failure on email or role.

---

#### `PUT /projects/:projectId/members/:userId`
Update a team member's role in the project.

- **Auth Required:** Yes (Requires project role: `admin`)
- **URL Params:**
  - `projectId: string`
  - `userId: string`
- **Headers:** `Content-Type: application/json`
- **Request Body:**
  ```typescript
  interface UpdateMemberRolePayload {
    newRole: UserRole; // "admin" | "project_admin" | "member"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705b...",
      "user": "6705...",
      "project": "6705a1...",
      "role": "project_admin",
      "createdAt": "2026-10-08T09:15:00.000Z",
      "updatedAt": "2026-10-08T09:40:00.000Z"
    },
    "message": "Project member role updated successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `400 Bad Request`: "Invalid Role" or "Project member not found".
  - `403 Forbidden`: Only project admin can update roles.

---

#### `DELETE /projects/:projectId/members/:userId`
Remove a member from the project.

- **Auth Required:** Yes (Requires project role: `admin`)
- **URL Params:**
  - `projectId: string`
  - `userId: string`
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705b...",
      "user": "6705...",
      "project": "6705a1...",
      "role": "member"
    },
    "message": "Project member deleted successfully",
    "success": true
  }
  ```
- **Error Statuses:**
  - `400 Bad Request`: "Project member not found".
  - `403 Forbidden`: Only project admin can remove members.

---

### 3.4 Tasks & Subtasks (`/api/v1/tasks` — PRD Specification)

> ℹ️ *Controller implementations exist in `src/controllers/task.controllers.js`. Below are the endpoint contracts matching the backend implementation and PRD specifications.*

#### `GET /tasks/:projectId`
Fetch all tasks for a project. Returns tasks with populated `assignedTo` user summary.

- **Auth Required:** Yes (Project member)
- **URL Params:** `projectId: string`
- **Response `200 / 201 OK`:**
  ```json
  {
    "statusCode": 201,
    "data": [
      {
        "_id": "6705c...",
        "title": "Design Figma Mockups",
        "description": "Create high-fidelity screens",
        "project": "6705a1...",
        "status": "todo",
        "assignedTo": {
          "_id": "6705...",
          "username": "alexdoe",
          "fullName": "Alex Doe",
          "avatar": { "url": "https://placehold.co/200x200" }
        },
        "attachments": [],
        "createdAt": "2026-10-08T10:00:00.000Z",
        "updatedAt": "2026-10-08T10:00:00.000Z"
      }
    ],
    "message": "Task fetched successfully",
    "success": true
  }
  ```

---

#### `POST /tasks/:projectId`
Create a new task in a project. Accepts file attachments via `multipart/form-data` or JSON.

- **Auth Required:** Yes (Role: `admin` | `project_admin`)
- **URL Params:** `projectId: string`
- **Request Body (`multipart/form-data` or `application/json`):**
  ```typescript
  interface CreateTaskPayload {
    title: string;           // required
    description?: string;    // optional
    assignedTo?: string;     // optional userId
    status?: TaskStatus;     // optional ("todo" | "in_progress" | "done")
    files?: File[];          // optional file uploads
  }
  ```
- **Response `201 Created`:**
  ```json
  {
    "statusCode": 201,
    "data": {
      "_id": "6705c...",
      "title": "Design Figma Mockups",
      "description": "Create high-fidelity screens",
      "project": "6705a1...",
      "status": "todo",
      "assignedTo": "6705...",
      "assignedBy": "6705...",
      "attachments": [
        {
          "url": "http://localhost:8000/images/spec.pdf",
          "mimetype": "application/pdf",
          "size": 1048576
        }
      ],
      "createdAt": "2026-10-08T10:00:00.000Z",
      "updatedAt": "2026-10-08T10:00:00.000Z"
    },
    "message": "Task created successfully",
    "success": true
  }
  ```

---

#### `GET /tasks/:projectId/t/:taskId`
Get detailed task information including populated `assignedTo` and populated list of `subtasks` with their creators.

- **Auth Required:** Yes (Project member)
- **URL Params:**
  - `projectId: string`
  - `taskId: string`
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "_id": "6705c...",
      "title": "Design Figma Mockups",
      "description": "Create high-fidelity screens",
      "status": "in_progress",
      "attachments": [],
      "assignedTo": {
        "_id": "6705...",
        "username": "alexdoe",
        "fullName": "Alex Doe",
        "avatar": { "url": "https://placehold.co/200x200" }
      },
      "subtasks": [
        {
          "_id": "6705d...",
          "title": "Create Color Palette",
          "isCompleted": true,
          "createdBy": {
            "_id": "6705...",
            "username": "alexdoe",
            "fullName": "Alex Doe",
            "avatar": { "url": "https://placehold.co/200x200" }
          }
        }
      ]
    },
    "message": "Task fetched successfully",
    "success": true
  }
  ```

---

#### Additional Task & Subtask Endpoints (PRD Schema):
- `PUT /tasks/:projectId/t/:taskId`: Update task title, description, assignedTo, status.
- `DELETE /tasks/:projectId/t/:taskId`: Delete a task.
- `POST /tasks/:projectId/t/:taskId/subtasks`: Add a subtask (`{ title: string }`).
- `PUT /tasks/:projectId/st/:subTaskId`: Update subtask (`{ title?: string, isCompleted?: boolean }`).
- `DELETE /tasks/:projectId/st/:subTaskId`: Delete subtask.

---

### 3.5 System Health (`/api/v1/healthcheck`)

#### `GET /healthcheck`
Checks server uptime and connectivity.

- **Auth Required:** No
- **Response `200 OK`:**
  ```json
  {
    "statusCode": 200,
    "data": {
      "message": "Server is running"
    },
    "message": "Success",
    "success": true
  }
  ```

---

## 4. Next.js Integration Guide

### 4.1 Recommended API Client Helper (`lib/api-client.ts`)
Because backend uses HttpOnly cookies and Dual Bearer tokens, configure a robust API client:

```typescript
// lib/api-client.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

interface RequestOptions extends RequestInit {
  token?: string;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { token, headers = {}, ...restOptions } = options;

  const finalHeaders: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };

  // If sending FormData (file uploads), do NOT manually set Content-Type
  if (restOptions.body instanceof FormData) {
    delete (finalHeaders as any)["Content-Type"];
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...restOptions,
    headers: finalHeaders,
    credentials: "include", // CRITICAL for cookies: accessToken & refreshToken
  });

  const json = await response.json();

  if (!response.ok) {
    throw json; // Will contain ApiErrorResponse { statusCode, message, errors, ... }
  }

  return json.data as T;
}
```

### 4.2 Handling Token Refresh Interceptor (Client-Side)
```typescript
let isRefreshing = false;

export async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) return false;
  isRefreshing = true;

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh-token`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
  }
}
```

### 4.3 Handling Next.js Middleware / Route Guards
In `middleware.ts`:
Check for presence of the `accessToken` or `refreshToken` cookie:
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/request";

export function middleware(request: NextRequest) {
  const accessToken = request.cookies.get("accessToken")?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith("/login") || 
                     request.nextUrl.pathname.startsWith("/register");

  if (!accessToken && !isAuthPage && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (accessToken && isAuthPage) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
```

---

## 5. Ready-to-use TypeScript Declarations (`types/api.ts`)

Copy and paste this directly into your Next.js project at `types/api.ts`:

```typescript
/**
 * Project Camp API Types
 */

export type UserRole = "admin" | "project_admin" | "member";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface UserAvatar {
  url: string;
  localPath?: string;
}

export interface User {
  _id: string;
  username: string;
  email: string;
  fullName?: string;
  avatar: UserAvatar;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponseData {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface Project {
  _id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProjectItem {
  project: {
    _id: string;
    name: string;
    description?: string;
    members: number;
    createdBy: string;
    createdAt: string;
  };
  role: UserRole;
}

export interface ProjectMemberDetail {
  project: string;
  user: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  };
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface TaskAttachment {
  url: string;
  mimetype: string;
  size: number;
}

export interface Task {
  _id: string;
  title: string;
  description?: string;
  project: string;
  assignedTo?: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  } | string;
  assignedBy?: string;
  status: TaskStatus;
  attachments: TaskAttachment[];
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  _id: string;
  title: string;
  task: string;
  isCompleted: boolean;
  createdBy: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  } | string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Omit<Task, "assignedTo"> {
  assignedTo?: {
    _id: string;
    username: string;
    fullName?: string;
    avatar: UserAvatar;
  };
  subtasks: Subtask[];
}

export interface ProjectNote {
  _id: string;
  project: string;
  createdBy: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

export interface ApiErrorResponse {
  statusCode: number;
  data: null;
  message: string;
  success: false;
  errors: Array<Record<string, string>> | any[];
}
```
