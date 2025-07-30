import mysql from 'mysql2';

const pool = mysql.createPool({
    host : "localhost",
    user : "root",
    password : "Jacob@2004",
    connectionLimit : 10,
    database : "school_complaint_system"
});

pool.query('select * from school_complaint_system.users', (err, res) => {
    return console.log(res)
});