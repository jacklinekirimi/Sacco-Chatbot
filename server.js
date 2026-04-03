const bcrypt = require('bcryptjs');
const mysql = require('mysql2');
const express = require('express');
const cors = require('cors');
const path = require('path');
const webhookRoute = require('./routes/webhook');
const app = express();
const { GoogleAuth } = require('google-auth-library');
const auth = new GoogleAuth({
  keyFile: './dialogflow-key.json',
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
})



// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve all frontend files (HTML, JS, images, etc.)
app.use(express.static(__dirname)); // serves root files
app.use('/auth', express.static(path.join(__dirname, 'auth'))); // signup/login folder
app.use('/images', express.static(path.join(__dirname, 'images'))); // images folder
app.use('/js', express.static(path.join(__dirname, 'js'))); // optional if you have a js folder



// ===== DATABASE =====
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'kammy@2004', // your MySQL password
  database: 'amini_assist'
});

db.connect(err => {
  if (err) console.log('DB connection failed:', err);
  else console.log('Connected to MySQL database');
});

// ===== SIGNUP ROUTE =====
app.post('/signup', async (req, res) => {
  const { firstName, lastName, membershipNumber, email, password } = req.body;

  if (!firstName || !lastName || !membershipNumber || !email || !password)
    return res.status(400).json({ message: 'All fields are required' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = `
      INSERT INTO members 
      (first_name, last_name, membership_number, email, password)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(sql, [firstName, lastName, membershipNumber, email, hashedPassword], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') 
          return res.status(400).json({ message: 'Member already exists' });
        return res.status(500).json({ message: 'Database error' });
      }

      // Return user info for auto-login
      res.status(201).json({
        message: 'Signup successful',
        userId: result.insertId,
        firstName
      });
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ===== LOGIN ROUTE =====
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  const query = 'SELECT id, first_name, password, role FROM members WHERE email = ?';
  db.query(query, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (results.length === 0)
      return res.status(400).json({ message: 'Email not found' });

    const user = results[0];

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Incorrect password' });

    res.json({ userId: user.id, firstName: user.first_name, role: user.role });
  });
});

// ===== DIALOGFLOW WEBHOOK =====
app.use('/webhook', webhookRoute);

// ===== DIALOGFLOW ROUTE =====
app.post('/dialogflow', async (req, res) => {
  const { message, sessionId } = req.body;

  console.log('Message:', message);
  console.log('Session ID received:', sessionId);

  try {
    // Get access token from service account
    const client = await auth.getClient();
    const token = await client.getAccessToken();

    // Send message to Dialogflow
    const response = await fetch(
      `https://dialogflow.googleapis.com/v2/${sessionId}:detectIntent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token.token}`
        },
        body: JSON.stringify({
          queryInput: {
            text: {
              text: message,
              languageCode: 'en'
            }
          }
        })
      }
    );

    const data = await response.json();
    console.log('Dialogflow response:', JSON.stringify(data));

    if (data.queryResult) {
      res.json({ fulfillmentText: data.queryResult.fulfillmentText });
    } else {
      console.error('Unexpected Dialogflow response:', data);
      res.json({ fulfillmentText: "I'm sorry, I couldn't process that. Please try again." });
    }

  } catch (err) {
    console.error('Dialogflow route error:', err);
    res.status(500).json({ fulfillmentText: 'Sorry, something went wrong.' });
  }
});

// ===== ADMIN ROUTES =====

// Get dashboard stats
app.get('/admin/stats', (req, res) => {
  const stats = {};

  db.query('SELECT COUNT(*) as total FROM members WHERE role = "member"', (err, result) => {
    stats.totalMembers = result[0].total;

    db.query('SELECT COUNT(*) as total FROM loans WHERE status = "active"', (err, result) => {
      stats.totalLoans = result[0].total;

      db.query('SELECT SUM(savings_balance) as total FROM savings', (err, result) => {
        stats.totalSavings = result[0].total || 0;

        db.query('SELECT COUNT(*) as total FROM chat_logs', (err, result) => {
          stats.totalChats = result[0].total;
          res.json(stats);
        });
      });
    });
  });
});

