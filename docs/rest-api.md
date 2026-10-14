# REST API Architecture & Standards

This project implements a resource-oriented RESTful API adhering to standard HTTP semantics.

---

## 1. Resource Structure

Endpoints are grouped into three primary domains under `/api/v1`:

| Domain | Base Route | Description |
| :--- | :--- | :--- |
| **Auth** | `/api/v1/auth` | User registration, login, token refresh, password recovery, and session control. |
| **Projects** | `/api/v1/projects` | Workspaces, team memberships, and collaborator role management. |
| **Tasks** | `/api/v1/tasks` | Task creation, status updates, attachments, and checklist subtasks. |

---

## 2. Standard HTTP Methods & Status Codes

* **`GET`**: Retrieve resources (`200 OK`)
* **`POST`**: Create resources (`201 Created`) or trigger actions (`200 OK`)
* **`PUT`**: Update resources (`200 OK`)
* **`DELETE`**: Remove resources (`200 OK`)

Error handling uses standardized HTTP status codes:
* `400 Bad Request` — Invalid syntax or business logic failure
* `401 Unauthorized` — Missing or expired JWT token
* `403 Forbidden` — Insufficient role permissions
* `404 Not Found` — Resource does not exist
* `422 Unprocessable Entity` — Schema or payload validation errors
* `429 Too Many Requests` — Rate limit exceeded
* `500 Internal Server Error` — Unhandled server exception

---

## 3. Unified Response Format

All responses follow a predictable JSON contract:

### Success Response (`ApiResponse`)
```json
{
  "statusCode": 200,
  "data": {
    "_id": "6ace0ecbfd5aa37717968c33",
    "title": "Build user onboarding",
    "status": "todo"
  },
  "message": "Task fetched successfully",
  "success": true
}
```

### Error Response (`ApiError`)
```json
{
  "statusCode": 422,
  "message": "Received data is not valid",
  "errors": [
    { "title": "Title is required" }
  ],
  "success": false
}
```

---

## 4. Swagger / OpenAPI Documentation

Interactive API documentation is generated using OpenAPI 3.0 and served at:
```
http://localhost:3000/docs
```
It provides live request/response schemas and sandbox testing for all endpoints.
