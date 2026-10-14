# Metric-Driven Rate Limiting Architecture

The rate-limiting policies in this project were **not chosen arbitrarily**. They were calibrated from empirical load testing data collected using **Autocannon** across 104 test runs on a live **Render cloud instance** connected to **MongoDB Atlas**.

---

## 1. Summary of Rate Limits by Route

| Limiter | Target Endpoints | Window | Max Reqs | Primary Defense |
| :--- | :--- | :---: | :---: | :--- |
| **`authLimiter`** | `POST /login`<br>`POST /register`<br>`POST /change-password` | **15 mins** | **10** | **Bcrypt CPU Exhaustion:** Shields Render’s 0.1 shared vCPU from thread pool starvation and stops brute-force credential stuffing. |
| **`passwordResetLimiter`** | `POST /forgot-password`<br>`POST /reset-password` | **15 mins** | **5** | **Email Quota Defense:** Prevents inbox bombing and saves third-party transactional email quotas (SendGrid, Resend). |
| **`sessionLimiter`** | `POST /refresh-token`<br>`POST /current-user`<br>`POST /logout` | **1 min** | **30** | Prevents runaway client-side infinite token refresh loops while allowing seamless multi-tab usage. |
| **`writeLimiter`** | `POST`, `PUT`, `DELETE` on tasks & projects | **1 min** | **50** | Protects MongoDB Atlas 512MB storage cap and catches accidental React `useEffect` loop triggers. |
| **`readLimiter`** | `GET` on tasks & projects | **1 min** | **120** | Sustains ~2 calls/sec continuous for smooth human browsing while blocking automated scrapers. |
| **`globalLimiter`** | `/api/*` (Umbrella) | **15 mins** | **600** | Catches volumetric vulnerability scanners and automated DDoS floods. |

---

## 2. The Empirical Evidence (Why These Specific Numbers?)

### Bcrypt CPU Squeezing on Render Free Tier
* **Load Test Finding:** When 10 concurrent requests hit `POST /login` simultaneously, requests queued past 3 seconds because each Bcrypt hash (10 salt rounds) requires ~200ms of raw CPU time.
* On Render's shared 0.1 vCPU, running 10 parallel hashes starved Node’s `libuv` threadpool.
* **The Solution:** Capping attempts at **10 per 15 minutes** drops bot attacks in **< 1ms with HTTP 429** before Bcrypt is ever called, completely protecting server responsiveness for other users.

### Read Throughput Baseline
* **Load Test Finding:** In Autocannon benchmarks under 100 concurrent connections, read endpoints (`GET /projects/:id`, `GET /tasks/:id`) sustained **100 – 136 requests/sec** stably.
* Setting `readLimiter` to **120 requests/minute** provides an average human user with 2 requests every second continuously, providing seamless UX without letting scrapers dump the database.

---

## 3. Critical Cloud Config: `trust proxy`

Because Render places incoming traffic behind a reverse proxy load balancer, Render passes the real client IP in the `X-Forwarded-For` header.

```javascript
// backend/src/app.js
app.set("trust proxy", 1);
```

Without this setting, `express-rate-limit` would see Render's internal proxy IP for *all* visitors, accidentally pooling all global users into a single rate-limit bucket and blocking everyone.