// Get all members
app.get('/admin/members', (req, res) => {
  const query = `
    SELECT m.id, m.first_name, m.last_name, m.email, m.membership_number,
           m.status, m.created_at,
           s.savings_balance,
           l.outstanding_balance, l.status as loan_status
    FROM members m
    LEFT JOIN savings s ON m.id = s.member_id
    LEFT JOIN loans l ON m.id = l.member_id AND l.status = 'active'
    WHERE m.role = 'member'
    ORDER BY m.created_at DESC
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

// Get recent chat logs
app.get('/admin/chatlogs', (req, res) => {
  const query = `
    SELECT c.chat_id, c.intent_name, c.user_message, 
           c.bot_response, c.created_at,
           m.first_name, m.last_name
    FROM chat_logs c
    JOIN members m ON c.member_id = m.id
    ORDER BY c.created_at DESC
    LIMIT 50
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});
// Get all loans
app.get('/admin/loans', (req, res) => {
  const query = `
    SELECT 
      loans.*,
      members.first_name,
      members.last_name,
      members.membership_number,
      loan_types.loan_type_name AS loan_type_name
    FROM loans
    JOIN members ON loans.member_id = members.id
    JOIN loan_types ON loans.loan_type_id = loan_types.loan_type_id
    ORDER BY loans.created_at DESC
  `;

 db.query(query, (err, results) => {
  if (err) {
    console.error('🔥 Loans query error FULL:', err); // VERY IMPORTANT
    return res.status(500).json({ error: 'Failed to fetch loans' });
  }
  res.json(results);
});
});

// Get all loan types
app.get('/admin/loantypes', (req, res) => {
  db.query('SELECT * FROM loan_types', (err, results) => {
    if (err) {
      console.error('Loan types error:', err);
      return res.status(500).json({ error: 'Failed to fetch loan types' });
    }

    res.json(results);
  });
});

// Delete member
app.delete('/admin/members/:id', (req, res) => {
  db.query('DELETE FROM members WHERE id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Member deleted' });
  });
});

// Delete chat log
app.delete('/admin/chatlogs/:id', (req, res) => {
  db.query('DELETE FROM chat_logs WHERE chat_id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Chat log deleted' });
  });
});

// Get all loan types
app.get('/admin/loantypes', (req, res) => {
  db.query('SELECT * FROM loan_types ORDER BY loan_type_id', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});

// Add loan type
app.post('/admin/loantypes', (req, res) => {
  const { loan_type_name, interest_rate, max_amount, max_period_months } = req.body;
  db.query('INSERT INTO loan_types (loan_type_name, interest_rate, max_amount, max_period_months) VALUES (?, ?, ?, ?)',
    [loan_type_name, interest_rate, max_amount, max_period_months], (err, result) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Loan type added', id: result.insertId });
  });
});

// Update loan type
app.put('/admin/loantypes/:id', (req, res) => {
  const { loan_type_name, interest_rate, max_amount, max_period_months } = req.body;
  db.query('UPDATE loan_types SET loan_type_name=?, interest_rate=?, max_amount=?, max_period_months=? WHERE loan_type_id=?',
    [loan_type_name, interest_rate, max_amount, max_period_months, req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Loan type updated' });
  });
});

// Delete loan type
app.delete('/admin/loantypes/:id', (req, res) => {
  db.query('DELETE FROM loan_types WHERE loan_type_id = ?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Loan type deleted' });
  });
});

// ===== FALLBACK ROUTE =====
// If user visits any HTML page directly
app.get('/:page', (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, page);
  res.sendFile(filePath, err => {
    if (err) res.status(404).send('Page not found');
  });
});

// TEMPORARY - delete after use
app.get('/hashpassword', async (req, res) => {
  const hash = await bcrypt.hash('Test@1234', 10);
  res.send(hash);
});


// ===== START SERVER =====
const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
