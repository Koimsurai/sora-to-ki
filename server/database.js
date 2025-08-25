const sqlite3 = require('sqlite3').verbose();

// Connect to SQLite database. ':memory:' is an in-memory database.
// For persistence, specify a file path, e.g., 'db.sqlite'
const db = new sqlite3.Database('./db.sqlite', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});

// SQL statement to create a new 'posts' table
const createTableSql = `
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT,
    author TEXT,
    date TEXT NOT NULL
  );
`;

// Create the table
db.run(createTableSql, (err) => {
  if (err) {
    // Table already created
    return console.error(err.message);
  }
  console.log("Successfully created 'posts' table.");
});

module.exports = db;
