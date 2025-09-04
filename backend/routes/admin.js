// routes/admin.js
import express from 'express';
import { promisePool } from '../config/db.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes in this file require admin role
router.use(authenticate, authorize(['admin']));

// GET /admin/overview - high-level system overview
router.get('/overview', async (req, res) => {
  try {
    const [complaintsStats] = await promisePool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent
      FROM complaints
    `);

    const [userStats] = await promisePool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) as students,
        SUM(CASE WHEN role = 'lecturer' THEN 1 ELSE 0 END) as lecturers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admins
      FROM users
    `);

    res.json({
      success: true,
      data: {
        complaints: complaintsStats[0],
        users: userStats[0]
      }
    });
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin overview',
      error_code: 'ADMIN_OVERVIEW_ERROR'
    });
  }
});

// GET /admin/complaints/recent - latest complaints
router.get('/complaints/recent', async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
      SELECT complaint_id, title, category, status, priority, created_at
      FROM complaints
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching recent complaints:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent complaints' });
  }
});

// GET /admin/users/recent - latest registered users
router.get('/users/recent', async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
      SELECT computer_number, role, first_name, last_name, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching recent users:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent users' });
  }
});

// GET /admin/system/stats - DB and system quick check
router.get('/system/stats', async (req, res) => {
  try {
    const [[dbNow]] = await promisePool.query('SELECT NOW() as now');
    const [[tablesCount]] = await promisePool.query('SELECT COUNT(*) as tables_count FROM information_schema.tables WHERE table_schema = DATABASE()');
    res.json({
      success: true,
      data: {
        server_time: new Date().toISOString(),
        db_time: dbNow.now,
        tables_count: tablesCount.tables_count,
        environment: process.env.NODE_ENV || 'development'
      }
    });
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch system stats' });
  }
});

// GET /admin/meetings/overview - meetings totals by status
router.get('/meetings/overview', async (req, res) => {
  try {
    const [stats] = await promisePool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM meetings
    `);
    res.json({ success: true, data: stats[0] });
  } catch (error) {
    console.error('Error fetching meetings overview:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch meetings overview', error_code: 'MEETINGS_OVERVIEW_ERROR' });
  }
});

// GET /admin/meetings/recent - latest meetings
router.get('/meetings/recent', async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
      SELECT 
        meeting_id,
        title,
        organizer_computer_number,
        participant_computer_number,
        scheduled_at,
        status,
        created_at
      FROM meetings
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching recent meetings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent meetings', error_code: 'MEETINGS_RECENT_ERROR' });
  }
});

// GET /admin/notifications/overview - notifications totals by type/status
router.get('/notifications/overview', async (req, res) => {
  try {
    const [stats] = await promisePool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN type = 'sms' THEN 1 ELSE 0 END) as sms,
        SUM(CASE WHEN type = 'email' THEN 1 ELSE 0 END) as email
      FROM notifications
    `);
    res.json({ success: true, data: stats[0] });
  } catch (error) {
    console.error('Error fetching notifications overview:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications overview', error_code: 'NOTIFICATIONS_OVERVIEW_ERROR' });
  }
});

// GET /admin/notifications/recent - latest notifications
router.get('/notifications/recent', async (req, res) => {
  try {
    const [rows] = await promisePool.query(`
      SELECT 
        notification_id,
        computer_number,
        type,
        status,
        message,
        created_at
      FROM notifications
      ORDER BY created_at DESC
      LIMIT 20
    `);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching recent notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch recent notifications', error_code: 'NOTIFICATIONS_RECENT_ERROR' });
  }
});

export default router;


