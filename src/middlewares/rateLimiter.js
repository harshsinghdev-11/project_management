import { rateLimit } from "express-rate-limit";

/**
 * Factory helper for creating consistent rate limiters with standardized API error payloads
 */
const createLimiter = (options) => {
  return rateLimit({
    standardHeaders: "draft-7",
    legacyHeaders: false,
    statusCode: 429,
    handler: (req, res, next, opts) => {
      res.status(opts.statusCode).json({
        statusCode: opts.statusCode,
        message: typeof opts.message === "string" ? opts.message : "Too many requests. Please try again later.",
        errors: [],
        success: false,
      });
    },
    ...options,
  });
};


export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 600,
  message: "Too many requests from this IP. Please try again after 15 minutes.",
});


export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  message: "Too many authentication attempts. Please try again after 15 minutes.",
});


export const passwordResetLimiter = createLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: "Too many password reset requests. Please try again after 15 minutes.",
});


export const sessionLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 30,
  message: "Session request rate limit exceeded. Please try again shortly.",
});

export const writeLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 50,
  message: "Too many write requests. Please slow down and try again shortly.",
});

/**
 * 6. Data Query Limiter (Reads)
 * Applied to GET on /projects and /tasks.
 * Prevents automated scrapers from overwhelming MongoDB aggregation pipelines.
 * Allows 120 requests per minute (~2 req/sec continuous).
 */
export const readLimiter = createLimiter({
  windowMs: 60 * 1000, // 1 minute
  limit: 120,
  message: "Too many read requests. Please slow down and try again shortly.",
});