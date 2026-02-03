/**
 * Error Handler Middleware
 * Centralized error handling for the application
 */

const logger = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.timestamp = new Date().toISOString();
  }
}

const errorHandler = (err, req, res, next) => {
  const error = err instanceof AppError ? err : new AppError(
    err.message || 'Internal Server Error',
    err.statusCode || 500,
    err.code
  );

  // Log the error
  logger.error('Error occurred:', {
    message: error.message,
    statusCode: error.statusCode,
    code: error.code,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  // Send error response
  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    code: error.code,
    timestamp: error.timestamp,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler
};