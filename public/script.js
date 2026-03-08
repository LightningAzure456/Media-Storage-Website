// public/script.js
// Replace BACKEND with your deployed backend URL (Vercel/Render/ngrok).
const BACKEND = 'https://your-backend.vercel.app'; // <-- REPLACE this with your backend URL

const emailEl = document.getElementById('email');
const passEl = document.getElementById('password');
const btnSignUp = document.getElementById('btnSignUp');
const btnSignIn = document.getElementById('btnSignIn');
const btnSignOut = document.getElementById('btnSignOut');
const uploader = document.getElementById('uploader');
const fileInput = document.getElementById('fileInput');
const btnUpload = document.getElementById('btnUpload');
const filesList = document.getElementById('filesList');

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { if (t) localStorage.setItem('token', t); else localStorage.removeItem('token'); }

async function safeJson(res) {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, raw: text, status: res.status }; }
}

// Generic API helper that prefixes BACKEND when a relative path is provided.
// It also injects Authorization header when a token exists.
async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  const url = path.startsWith('http') ? path : (BACKEND.replace(/\/$/, '') + path);
  const res = await fetch(url, opts);
  if (res.status === 401) {
    setToken(null);
    toggleUI();
    throw new Error('unauthorized');
  }
  return safeJson(res);
}

// Try multiple auth endpoint patterns for compatibility:
// 1) /api/auth/signup and /api/auth/login (serverless layout)
// 2) /api/signup and /api/login (monolithic Express)
async function authRequest(action, body) {
  const candidates = [
    `/api/auth/${action}`,
    `/api/${action}`
  ];
  for (const p of candidates) {
    try {
      const res = await api(p, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res && (res.token || res.ok)) return res;
    } catch (err) {
      if (err.message === 'unauthorized') throw err;
    }
  }
  throw new Error('Auth endpoints not reachable');
}

btnSignUp.onclick = async () => {
  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) return alert('Email and password required');
  try {
    const res = await authRequest('signup', { email, password });
    if (res.token) setToken(res.token);
    toggleUI();
    await refreshFiles();
  } catch (err) {
    alert('Sign up failed: ' + (err.message || JSON.stringify(err)));
  }
};

btnSignIn.onclick = async () => {
  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) return alert('Email and password required');
  try {
    const res = await authRequest('login', { email, password });
    if (res.token) setToken(res.token);
    toggleUI();
    await refreshFiles();
  } catch (err) {
    alert('Sign in failed: ' + (err.message || JSON.stringify(err)));
  }
};
btnSignOut.onclick = () => {
  setToken(null);
  toggleUI();
  filesList.innerHTML = '';
};

function toggleUI(){
  const signedIn = !!getToken();
  btnSignOut.hidden = !signedIn;
  uploader.hidden = !signedIn;
  btnSignIn.hidden = signedIn;
  btnSignUp.hidden = signedIn;
  emailEl.disabled = signedIn;
  passEl.disabled = signedIn;
}

function createProgressBar() {
  const wrap = document.createElement('div');
  wrap.className = 'uploadProgress';
  const bar = document.createElement('div');
  bar.className = 'uploadBar';
  bar.style.width = '0%';
  wrap.appendChild(bar);
  return { wrap, bar };
}

// Upload handler: sends files to BACKEND /api/upload (or /api/upload serverless)
btnUpload.onclick = async () => {
  const files = fileInput.files;
  if (!files.length) return alert('Pick files first');

  // If files are large (videos), consider using presigned uploads (not implemented here).
  const fd = new FormData();
  for (const f of files) fd.append('file', f);

  // Show a simple progress UI per upload using fetch with XHR fallback
  try {
    const res = await fetch(BACKEND.replace(/\/$/, '') + '/api/upload', {
      method: 'POST',
      body: fd,
      headers: { 'Authorization': 'Bearer ' + getToken() }
    });
    const data = await safeJson(res);
    if (!data || !data.ok) {
      const msg = data && data.error ? data.error : JSON.stringify(data);
      return alert('Upload failed: ' + msg);
    }
    await refreshFiles();
  } catch (err) {
    // Fallback to XHR to provide progress and better error messages
    try {
      await uploadWithXhr(fd);
      await refreshFiles();
    } catch (xhrErr) {
      alert('Upload error: ' + (xhrErr.message || xhrErr));
    }
  }
};

// XHR upload with progress (used as fallback or for progress UI)
function uploadWithXhr(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = BACKEND.replace(/\/$/, '') + '/api/upload';
    xhr.open('POST', url, true);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    const { wrap, bar } = createProgressBar();
    filesList.prepend(wrap);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      bar.style.width = pct + '%';
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
          wrap.remove();
          resolve(json);
        } else {
          wrap.remove();
          reject(new Error(json.error || `Upload failed (${xhr.status})`));
        }
      } catch (err) {
        wrap.remove();
        reject(err);
      }
    };

    xhr.onerror = () => {
      wrap.remove();
      reject(new Error('Network error during upload'));
    };

    xhr.send(formData);
  });
}

// Refresh file list from backend. Tries /api/files and /api/files-list variants.
async function refreshFiles(){
  try {
    const candidates = [
      '/api/files',
      '/api/list',
      '/api/uploads'
    ];
    let res = null;
    for (const p of candidates) {
      try {
        res = await api(p);
        if (res && res.files) break;
      } catch (e) {
        // continue trying other endpoints
      }
    }
    if (!res || !res.files) {
      filesList.innerText = 'No files yet';
      return;
    }

    filesList.innerHTML = '';
    for (const f of res.files) {
      const div = document.createElement('div');
      div.className = 'fileItem';
      const url = f.url || f.path || (f.filename ? (BACKEND.replace(/\/$/, '') + '/uploads/' + encodeURIComponent(f.filename)) : '');
      const filename = f.filename || f.name || url.split('/').pop();
      const ext = (filename.split('.').pop() || '').toLowerCase();

      if (['mp4','webm','mov'].includes(ext)) {
        div.innerHTML = `<video width="320" controls src="${url}"></video><div class="fname">${filename}</div>`;
      } else {
        div.innerHTML = `<img src="${url}" width="320" alt="${filename}"/><div class="fname">${filename}</div>`;
      }
      filesList.appendChild(div);
    }
  } catch (err) {
    filesList.innerText = 'Could not load files';
    console.error(err);
  }
}

// Initialize UI on load
toggleUI();
if (getToken()) refreshFiles();

// Optional: keyboard shortcuts for convenience (Enter to sign in)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (!getToken()) btnSignIn.click();
  }
});

/* Minimal CSS helpers (optional): move these to styles.css
.uploadProgress { width: 100%; background: #eee; height: 8px; margin: 8px 0; border-radius: 4px; overflow: hidden; }
.uploadBar { height: 100%; background: #2b8aef; width: 0%; transition: width 0.2s; }
.fileItem { margin: 12px 0; }
.fileItem img, .fileItem video { display: block; border-radius: 6px; margin-bottom: 6px; }
.fname { font-size: 13px; color: #333; }
*/