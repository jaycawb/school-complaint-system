// routes/complaints.js
import express from 'express';
import { promisePool } from '../config/db.js';

const router = express.Router();

// POST /complaints - Submit new complaint
router.post('/', async (req, res) => {
  try {
    const {
      computer_number,
      title,
      description,
      category,
      priority = 'medium',
      contact_phone,
      contact_email,
      anonymous = false
    } = req.body;

    // Define valid categories for UNZA
    const validCategories = [
      'academics',           // Academic issues, course problems
      'facilities',          // Buildings, classrooms, equipment
      'accommodation',       // Hostels, housing issues
      'finances',           // Fees, payments, financial aid
      'missing_results',    // Missing grades, transcripts
      'registration',       // Course registration, enrollment
      'transport',          // Campus transport, shuttle services  
      'library',            // Library services, resources
      'cafeteria',          // Food services, dining
      'health_services',    // Campus clinic, medical
      'harassment',         // Harassment, discrimination
      'administrative',     // Admin services, documentation
      'internet_network',   // WiFi, network connectivity
      'disciplinary',       // Student conduct issues
      'sports_recreation',  // Sports facilities, activities
      'other'              // Miscellaneous complaints
    ];

    const validPriorities = ['low', 'medium', 'high', 'urgent'];

    // Validation
    if (!title || !description || !category) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and category are required',
        errors: {
          title: !title ? 'Title is required' : null,
          description: !description ? 'Description is required' : null,
          category: !category ? 'Category is required' : null
        }
      });
    }

    // Validate category
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category provided',
        valid_categories: validCategories
      });
    }

    // Validate priority
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority provided',
        valid_priorities: validPriorities
      });
    }

    if (!anonymous && !computer_number) {
      return res.status(400).json({
        success: false,
        message: 'Computer number is required for non-anonymous complaints'
      });
    }

    // Validate computer number format (UNZA format: 4 digits + 6 digits)
    if (!anonymous && computer_number) {
      const computerNumberRegex = /^\d{4}\d{6}$/; // e.g., 20191234567
      if (!computerNumberRegex.test(computer_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid computer number format. Expected format: YYYYNNNNNN (e.g., 2019123456)'
        });
      }
    }

    // Insert complaint into database
    const insertQuery = `
      INSERT INTO complaints (
        computer_number, title, description, category, priority, 
        contact_phone, contact_email, anonymous, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
    `;

    const [result] = await promisePool.query(insertQuery, [
      anonymous ? null : computer_number,
      title,
      description,
      category,
      priority,
      contact_phone || null,
      contact_email || null,
      anonymous ? 1 : 0
    ]);

    // Get the created complaint
    const [newComplaint] = await promisePool.query(
      'SELECT * FROM complaints WHERE complaint_id = ?',
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: {
        complaint_id: result.insertId,
        title: title,
        category: category,
        status: 'pending',
        created_at: new Date().toISOString(),
        anonymous: anonymous
      }
    });

  } catch (error) {
    console.error('Error creating complaint:', error);
    
    // Handle specific database errors
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        success: false,
        message: 'Database table not found. Please contact administrator.',
        error_code: 'TABLE_NOT_FOUND'
      });
    }
    
    if (error.code === 'ER_BAD_FIELD_ERROR') {
      return res.status(500).json({
        success: false,
        message: 'Database schema error. Please contact administrator.',
        error_code: 'SCHEMA_ERROR'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit complaint. Please try again.',
      error_code: 'INTERNAL_ERROR'
    });
  }
});

