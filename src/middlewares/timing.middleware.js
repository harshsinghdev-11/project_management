import crypto from "crypto";

/**
 * Constant-Time Response Middleware
 *
 * Mitigates Observable Timing Discrepancies (CWE-208 / CWE-385) by padding
 * response times to a uniform baseline target across all outcomes (success,
 * validation errors, auth failures, and exceptions).
 *
 * @param {Object} options
 * @param {number} [options.targetMs] - Target response duration in ms (default: process.env.AUTH_RESPONSE_TARGET_MS or 500)
 * @param {number} [options.jitterMs] - Maximum random jitter in ms to prevent statistical timing averaging (default: process.env.AUTH_RESPONSE_JITTER_MS or 30)
 */
export const constantTimeResponse = (options = {}) => {
  const defaultTargetMs =
    parseInt(process.env.AUTH_RESPONSE_TARGET_MS, 10) || 500;
  const defaultJitterMs =
    parseInt(process.env.AUTH_RESPONSE_JITTER_MS, 10) || 30;

  const targetMs = options.targetMs ?? defaultTargetMs;
  const jitterMs = options.jitterMs ?? defaultJitterMs;

  return (req, res, next) => {
    // High-resolution start timestamp in nanoseconds
    const startHrTime = process.hrtime.bigint();

    // Cryptographic jitter prevents statistical average subtraction attacks
    const jitter = jitterMs > 0 ? crypto.randomInt(0, jitterMs + 1) : 0;
    const targetDurationMs = targetMs + jitter;

    const originalEnd = res.end;
    let ended = false;
    let timer = null;

    // Clean up active timer if client socket aborts prematurely before response completes
    res.on("close", () => {
      if (timer && !res.writableEnded) {
        clearTimeout(timer);
        timer = null;
      }
    });

    // Intercept canonical HTTP response termination
    res.end = function (...args) {
      if (ended || res.writableEnded) {
        return originalEnd.apply(res, args);
      }
      ended = true;

      const elapsedNs = process.hrtime.bigint() - startHrTime;
      const elapsedMs = Number(elapsedNs) / 1_000_000;
      const remainingMs = Math.max(0, targetDurationMs - elapsedMs);

      if (remainingMs <= 0) {
        return originalEnd.apply(res, args);
      }

      timer = setTimeout(() => {
        timer = null;
        if (!res.destroyed && !res.writableEnded) {
          originalEnd.apply(res, args);
        }
      }, remainingMs);

      return this;
    };

    next();
  };
};
