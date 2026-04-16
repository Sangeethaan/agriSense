/**
 * requestLogger middleware
 * Lightweight request logger (supplements morgan in dev).
 */
const requestLogger = (req, _res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.originalUrl}`);
  next();
};

module.exports = requestLogger;