// GET /complaints - View all complaints
router.get('/', async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      computer_number,
      page = 1,
      limit = 10,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query;

    // Build WHERE clause dynamically
    let whereConditions = [];
    let queryParams = [];

    if (status) {
      whereConditions.push('status = ?');
      queryParams.push(status);
    }

    if (category) {
      whereConditions.push('category = ?');
      queryParams.push(category);
    }

    if (priority) {
      whereConditions.push('priority = ?');
      queryParams.push(priority);
    }

    if (computer_number) {
      whereConditions.push('computer_number = ?');
      queryParams.push(computer_number);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Validate sort parameters
    const validSortColumns = ['created_at', 'updated_at', 'priority', 'status', 'category'];
    const validSortOrders = ['ASC', 'DESC'];
    
    const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = validSortOrders.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

    // Calculate offset for pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*) as total FROM complaints ${whereClause}`;
    const [countResult] = await promisePool.query(countQuery, queryParams);
    const totalComplaints = countResult[0].total;

    // Get complaints with pagination
    const query = `
      SELECT 
        complaint_id,
        computer_number,
        title,
        description,
        category,
        priority,
        status,
        contact_phone,
        contact_email,
        anonymous,
        created_at,
        updated_at
      FROM complaints 
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);
    const [complaints] = await promisePool.query(query, queryParams);

    // Calculate pagination info
    const totalPages = Math.ceil(totalComplaints / parseInt(limit));

    res.json({
      success: true,
      data: complaints,
      pagination: {
        current_page: parseInt(page),
        total_pages: totalPages,
        total_complaints: totalComplaints,
        limit: parseInt(limit),
        has_next: parseInt(page) < totalPages,
        has_prev: parseInt(page) > 1
      },
      filters: {
        status,
        category,
        priority,
        computer_number
      }
    });

  } catch (error) {
    console.error('Error fetching complaints:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints. Please try again.',
      error_code: 'FETCH_ERROR'
    });
  }
});

// GET /complaints/:id - View single complaint
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID provided'
      });
    }

    const query = `
      SELECT 
        complaint_id,
        computer_number,
        title,
        description,
        category,
        priority,
        status,
        contact_phone,
        contact_email,
        anonymous,
        admin_response,
        admin_notes,
        created_at,
        updated_at,
        resolved_at
      FROM complaints 
      WHERE complaint_id = ?
    `;

    const [complaints] = await promisePool.query(query, [parseInt(id)]);

    if (complaints.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
        error_code: 'NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: complaints[0]
    });

  } catch (error) {
    console.error('Error fetching complaint:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint. Please try again.',
      error_code: 'FETCH_ERROR'
    });
  }
});

// PUT /complaints/:id - Update complaint status
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      admin_response,
      admin_notes,
      priority
    } = req.body;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid complaint ID provided'
      });
    }

    // Check if complaint exists
    const [existingComplaint] = await promisePool.query(
      'SELECT complaint_id, status FROM complaints WHERE complaint_id = ?',
      [parseInt(id)]
    );

    if (existingComplaint.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found',
        error_code: 'NOT_FOUND'
      });
    }

    // Validate status if provided
    const validStatuses = ['pending', 'in_progress', 'resolved', 'rejected', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    // Build update query dynamically
    let updateFields = [];
    let queryParams = [];

    if (status) {
      updateFields.push('status = ?');
      queryParams.push(status);
      
      // Set resolved_at if status is resolved
      if (status === 'resolved') {
        updateFields.push('resolved_at = NOW()');
      }
    }

    if (admin_response) {
      updateFields.push('admin_response = ?');
      queryParams.push(admin_response);
    }

    if (admin_notes) {
      updateFields.push('admin_notes = ?');
      queryParams.push(admin_notes);
    }

    if (priority) {
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority. Must be one of: ' + validPriorities.join(', ')
        });
      }
      updateFields.push('priority = ?');
      queryParams.push(priority);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided for update'
      });
    }

    // Add updated_at and complaint_id
    updateFields.push('updated_at = NOW()');
    queryParams.push(parseInt(id));

    const updateQuery = `
      UPDATE complaints 
      SET ${updateFields.join(', ')}
      WHERE complaint_id = ?
    `;

    await promisePool.query(updateQuery, queryParams);

    // Get updated complaint
    const [updatedComplaint] = await promisePool.query(
      'SELECT * FROM complaints WHERE complaint_id = ?',
      [parseInt(id)]
    );

    res.json({
      success: true,
      message: 'Complaint updated successfully',
      data: updatedComplaint[0]
    });

  } catch (error) {
    console.error('Error updating complaint:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to update complaint. Please try again.',
      error_code: 'UPDATE_ERROR'
    });
  }
});

// GET /complaints/categories - Get available complaint categories
router.get('/categories', (req, res) => {
  const categories = [
    {
      value: 'academics',
      label: 'Academic Issues',
      description: 'Course problems, teaching issues, academic misconduct'
    },
    {
      value: 'facilities',
      label: 'Facilities & Infrastructure',
      description: 'Buildings, classrooms, equipment, maintenance issues'
    },
    {
      value: 'accommodation',
      label: 'Accommodation',
      description: 'Hostel issues, housing problems, roommate conflicts'
    },
    {
      value: 'finances',
      label: 'Financial Issues',
      description: 'Fee payments, bursaries, financial aid, billing problems'
    },
    {
      value: 'missing_results',
      label: 'Missing Results',
      description: 'Missing grades, transcripts, exam results not published'
    },
    {
      value: 'registration',
      label: 'Registration',
      description: 'Course registration, enrollment issues, timetable conflicts'
    },
    {
      value: 'transport',
      label: 'Transport Services',
      description: 'Campus shuttle, transport delays, route issues'
    },
    {
      value: 'library',
      label: 'Library Services',
      description: 'Library resources, access issues, book availability'
    },
    {
      value: 'cafeteria',
      label: 'Food Services',
      description: 'Cafeteria, dining hall, food quality and service'
    },
    {
      value: 'health_services',
      label: 'Health Services',
      description: 'Campus clinic, medical services, health insurance'
    },
    {
      value: 'harassment',
      label: 'Harassment & Discrimination',
      description: 'Sexual harassment, discrimination, bullying, safety concerns'
    },
    {
      value: 'administrative',
      label: 'Administrative Services',
      description: 'Documentation, certificates, administrative delays'
    },
    {
      value: 'internet_network',
      label: 'Internet & Network',
      description: 'WiFi connectivity, network issues, computer lab problems'
    },
    {
      value: 'disciplinary',
      label: 'Disciplinary Issues',
      description: 'Student conduct, disciplinary actions, appeals'
    },
    {
      value: 'sports_recreation',
      label: 'Sports & Recreation',
      description: 'Sports facilities, recreational activities, gym access'
    },
    {
      value: 'other',
      label: 'Other',
      description: 'Issues not covered by other categories'
    }
  ];

  res.json({
    success: true,
    data: categories
  });
});

// GET /complaints/admin/stats - Get complaint statistics
router.get('/admin/stats', async (req, res) => {
  try {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_complaints,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END) as urgent,
        SUM(CASE WHEN anonymous = 1 THEN 1 ELSE 0 END) as anonymous,
        COUNT(DISTINCT category) as categories
      FROM complaints
    `;

    // Get category breakdown
    const categoryQuery = `
      SELECT 
        category,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_count
      FROM complaints 
      GROUP BY category 
      ORDER BY count DESC
    `;

    // Get recent trends (last 30 days)
    const trendsQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as daily_count
      FROM complaints 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    const [stats] = await promisePool.query(statsQuery);
    const [categoryStats] = await promisePool.query(categoryQuery);
    const [trends] = await promisePool.query(trendsQuery);

    res.json({
      success: true,
      data: {
        overview: stats[0],
        categories: categoryStats,
        trends: trends
      }
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics. Please try again.',
      error_code: 'STATS_ERROR'
    });
  }
});

export default router;