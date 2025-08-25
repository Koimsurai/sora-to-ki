require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database.js');

const app = express();
app.use(cors());
app.use(express.json()); // Middleware to parse JSON bodies

const PORT = process.env.PORT || 3001;

// --- Basic Auth Middleware ---
const auth = require('./auth'); 

// --- API Routes ---

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// GET all posts
app.get('/api/posts', (req, res) => {
  const sql = "SELECT * FROM posts ORDER BY date DESC";
  db.all(sql, [], (err, rows) => {
    if (err) {
      res.status(500).json({ "error": err.message });
      return;
    }
    res.json({
      "message": "success",
      "data": rows
    });
  });
});

// GET a single post by id
app.get('/api/posts/:id', (req, res) => {
  const sql = "SELECT * FROM posts WHERE id = ?";
  const params = [req.params.id];
  db.get(sql, params, (err, row) => {
    if (err) {
      res.status(400).json({ "error": err.message });
      return;
    }
    if (row) {
      res.json({
        "message": "success",
        "data": row
      });
    } else {
      res.status(404).json({ "message": "Post not found" });
    }
  });
});

// POST a new post
app.post('/api/posts', auth, (req, res) => {
  console.log('[POST /api/posts] Received request to create a new post.');
  console.log('[POST /api/posts] Body:', req.body);
  const { title, content, tags, author, date } = req.body;
  if (!title || !content || !date) {
    res.status(400).json({ "error": "Missing required fields: title, content, date" });
    return;
  }

  const sql = 'INSERT INTO posts (title, content, tags, author, date) VALUES (?, ?, ?, ?, ?)';
  const params = [title, content, JSON.stringify(tags), author, date];
  
  db.run(sql, params, function(err) {
    if (err) {
      console.error('[POST /api/posts] Database error:', err.message);
      res.status(400).json({ "error": err.message });
      return;
    }
    console.log(`[POST /api/posts] Successfully inserted post with ID: ${this.lastID}`);
    res.status(201).json({
      "message": "success",
      "data": { id: this.lastID, ...req.body }
    });
  });
});

// PUT (update) a post
app.put('/api/posts/:id', auth, (req, res) => {
    const { title, content, tags, author, date } = req.body;
    const sql = `
        UPDATE posts SET 
            title = COALESCE(?, title), 
            content = COALESCE(?, content), 
            tags = COALESCE(?, tags), 
            author = COALESCE(?, author), 
            date = COALESCE(?, date) 
        WHERE id = ?
    `;
    const params = [title, content, JSON.stringify(tags), author, date, req.params.id];

    db.run(sql, params, function(err) {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({"message": "Post not found"});
            return;
        }
        res.json({
            "message": "success",
            "changes": this.changes
        });
    });
});

// DELETE a post
app.delete('/api/posts/:id', auth, (req, res) => {
    const sql = 'DELETE FROM posts WHERE id = ?';
    db.run(sql, req.params.id, function(err) {
        if (err) {
            res.status(400).json({"error": err.message});
            return;
        }
        if (this.changes === 0) {
            res.status(404).json({"message": "Post not found"});
            return;
        }
        res.json({ "message": "deleted", "changes": this.changes });
    });
});


// Default response for any other request
app.use(function(req, res){
  res.status(404).send('Not Found');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
