require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

// ---------- DB config (works with plain env vars OR Elastic Beanstalk's RDS_* vars) ----------
const DB = {
  host: process.env.DB_HOST || process.env.RDS_HOSTNAME || 'localhost',
  port: Number(process.env.DB_PORT || process.env.RDS_PORT || 3306),
  user: process.env.DB_USER || process.env.RDS_USERNAME || 'root',
  password: process.env.DB_PASSWORD || process.env.RDS_PASSWORD || '',
  database: process.env.DB_NAME || process.env.RDS_DB_NAME || 'civicconnect'
};

const VALID_SECTORS = ['waste', 'disaster management', 'water', 'health', 'women',
  'education', 'child', 'orphans', 'disabled', 'other'];
const VALID_STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected'];

let pool;

// ---------- Uploads ----------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
      cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_'))
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed'))
});

// ---------- Middleware ----------
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const authenticateToken = (req, res, next) => {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token. Please login again.' });
    req.user = user;
    next();
  });
};

const clean = v => (typeof v === 'string' ? v.trim() : '');
const normEmail = v => clean(v).toLowerCase();
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const asyncRoute = fn => (req, res) =>
  fn(req, res).catch(err => {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  });

const mapComplaint = r => ({
  id: r.id,
  _id: r.id,
  name: r.name,
  email: r.email,
  contact: r.contact,
  department: r.department,
  subject: r.subject,
  ngoType: r.ngo_name,
  ngoId: r.ngo_id,
  description: r.description,
  attachment: r.attachment,
  status: r.status,
  remarks: r.remarks,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

// ---------- Routes ----------
app.get('/api/health', asyncRoute(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'OK', database: 'connected', message: 'CivicConnect API is running' });
}));

// ===== Citizens =====
app.post('/api/users/register', asyncRoute(async (req, res) => {
  const name = clean(req.body.name);
  const email = normEmail(req.body.email);
  const password = req.body.password || '';

  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) return res.status(400).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hash]);

  const token = jwt.sign({ id: result.insertId, email, role: 'Citizen' }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({
    message: 'User registered successfully',
    token,
    user: { id: result.insertId, name, email, role: 'Citizen' }
  });
}));

app.post('/api/users/login', asyncRoute(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = req.body.password || '';

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: 'Citizen' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: 'Citizen' }
  });
}));

// ===== NGOs =====
app.post('/api/ngo/register', asyncRoute(async (req, res) => {
  const orgName = clean(req.body.orgName);
  const email = normEmail(req.body.email);
  const password = req.body.password || '';
  const sector = clean(req.body.sector);
  const phone = clean(req.body.phone);
  const address = clean(req.body.address);

  if (!orgName || !email || !password || !sector || !phone || !address) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!isEmail(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!VALID_SECTORS.includes(sector)) return res.status(400).json({ error: 'Invalid sector' });

  const [existing] = await pool.query('SELECT id FROM ngos WHERE email = ?', [email]);
  if (existing.length) return res.status(400).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const [result] = await pool.query(
    'INSERT INTO ngos (org_name, email, password, sector, phone, address) VALUES (?, ?, ?, ?, ?, ?)',
    [orgName, email, hash, sector, phone, address]
  );

  const token = jwt.sign({ id: result.insertId, email, role: 'NGO', sector }, JWT_SECRET, { expiresIn: '7d' });
  res.status(201).json({
    message: 'NGO registered successfully',
    token,
    ngo: { id: result.insertId, orgName, email, sector, role: 'NGO' }
  });
}));

app.post('/api/ngo/login', asyncRoute(async (req, res) => {
  const email = normEmail(req.body.email);
  const password = req.body.password || '';

  const [rows] = await pool.query('SELECT * FROM ngos WHERE email = ?', [email]);
  const ngo = rows[0];
  if (!ngo || !(await bcrypt.compare(password, ngo.password))) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: ngo.id, email: ngo.email, role: 'NGO', sector: ngo.sector }, JWT_SECRET, { expiresIn: '7d' });
  res.json({
    message: 'Login successful',
    token,
    ngo: { id: ngo.id, orgName: ngo.org_name, email: ngo.email, sector: ngo.sector, role: 'NGO' }
  });
}));

// NGOs of a department (public - used by the complaint form dropdown)
app.get('/api/ngos', asyncRoute(async (req, res) => {
  const department = clean(req.query.department);
  if (!department) return res.status(400).json({ error: 'Department parameter is required' });

  const [rows] = await pool.query(
    'SELECT id, org_name, email, sector FROM ngos WHERE sector = ? ORDER BY org_name', [department]
  );
  res.json(rows.map(n => ({ _id: n.id, id: n.id, name: n.org_name, email: n.email, sector: n.sector })));
}));

