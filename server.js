const path = require('path');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Simple in-memory user store for dev only
const users = new Map(); // key: email, value: { passwordHash }

// Helpers
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Auth endpoints
app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (users.has(email)) return res.status(409).json({ error: 'user exists' });
  const hash = await bcrypt.hash(password, 10);
  users.set(email, { passwordHash: hash });
  const token = signToken({ email });
  res.json({ ok: true, token, user: { email } });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const u = users.get(email);
  if (!u) return res.status(401).json({ error: 'invalid credentials' });
  const match = await bcrypt.compare(password, u.passwordHash);
  if (!match) return res.status(401).json({ error: 'invalid credentials' });
  const token = signToken({ email });
  res.json({ ok: true, token, user: { email } });
});

// Auth middleware
function requireAuth(req, res, next) {
  const auth = req.header('authorization') || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'missing token' });
  try {
    const payload = verifyToken(parts[1]);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});
function fileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|gif|mp4|mov|webm/;
  const ok = allowed.test(file.mimetype) || allowed.test(file.originalname);
  if (!ok) return cb(new Error('Invalid file type'), false);
  cb(null, true);
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });

// Upload endpoint
app.post('/api/upload', requireAuth, upload.array('file', 10), (req, res) => {
  const files = req.files.map(f => ({ filename: f.filename, url: `/uploads/${f.filename}`, size: f.size }));
  res.json({ ok: true, files });
});

// List files endpoint
app.get('/api/files', requireAuth, (req, res) => {
  const all = fs.readdirSync(UPLOAD_DIR).map(name => {
    const stat = fs.statSync(path.join(UPLOAD_DIR, name));
    return { filename: name, url: `/uploads/${name}`, size: stat.size, uploadedAt: stat.mtime };
  });
  // Optionally filter by user in production
  res.json({ ok: true, files: all });
});

// Serve uploads and static front end
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));