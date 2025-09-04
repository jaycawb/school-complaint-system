// backend/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { promisePool, testConnection } from './config/db.js';

// Load environment variables
dotenv.config();

// Import routes (we'll create these next)
import authRoutes from './routes/auth.js';
import complaintRoutes from './routes/complaints.js';
import meetingRoutes from './routes/meetings.js';
import userRoutes from './routes/users.js';
import adminRoutes from './routes/admin.js';

// Import middleware
// import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:3000'] // Add your production frontend URL
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    const [result] = await promisePool.query('SELECT 1 as status');
    
    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: result[0].status === 1 ? 'Connected' : 'Disconnected',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'Service Unavailable',
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: error.message
    });
  }
});

// Welcome route for API
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to UNZA Complaint & Meeting System API',
    version: '1.0.0',
    documentation: '/api/docs',
    health: '/health',
    endpoints: {
      auth: '/api/auth',
      complaints: '/api/complaints',
      meetings: '/api/meetings',
      users: '/api/users',
      admin: '/api/admin'
    }
  });
});

// API Routes (uncomment as you create them)
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Test database route
app.get('/api/test-db', async (req, res) => {
  try {
    const [rows] = await promisePool.query('SHOW TABLES');
    res.json({
      success: true,
      message: 'Database connection successful',
      tables: rows.map(row => Object.values(row)[0])
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Database connection failed',
      error: error.message
    });
  }
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      '/',
      '/health',
      '/api/test-db'
    ]
  });
});

// Global error handler (uncomment when you create the middleware)
// app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\x1b[33m%s\x1b[0m', '⚠ SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('\x1b[32m%s\x1b[0m', '✓ Server closed successfully');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\x1b[33m%s\x1b[0m', '\n⚠ SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('\x1b[32m%s\x1b[0m', '✓ Server closed successfully');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(50));
  console.log('\x1b[32m%s\x1b[0m', `🚀 UNZA Complaint System Server Started`);
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(50));
  console.log(`   🌐 Server running on: http://localhost:${PORT}`);
  console.log(`   📊 Health check: http://localhost:${PORT}/health`);
  console.log(`   🔍 Database test: http://localhost:${PORT}/api/test-db`);
  console.log(`   📖 API docs: http://localhost:${PORT}/`);
  console.log(`   🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('\x1b[36m%s\x1b[0m', '='.repeat(50));
  
  // Test database connection on startup
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.log('\x1b[31m%s\x1b[0m', '❌ Server started but database connection failed!');
    console.log('\x1b[33m%s\x1b[0m', '⚠ Some features may not work properly');
  }
});

export default app;