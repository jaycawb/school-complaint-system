// backend/server.js
import express from 'express';
import mysql from 'mysql2/promise';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;

// Database connection
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "Jacob@2004",
  database: "school_complaint_system",
  waitForConnections: true,
  connectionLimit: 10
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// API Endpoint to handle form submission
app.post('/submit-complaint', async (req, res) => {
  try {
    const { computer_number, title, description, category } = req.body;
    
    const [result] = await pool.query(
      'INSERT INTO complaints (computer_number, title, description, category) VALUES (?, ?, ?, ?)',
      [computer_number, title, description, category]
    );
    
    res.send(`
      <h1>Complaint Submitted Successfully!</h1>
      <p>ID: ${result.insertId}</p>
      <a href="/">Submit another</a>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send(`
      <h1>Error</h1>
      <p>${err.message}</p>
      <a href="/">Try again</a>
    `);
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});