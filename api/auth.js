// api/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_EXP = '2h';

// In-memory user store for development only
const users = new Map(); // email -> { passwordHash }

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXP });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host}`);
    if (pathname.endsWith('/signup') && req.method === 'POST') {
      const { email, password } = await req.json();
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });
      if (users.has(email)) return res.status(409).json({ error: 'user exists' });
      const hash = await bcrypt.hash(password, 10);
      users.set(email, { passwordHash: hash });
      const token = signToken({ email });
      return res.json({ ok: true, token, user: { email } });
    }

    if (pathname.endsWith('/login') && req.method === 'POST') {
      const { email, password } = await req.json();
      const u = users.get(email);
      if (!u) return res.status(401).json({ error: 'invalid credentials' });
      const match = await bcrypt.compare(password, u.passwordHash);
      if (!match) return res.status(401).json({ error: 'invalid credentials' });
      const token = signToken({ email });
      return res.json({ ok: true, token, user: { email } });
    }

    return res.status(404).json({ error: 'not found' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
}