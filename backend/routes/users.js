// routes/users.js
import express from 'express';
import { promisePool } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// GET /users - Get all users (Admin only)
router.get('/', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const {
      role,
      page = 1,
      limit = 10,
      sort_by = 'created_at',
      sort_order = 'DESC',
      search
    } = req.query;

    // Build WHERE clause
    let whereConditions = [];
    let queryParams = [];

    if (role) {
      whereConditions.push('role = ?');
      queryParams.push(role);
    }

    if (search) {
      whereConditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR computer_number LIKE ?)');
      const searchTerm = `%${search}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Validate sort parameters
    const validSortColumns = ['created_at', 'first_name', 'last_name', 'role', 'computer_number'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = validSortOrders.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

    // Calculate offset
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
    const [countResult] = await promisePool.query(countQuery, queryParams);
    const totalUsers = countResult[0].total;

    // Get users (excluding password_hash)
    const query = `
      SELECT 
        computer_number,
        role,
        first_name,
        last_name,
        email,
        phone,
        created_at
      FROM users 
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const [users] = await promisePool.query(query, queryParams);

    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    res.json({
      success: true,
      data: users,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_users: totalUsers,
        limit: parseInt(limit),
        has_next: parseInt(page) < totalPages,
        has_prev: parseInt(page) > 1
      },
      filters: {
        role,
        search
      }
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error_code: 'FETCH_ERROR'
    });
  }
});

// GET /users/:computer_number - Get specific user (Admin or own profile)
router.get('/:computer_number', authenticate, async (req, res) => {
  try {
    const { computer_number } = req.params;

    // Check if user is admin or requesting their own profile
    if (req.user.role !== 'admin' && req.user.computer_number !== computer_number) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own profile.',
        error_code: 'ACCESS_DENIED'
      });
    }

    const query = `
      SELECT 
        computer_number,
        role,
        first_name,
        last_name,
        email,
        phone,
        created_at
      FROM users 
      WHERE computer_number = ?
    `;

    const [users] = await promisePool.query(query, [computer_number]);

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
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error_code: 'FETCH_ERROR'
    });
  }
});

// PUT /users/:computer_number/role - Update user role (Admin only)
router.put('/:computer_number/role', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { computer_number } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required'
      });
    }

    const validRoles = ['admin', 'lecturer', 'student'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      });
    }

    // Check if user exists
    const [existingUser] = await promisePool.query(
      'SELECT computer_number, role FROM users WHERE computer_number = ?',
      [computer_number]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error_code: 'USER_NOT_FOUND'
      });
    }

    // Prevent admin from demoting themselves
    if (req.user.computer_number === computer_number && req.user.role === 'admin' && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'You cannot change your own admin role',
        error_code: 'CANNOT_DEMOTE_SELF'
      });
    }

    // Update role
    await promisePool.query(
      'UPDATE users SET role = ? WHERE computer_number = ?',
      [role, computer_number]
    );

    // Get updated user
    const [updatedUser] = await promisePool.query(
      'SELECT computer_number, role, first_name, last_name, email FROM users WHERE computer_number = ?',
      [computer_number]
    );

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: updatedUser[0]
    });

  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role',
      error_code: 'UPDATE_ERROR'
    });
  }
});

// DELETE /users/:computer_number - Delete user (Admin only)
router.delete('/:computer_number', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { computer_number } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.computer_number === computer_number) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account',
        error_code: 'CANNOT_DELETE_SELF'
      });
    }

    // Check if user exists
    const [existingUser] = await promisePool.query(
      'SELECT computer_number FROM users WHERE computer_number = ?',
      [computer_number]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        error_code: 'USER_NOT_FOUND'
      });
    }

    // In production, you might want to soft delete or transfer user's data
    // For now, we'll do a hard delete
    await promisePool.query('DELETE FROM users WHERE computer_number = ?', [computer_number]);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error_code: 'DELETE_ERROR'
    });
  }
});

// GET /users/stats/overview - Get user statistics (Admin only)
router.get('/stats/overview', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) as students,
        SUM(CASE WHEN role = 'lecturer' THEN 1 ELSE 0 END) as lecturers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as new_this_month,
        SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as new_this_week
      FROM users
    `;

    // Get registration trends (last 30 days)
    const trendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as registrations,
        role
      FROM users 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at), role
      ORDER BY date ASC
    `;

    const [stats] = await promisePool.query(statsQuery);
    const [trends] = await promisePool.query(trendsQuery);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        trends: trends
      }
    });

  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error_code: 'STATS_ERROR'
    });
  }
});

export default router;