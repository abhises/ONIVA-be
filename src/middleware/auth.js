/**
 * Authentication Middleware
 * JWT token validation and user context injection
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const authenticate = (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // Attach user info to request
    req.user = decoded;
    req.userId = decoded.id;
    req.userRole = decoded.role;

    logger.debug('User authenticated', { userId: decoded.id, role: decoded.role });
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    logger.error('Authentication error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    if (!allowedRoles.includes(req.userRole)) {
      logger.warn('Unauthorized access attempt', {
        userId: req.userId,
        requiredRoles: allowedRoles,
        userRole: req.userRole
      });

      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions for this action'
      });
    }

    next();
  };
};

const extractToken = (req) => {
  
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
   if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
};

module.exports = {
  authenticate,
  authorize,
  extractToken
};