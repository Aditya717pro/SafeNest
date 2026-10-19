/**
 * Centralized API Error Handling Middleware
 */

export function errorHandler(err, req, res, next) {
  console.error('[API Error]', err);

  // Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      error: `An entry with that ${field} already exists.`
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({
      success: false,
      error: messages.join('. ')
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }

  // Default server error
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
}
