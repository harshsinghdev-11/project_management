# Project Management API

> 🌐 **Live Application:** [https://project-camp-six.vercel.app/](https://project-camp-six.vercel.app/)

A production-ready REST API for workspace, task, and team management built with **Node.js, Express, and MongoDB Atlas**. 

Engineered with clean architecture, real-world security mitigations, stateless JWT authentication with role-based access control, and empirically tested rate-limiting tailored for cloud deployment.

---

## Architecture & Engineering Highlights

| # | Architectural Pillar | Summary | Deep Dive |
| :---: | :--- | :--- | :---: |
| **1** | **RESTful API Design** | Resource-oriented endpoints with standardized `ApiResponse` / `ApiError` envelopes and live Swagger docs. | [Read Docs](docs/rest-api.md) |
| **2** | **Relational NoSQL Design** | Normalized 6-collection schema with junction models (`ProjectMember`) to prevent 16MB document size limits. | [Read Docs](docs/database-design.md) |
| **3** | **Timing Attack Mitigation** | Constant-time middleware with cryptographic jitter ($\pm 30\text{ms}$) across auth endpoints to eliminate user enumeration (CWE-208). | [Read Docs](docs/timing-attack-defense.md) |
| **4** | **Stateless Auth & RBAC** | Dual-token rotation (JWT Access + Refresh tokens) with hierarchical role permissions (`admin`, `project_admin`, `member`). | [Read Docs](docs/auth-and-rbac.md) |
| **5** | **MongoDB Aggregations** | Multi-stage pipeline lookups (`$match`, `$lookup`, `$project`, `$addFields`) fetching hydrated nested tasks in a single database round-trip. | [Read Docs](docs/aggregation-pipelines.md) |
| **6** | **Fail-Fast Validation** | Declarative `express-validator` rules paired with a centralized middleware returning `422 Unprocessable Entity` before controllers run. | [Read Docs](docs/validation.md) |
| **7** | **Cached DB Connection** | Promise-cached singleton pattern (`connectionPromise`) in `src/db/index.js` eliminating duplicate sockets on cloud cold starts. | [Read Docs](docs/db-connection-caching.md) |

---

## Tech Stack

* **Runtime:** Node.js (ES Modules)
* **Framework:** Express.js 5
* **Database:** MongoDB Atlas with Mongoose ODM
* **Security:** Bcrypt.js, JSON Web Tokens (JWT), Express-Rate-Limit, CORS, Cookie-Parser
* **Validation:** Express-Validator
* **Load Testing:** Autocannon
* **Documentation:** Swagger UI / OpenAPI 3.0

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root:
```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
ACCESS_TOKEN_SECRET=your_access_token_secret
ACCESS_TOKEN_EXPIRY=1d
REFRESH_TOKEN_SECRET=your_refresh_token_secret
REFRESH_TOKEN_EXPIRY=10d
CORS_ORIGIN=http://localhost:3000
```

### 3. Run Locally
```bash
# Development (with nodemon)
npm run dev

# Production
npm start

---

## Work Still Required

1. Flow of `forgot-password` (end-to-end email delivery and reset token flow)
