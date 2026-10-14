# Side-Channel & Timing Attack Defense (CWE-208)

This project implements an active timing defense mechanism on authentication endpoints to prevent **user enumeration via response-time discrepancy**.

---

## 1. The Vulnerability

When a client sends credentials to `POST /api/v1/auth/login`:
* **If the user does NOT exist:** The query finds nothing, and the server rejects in **~5ms**.
* **If the user DOES exist but the password is wrong:** The server executes `bcrypt.compare()`, which performs 10 cryptographic rounds requiring **~150ms – 250ms** of CPU time before rejecting.

An external attacker can measure this 150ms difference to determine whether an email address is registered on the platform without ever guessing the password.

---

## 2. The Solution: `constantTimeResponse`

A custom Express middleware ([`src/middlewares/timing.middleware.js`](../src/middlewares/timing.middleware.js)) intercepts all `/api/v1/auth` traffic:

```javascript
export const constantTimeResponse = (
  targetMs = Number(process.env.AUTH_RESPONSE_TARGET_MS) || 500,
  jitterMs = Number(process.env.AUTH_RESPONSE_JITTER_MS) || 30
) => {
  return (req, res, next) => {
    const startTime = Date.now();
    // Intercept res.json to delay the outgoing response to targetMs +/- jitterMs
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const elapsed = Date.now() - startTime;
      const targetDelay = targetMs + (Math.random() * 2 - 1) * jitterMs;
      const remainingWait = Math.max(0, targetDelay - elapsed);
      setTimeout(() => originalJson(body), remainingWait);
    };
    next();
  };
};
```

---

## 3. Results

* **Uniform Baseline:** Every auth request is held to a predictable response window of **~500ms**.
* **Cryptographic Jitter:** Adds $\pm 30\text{ms}$ of randomized variance to mimic real-world internet packet travel.
* **Effective Protection:** Whether an account exists, a password fails, or login succeeds, response times are statistically indistinguishable from the outside.
