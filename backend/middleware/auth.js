// middleware/auth.js
import jwt from 'jsonwebtoken';
import { promisePool } from '../config/db.js';

// Authentication middleware - verifies JWT token
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        error_code: 'TOKEN_REQUIRED'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get current user data from database
    const [users] = await promisePool.query(
      'SELECT computer_number, role, first_name, last_name, email FROM users WHERE computer_number = ?',
      [decoded.computer_number]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        error_code: 'USER_NOT_FOUND'
      });
    }

    // Attach user to request object
    req.user = users[0];
    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        error_code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        error_code: 'TOKEN_EXPIRED'
      });
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed',
      error_code: 'AUTH_ERROR'
    });
  }
};

// Authorization middleware - checks user roles
export const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        error_code: 'AUTH_REQUIRED'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}`,
        error_code: 'INSUFFICIENT_PERMISSIONS',
        user_role: req.user.role,
        required_roles: allowedRoles
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token, but sets user if valid token
export const optionalAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [users] = await promisePool.query(
      'SELECT computer_number, role, first_name, last_name, email FROM users WHERE computer_number = ?',
      [decoded.computer_number]
    );

    req.user = users.length > 0 ? users[0] : null;
    next();

  } catch (error) {
    // Continue without user if token is invalid
    req.user = null;
    next();
  }
};