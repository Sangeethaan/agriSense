/**
 * errorHandler middleware
 * Centralised error response formatter.
 * Must be the last app.use() call in server.js.
 */
const errorHandler = (err, _req, res, _next) => {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(`[ERROR ${status}]`, err.stack);
  }

  res.status(status).json({
    error:   message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
