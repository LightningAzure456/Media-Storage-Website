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

async function api(path, opts = {}) {
  opts.headers = opts.headers || {};
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(path, opts);
  if (res.status === 401) {
    setToken(null);
    toggleUI();
    throw new Error('unauthorized');
  }
  return res.json();
}

btnSignUp.onclick = async () => {
  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) return alert('Email and password required');
  const res = await api('/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (res.token) setToken(res.token);
  toggleUI();
  await refreshFiles();
};

btnSignIn.onclick = async () => {
  const email = emailEl.value.trim();
  const password = passEl.value;
  if (!email || !password) return alert('Email and password required');
  const res = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (res.token) setToken(res.token);
  toggleUI();
  await refreshFiles();
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
}

btnUpload.onclick = async () => {
  const files = fileInput.files;
  if (!files.length) return alert('Pick files first');
  const fd = new FormData();
  for (const f of files) fd.append('file', f);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: fd, headers: { 'Authorization': 'Bearer ' + getToken() } });
    const data = await res.json();
    if (!data.ok) return alert('Upload failed');
    await refreshFiles();
  } catch (err) {
    alert('Upload error: ' + err.message);
  }
};

async function refreshFiles(){
  try {
    const res = await api('/api/files');
    filesList.innerHTML = '';
    if (!res.files || !res.files.length) { filesList.innerText = 'No files yet'; return; }
    for (const f of res.files) {
      const div = document.createElement('div');
      div.className = 'fileItem';
      const ext = f.filename.split('.').pop().toLowerCase();
      if (['mp4','webm','mov'].includes(ext)) {
        div.innerHTML = `<video width="240" controls src="${f.url}"></video><div>${f.filename}</div>`;
      } else {
        div.innerHTML = `<img src="${f.url}" width="240" alt="${f.filename}"/><div>${f.filename}</div>`;
      }
      filesList.appendChild(div);
    }
  } catch (err) {
    filesList.innerText = 'Could not load files';
  }
}

// Initialize UI on load
toggleUI();
if (getToken()) refreshFiles();