// api/upload.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import formidable from 'formidable';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

export const config = {
  api: {
    bodyParser: false
  }
};

const JWT_SECRET = process.env.JWT_SECRET;
const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

function verifyTokenFromHeader(req) {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') throw new Error('missing token');
  return jwt.verify(parts[1], JWT_SECRET);
}

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ multiples: true, maxFileSize: 200 * 1024 * 1024 });
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Auth
    const payload = verifyTokenFromHeader(req);
    if (!payload || !payload.email) return res.status(401).json({ error: 'unauthorized' });

    // Parse multipart form
    const { files } = await parseForm(req);
    const fileList = Array.isArray(files.file) ? files.file : [files.file];

    const uploaded = [];
    for (const f of fileList) {
      if (!f) continue;
      const ext = (f.originalFilename || f.newFilename || '').split('.').pop();
      const key = `${payload.email}/${Date.now()}-${randomUUID()}.${ext || 'bin'}`;
      const fileStream = await fsReadFileAsBuffer(f.filepath || f.file);

      const cmd = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: fileStream,
        ContentType: f.mimetype || 'application/octet-stream',
        ACL: 'public-read'
      });
      await s3.send(cmd);
      const url = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
      uploaded.push({ filename: f.originalFilename || key, url, size: f.size });
    }

    return res.json({ ok: true, files: uploaded });
  } catch (err) {
    console.error(err);
    if (err.name === 'TokenExpiredError' || err.message === 'missing token') return res.status(401).json({ error: 'unauthorized' });
    return res.status(500).json({ error: 'upload failed', detail: err.message });
  }
}

// Helper to read file into Buffer in serverless environment
import fs from 'fs/promises';
async function fsReadFileAsBuffer(path) {
  return fs.readFile(path);
}