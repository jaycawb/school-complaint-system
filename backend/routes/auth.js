// routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { promisePool } from '../config/db.js';

const router = express.Router();

// POST /auth/register - Register new user
router.post('/register', async (req, res) => {
  try {
    const {
      computer_number,
      role = 'student',
      first_name,
      last_name,
      email,
      phone,
      password
    } = req.body;

    // Validation
    if (!computer_number || !first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required',
        required_fields: ['computer_number', 'first_name', 'last_name', 'email', 'phone', 'password']
      });
    }

    // Validate computer number format (10 digits)
    if (!/^\d{10}$/.test(computer_number)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid computer number format. Expected: 10 digits (e.g., 2019123456)'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate role
    const validRoles = ['admin', 'lecturer', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }

    // Check if user already exists
    const [existingUser] = await promisePool.query(
      'SELECT computer_number, email FROM users WHERE computer_number = ? OR email = ?',
      [computer_number, email]
    );

    if (existingUser.length > 0) {
      const conflict = existingUser[0].computer_number === computer_number 
        ? 'Computer number' 
        : 'Email address';
      
      return res.status(409).json({
        success: false,
        message: `${conflict} already exists`,
        error_code: 'USER_EXISTS'
      });
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const insertQuery = `
      INSERT INTO users (computer_number, role, first_name, last_name, email, phone, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    await promisePool.query(insertQuery, [
      computer_number,
      role,
      first_name,
      last_name,
      email,
      phone,
      password_hash
    ]);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        computer_number,
        role,
        first_name,
        last_name,
        email,
        phone
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed. Please try again.',
      error_code: 'REGISTRATION_ERROR'
    });
  }
});

// POST /auth/login - Login user
router.post('/login', async (req, res) => {
  try {
    const { computer_number, password } = req.body;

    // Validation
    if (!computer_number || !password) {
      return res.status(400).json({
        success: false,
        message: 'Computer number and password are required'
      });
    }

    // Find user
    const [users] = await promisePool.query(
      'SELECT computer_number, role, first_name, last_name, email, phone, password_hash FROM users WHERE computer_number = ?',
      [computer_number]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error_code: 'INVALID_CREDENTIALS'
      });
    }

    const user = users[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        error_code: 'INVALID_CREDENTIALS'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        computer_number: user.computer_number,
        role: user.role,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Remove password_hash from response
    const { password_hash, ...userData } = user;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: userData,
        token,
        expires_in: process.env.JWT_EXPIRES_IN || '24h'
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error_code: 'LOGIN_ERROR'
    });
  }
});

// GET /auth/profile - Get user profile (requires authentication)
router.get('/profile', async (req, res) => {
  try {
    // Extract token from Authorization header
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
    
    // Get user data
    const [users] = await promisePool.query(
      'SELECT computer_number, role, first_name, last_name, email, phone, created_at FROM users WHERE computer_number = ?',
      [decoded.computer_number]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error_code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: users[0]
    });

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

    console.error('Profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get profile',
      error_code: 'PROFILE_ERROR'
    });
  }
});

// PUT /auth/profile - Update user profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required',
        error_code: 'TOKEN_REQUIRED'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { first_name, last_name, email, phone } = req.body;

    // Build update query dynamically
    let updateFields = [];
    let queryParams = [];

    if (first_name) {
      updateFields.push('first_name = ?');
      queryParams.push(first_name);
    }

    if (last_name) {
      updateFields.push('last_name = ?');
      queryParams.push(last_name);
    }

    if (email) {
      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      // Check if email already exists
      const [existingEmail] = await promisePool.query(
        'SELECT computer_number FROM users WHERE email = ? AND computer_number != ?',
        [email, decoded.computer_number]
      );

      if (existingEmail.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email address already exists'
        });
      }

      updateFields.push('email = ?');
      queryParams.push(email);
    }

    if (phone) {
      updateFields.push('phone = ?');
      queryParams.push(phone);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided for update'
      });
    }

    queryParams.push(decoded.computer_number);

    const updateQuery = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE computer_number = ?
    `;

    await promisePool.query(updateQuery, queryParams);

    // Get updated user data
    const [updatedUser] = await promisePool.query(
      'SELECT computer_number, role, first_name, last_name, email, phone FROM users WHERE computer_number = ?',
      [decoded.computer_number]
    );

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser[0]
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
        error_code: 'INVALID_TOKEN'
      });
    }

    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error_code: 'UPDATE_ERROR'
    });
  }
});

// POST /auth/change-password - Change password
router.post('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get current password hash
    const [users] = await promisePool.query(
      'SELECT password_hash FROM users WHERE computer_number = ?',
      [decoded.computer_number]
    );

    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const validPassword = await bcrypt.compare(current_password, users[0].password_hash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const new_password_hash = await bcrypt.hash(new_password, 12);

    // Update password
    await promisePool.query(
      'UPDATE users SET password_hash = ? WHERE computer_number = ?',
      [new_password_hash, decoded.computer_number]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

export default router;