// ===== Complaints =====
app.post('/api/complaints', authenticateToken, upload.single('attachment'), asyncRoute(async (req, res) => {
  if (req.user.role !== 'Citizen') return res.status(403).json({ error: 'Only citizens can submit complaints' });

  const name = clean(req.body.name);
  const email = normEmail(req.body.email);
  const contact = clean(req.body.contact);
  const department = clean(req.body.department);
  const subject = clean(req.body.subject);
  const description = clean(req.body.description);
  const ngoId = Number(req.body.ngoType || req.body.ngoId);

  if (!name || !email || !contact || !department || !subject || !description || !ngoId) {
    return res.status(400).json({ error: 'All fields (including NGO) are required' });
  }

  const [ngos] = await pool.query('SELECT id, org_name FROM ngos WHERE id = ? AND sector = ?', [ngoId, department]);
  if (!ngos.length) return res.status(400).json({ error: 'Selected NGO does not belong to this department' });

  const attachment = req.file ? `/uploads/${req.file.filename}` : null;

  const [result] = await pool.query(
    `INSERT INTO complaints
      (user_id, ngo_id, name, email, contact, department, subject, ngo_name, description, attachment, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
    [req.user.id, ngos[0].id, name, email, contact, department, subject, ngos[0].org_name, description, attachment]
  );

  const [rows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [result.insertId]);
  res.status(201).json({ message: 'Complaint submitted successfully', complaint: mapComplaint(rows[0]) });
}));

// Citizen: own complaints
app.get('/api/complaints/user', authenticateToken, asyncRoute(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM complaints WHERE user_id = ? ORDER BY created_at DESC, id DESC', [req.user.id]);
  res.json(rows.map(mapComplaint));
}));

// NGO: complaints addressed to this NGO
app.get('/api/complaints/ngo', authenticateToken, asyncRoute(async (req, res) => {
  if (req.user.role !== 'NGO') return res.status(403).json({ error: 'Access denied' });
  const [rows] = await pool.query('SELECT * FROM complaints WHERE ngo_id = ? ORDER BY created_at DESC, id DESC', [req.user.id]);
  res.json(rows.map(mapComplaint));
}));

// Statistics
app.get('/api/statistics', authenticateToken, asyncRoute(async (req, res) => {
  const col = req.user.role === 'NGO' ? 'ngo_id' : 'user_id';
  const [rows] = await pool.query(`SELECT status, COUNT(*) AS c FROM complaints WHERE ${col} = ? GROUP BY status`, [req.user.id]);
  const count = s => (rows.find(r => r.status === s) || { c: 0 }).c;
  const total = rows.reduce((a, r) => a + r.c, 0);
  res.json({ total, pending: count('Pending'), inProgress: count('In Progress'), resolved: count('Resolved'), rejected: count('Rejected') });
}));

// Single complaint
app.get('/api/complaints/:id', authenticateToken, asyncRoute(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
  const c = rows[0];
  if (!c) return res.status(404).json({ error: 'Complaint not found' });

  const allowed = (req.user.role === 'Citizen' && c.user_id === req.user.id) ||
                  (req.user.role === 'NGO' && c.ngo_id === req.user.id);
  if (!allowed) return res.status(403).json({ error: 'Access denied' });
  res.json(mapComplaint(c));
}));

// Update status (NGO that owns the complaint)
app.patch('/api/complaints/:id', authenticateToken, asyncRoute(async (req, res) => {
  if (req.user.role !== 'NGO') return res.status(403).json({ error: 'Only NGOs can update complaint status' });

  const status = clean(req.body.status);
  const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : null;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status must be one of: ' + VALID_STATUSES.join(', ') });
  }

  const [result] = await pool.query(
    'UPDATE complaints SET status = ?, remarks = ? WHERE id = ? AND ngo_id = ?',
    [status, remarks, req.params.id, req.user.id]
  );
  if (!result.affectedRows) return res.status(404).json({ error: 'Complaint not found for this NGO' });

  const [rows] = await pool.query('SELECT * FROM complaints WHERE id = ?', [req.params.id]);
  res.json({ message: 'Complaint updated successfully', complaint: mapComplaint(rows[0]) });
}));

// Unknown API route / upload errors
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found' }));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message });
});

// ---------- DB init ----------
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS ngos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    org_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    sector VARCHAR(60) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    address VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ngo_id INT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    contact VARCHAR(30) NOT NULL,
    department VARCHAR(60) NOT NULL,
    subject VARCHAR(200) NOT NULL,
    ngo_name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    attachment VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    remarks TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ngo_id) REFERENCES ngos(id) ON DELETE SET NULL
  )`
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function initDb() {
  // Try to create the database first (ignored if the user lacks the privilege or it already exists)
  try {
    const conn = await mysql.createConnection({ host: DB.host, port: DB.port, user: DB.user, password: DB.password });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB.database}\``);
    await conn.end();
  } catch (e) {
    console.warn('Could not run CREATE DATABASE (continuing):', e.message);
  }

  pool = mysql.createPool({ ...DB, waitForConnections: true, connectionLimit: 10 });
  await pool.query('SELECT 1');
  for (const sql of SCHEMA) await pool.query(sql);
  console.log(`MySQL connected: ${DB.user}@${DB.host}:${DB.port}/${DB.database}`);
}

(async () => {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await initDb();
      break;
    } catch (err) {
      console.error(`DB connection failed (attempt ${attempt}/10): ${err.message}`);
      if (attempt === 10) process.exit(1);
      await sleep(3000);
    }
  }
  app.listen(PORT, () => console.log(`CivicConnect running on port ${PORT}`));
})();
