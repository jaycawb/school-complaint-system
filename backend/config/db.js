// backend/config/db.js
import mysql from 'mysql2';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "Jacob@2004",
  database: process.env.DB_NAME || "school_complaint_system",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 5000 // 5-second timeout
};

const pool = mysql.createPool(dbConfig);
export const promisePool = pool.promise();

// Connection test with retries and timeout
export const testConnection = async (maxRetries = 3, retryDelay = 2000) => {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      const [rows] = await Promise.race([
        promisePool.query('SELECT 1 + 1 AS result'),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), dbConfig.connectTimeout)
      )]);
      
      console.log('\x1b[32m%s\x1b[0m', `✓ Database connection successful!`); // Green
      console.log(`   Server response: ${rows[0].result}`);
      console.log(`   Database: ${dbConfig.database}`);
      console.log(`   User: ${dbConfig.user}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   Connection pool status:`);
      console.log(`   - Active connections: ${pool._freeConnections.length}`);
      console.log(`   - Total connections: ${pool._allConnections.length}`);
      
      return true;
    } catch (err) {
      retryCount++;
      
      if (retryCount < maxRetries) {
        console.log('\x1b[33m%s\x1b[0m', `⚠ Attempt ${retryCount} failed. Retrying in ${retryDelay/1000}s...`); // Yellow
        console.log(`   Error: ${err.message}`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        console.log('\x1b[31m%s\x1b[0m', `✗ Database connection failed after ${maxRetries} attempts:`); // Red
        console.log(`   Last error: ${err.message}`);
        console.log(`   Check your credentials and ensure MySQL is running`);
        
        // Error diagnostics
        if (err.code) console.log(`   Error code: ${err.code}`);
        if (err.errno) console.log(`   Error number: ${err.errno}`);
        if (err.sqlState) console.log(`   SQL State: ${err.sqlState}`);
        
        return false;
      }
    }
  }
};

// Auto-test when imported (except in test environment)
(async () => {
  if (process.env.NODE_ENV !== 'test') {
    await testConnection();
  }
})();

export default pool;