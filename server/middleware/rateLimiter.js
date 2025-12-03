/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting request frequency
 */

const { config } = require("../config");

// In-memory store for rate limiting
// In production, use Redis or similar
const requestCounts = new Map();

/**
 * Clean up old entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > config.rateLimit.windowMs * 2) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Clean up every minute

/**
 * Get client identifier (IP address)
 */
function getClientId(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.connection.remoteAddress ||
    "unknown"
  );
}

/**
 * Rate limiting middleware
 */
function rateLimiter(req, res, next) {
  const clientId = getClientId(req);
  const now = Date.now();

  let clientData = requestCounts.get(clientId);

  if (!clientData || now - clientData.windowStart > config.rateLimit.windowMs) {
    // Start new window
    clientData = {
      windowStart: now,
      count: 1,
    };
    requestCounts.set(clientId, clientData);
  } else {
    clientData.count++;
  }

  // Set rate limit headers
  res.setHeader("X-RateLimit-Limit", config.rateLimit.maxRequests);
  res.setHeader(
    "X-RateLimit-Remaining",
    Math.max(0, config.rateLimit.maxRequests - clientData.count),
  );
  res.setHeader(
    "X-RateLimit-Reset",
    new Date(clientData.windowStart + config.rateLimit.windowMs).toISOString(),
  );

  if (clientData.count > config.rateLimit.maxRequests) {
    console.warn(`[RateLimit] Client ${clientId} exceeded rate limit`);

    return res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil(
        (clientData.windowStart + config.rateLimit.windowMs - now) / 1000,
      ),
    });
  }

  next();
}

/**
 * Stricter rate limiter for sensitive endpoints
 */
function strictRateLimiter(req, res, next) {
  const clientId = getClientId(req);
  const key = `strict:${clientId}`;
  const now = Date.now();

  // Stricter limits: 10 requests per minute
  const strictWindow = 60000;
  const strictMax = 10;

  let clientData = requestCounts.get(key);

  if (!clientData || now - clientData.windowStart > strictWindow) {
    clientData = {
      windowStart: now,
      count: 1,
    };
    requestCounts.set(key, clientData);
  } else {
    clientData.count++;
  }

  if (clientData.count > strictMax) {
    console.warn(`[RateLimit] Client ${clientId} exceeded strict rate limit`);

    return res.status(429).json({
      error: "Too many requests to sensitive endpoint",
      retryAfter: Math.ceil(
        (clientData.windowStart + strictWindow - now) / 1000,
      ),
    });
  }

  next();
}

module.exports = {
  rateLimiter,
  strictRateLimiter,
};
