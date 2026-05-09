// ═══════════════════════════════════════
//   TECHNIFIND — ALL-IN-ONE APP
// ═══════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── FIREBASE INIT ───
const firebaseConfig = {
  apiKey: "AIzaSyAvklqFtqPJTF0YEILBxNIsOP2eZlhYc9w",
  authDomain: "technifind-2266d.firebaseapp.com",
  projectId: "technifind-2266d",
  storageBucket: "technifind-2266d.firebasestorage.app",
  messagingSenderId: "684030071009",
  appId: "1:684030071009:web:3cbfaccb8cfad042fb67a0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── STATE ───
let currentUser = null;
let currentUserData = null;
let userLat = null;
let userLng = null;
let allTechnicians = [];
let currentTechId = null;
let detailMap = null;
let currentFilter = '';
let selectedRole = 'user';

// ─── UTILS ───
function toast(msg, duration = 3500) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + id);
  if (el) el.classList.add('active');
  else console.error('Screen not found: screen-' + id);
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function etaMinutes(distKm) {
  return Math.round((distKm / 30) * 60);
}

function buildWaLink(phone, techName, userName, schoolName) {
  const clean = phone.replace(/[^0-9]/g, '').replace(/^0/, '62');
  const msg = encodeURIComponent(
    `Halo ${techName}, saya ${userName} dari ${schoolName || 'sekolah kami'}.\n\nKami menemukan Anda melalui TechniFind dan membutuhkan bantuan teknis untuk masalah internet.\n\nApakah Anda tersedia untuk membantu kami sekarang? 🙏`
  );
  return `https://wa.me/${clean}?text=${msg}`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'Email tidak ditemukan. Coba daftar dulu.',
    'auth/wrong-password': 'Password salah.',
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/email-already-in-use': 'Email sudah terdaftar.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/weak-password': 'Password minimal 6 karakter.',
    'auth/popup-closed-by-user': 'Login Google dibatalkan.',
    'auth/popup-blocked': 'Izinkan popup di browser kamu.',
    'auth/operation-not-allowed': 'Metode login belum diaktifkan di Firebase.',
    'auth/network-request-failed': 'Tidak ada koneksi internet.',
  };
  return map[code] || `Error: ${code}`;
}

// ─── AUTH FUNCTIONS ───
window.switchAuthTab = function(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`.tab-btn[onclick="switchAuthTab('${tab}')"]`).classList.add('active');
  document.getElementById('auth-' + tab).classList.add('active');
};

window.selectRole = function(role) {
  selectedRole = role;
  document.getElementById('role-user').classList.toggle('active', role === 'user');
  document.getElementById('role-tech').classList.toggle('active', role === 'tech');
  document.getElementById('field-speciality').style.display = role === 'tech' ? 'flex' : 'none';
};

window.loginUser = async function() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) return toast('⚠️ Isi email dan password terlebih dahulu.');
  toast('⏳ Sedang masuk...');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    toast('❌ ' + friendlyError(e.code));
  }
};

window.loginGoogle = async function() {
  toast('⏳ Membuka Google login...');
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  } catch (e) {
    toast('❌ ' + friendlyError(e.code));
  }
};

window.registerUser = async function() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const wa   = document.getElementById('reg-wa').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const spec = document.getElementById('reg-spec').value;

  if (!name || !email || !wa || !pass) return toast('⚠️ Lengkapi semua data.');
  if (selectedRole === 'tech' && !spec) return toast('⚠️ Pilih keahlian teknisi.');
  if (pass.length < 6) return toast('⚠️ Password minimal 6 karakter.');
  toast('⏳ Membuat akun...');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const data = { name, email, whatsapp: wa, role: selectedRole, createdAt: serverTimestamp() };
    if (selectedRole === 'tech') Object.assign(data, { speciality: spec, isOnline: false, rating: 0, jobsCompleted: 0, lat: null, lng: null });
    await setDoc(doc(db, 'users', cred.user.uid), data);
    toast('✅ Akun berhasil dibuat!');
  } catch (e) {
    toast('❌ ' + friendlyError(e.code));
  }
};

window.logout = async function() {
  await signOut(auth);
  currentUser = null; currentUserData = null;
  showScreen('auth');
};

// ─── AUTH STATE LISTENER (runs after login/register) ───
onAuthStateChanged(auth, async (user) => {
  console.log('Auth state changed:', user ? user.email : 'logged out');
  if (user) {
    currentUser = user;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        currentUserData = snap.data();
      } else {
        // First time Google login - create profile
        currentUserData = { name: user.displayName || user.email, email: user.email, role: 'user', whatsapp: '' };
        await setDoc(doc(db, 'users', user.uid), { ...currentUserData, createdAt: serverTimestamp() });
      }
      console.log('User role:', currentUserData.role);
      if (currentUserData.role === 'tech') {
        initTechDashboard();
      } else {
        initUserHome();
      }
    } catch(e) {
      console.error('Error loading user:', e);
      toast('❌ Gagal memuat profil: ' + e.message);
    }
  } else {
    showScreen('auth');
  }
});

// ─── LOCATION ───
window.detectLocation = function() {
  const el = document.getElementById('location-text');
  if (!el) return;
  el.textContent = 'Mendeteksi lokasi...';
  if (!navigator.geolocation) { setDefaultLocation(); return; }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`);
        const d = await r.json();
        el.textContent = d.address?.suburb || d.address?.village || d.address?.city || 'Lokasi Anda';
      } catch { el.textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`; }
      loadNearbyTechs();
    },
    () => { setDefaultLocation(); loadNearbyTechs(); },
    { timeout: 8000 }
  );
};

function setDefaultLocation() {
  userLat = -6.8924; userLng = 109.3753;
  const el = document.getElementById('location-text');
  if (el) el.textContent = 'Pemalang, Jawa Tengah';
}

// ─── USER HOME ───
function initUserHome() {
  console.log('Showing home screen');
  showScreen('home');
  const greet = document.getElementById('home-greeting');
  if (greet) greet.textContent = 'Halo, ' + (currentUserData?.name?.split(' ')[0] || 'Pengguna') + ' 👋';
  const pb = document.getElementById('profile-back');
  if (pb) pb.onclick = goHome;
  detectLocation();
}

// ─── LOAD TECHNICIANS ───
async function loadNearbyTechs() {
  allTechnicians = [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'tech')));
    snap.forEach(docSnap => {
      const d = docSnap.data();
      let dist = null, eta = null;
      if (d.lat && d.lng && userLat && userLng) {
        dist = haversine(userLat, userLng, d.lat, d.lng);
        eta = etaMinutes(dist);
      }
      allTechnicians.push({ id: docSnap.id, ...d, dist, eta });
    });
    allTechnicians.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      if (a.dist !== null && b.dist !== null) return a.dist - b.dist;
      return 0;
    });
    const online = allTechnicians.filter(t => t.isOnline).length;
    const statOnline = document.getElementById('stat-online');
    const statEta = document.getElementById('stat-eta');
    if (statOnline) statOnline.textContent = online;
    const etas = allTechnicians.filter(t => t.eta !== null).map(t => t.eta);
    if (statEta) statEta.textContent = etas.length ? Math.round(etas.reduce((a,b)=>a+b,0)/etas.length) : '—';
    renderNearbyList(allTechnicians.slice(0, 3));
  } catch(e) {
    console.error('loadNearbyTechs error:', e);
  }
}

function techCardHTML(t) {
  const dotClass = t.isOnline ? 'dot-green' : 'dot-gray';
  return `<div class="tech-card" onclick="goDetail('${t.id}')">
    <div class="tc-avatar">🔧<div class="tc-dot ${dotClass}"></div></div>
    <div class="tc-info">
      <div class="tc-name">${escHtml(t.name)}</div>
      <div class="tc-spec">${escHtml(t.speciality || 'Teknisi Internet')}</div>
      <div class="tc-badges">
        <span class="badge ${t.isOnline?'green':'gray'}">${t.isOnline?'● Online':'● Offline'}</span>
        ${t.dist !== null ? `<span class="badge blue">📍 ${t.dist.toFixed(1)} km</span>` : ''}
        ${t.eta !== null ? `<span class="badge blue">⚡ ~${t.eta} mnt</span>` : ''}
      </div>
    </div>
    <div class="tc-right">
      <div class="tc-rating">${t.rating > 0 ? '★'.repeat(Math.round(t.rating)) : '—'}</div>
      <div class="tc-jobs">${t.jobsCompleted || 0} selesai</div>
      ${t.dist !== null ? `<div class="tc-dist">${t.dist.toFixed(1)} km</div>` : ''}
    </div>
  </div>`;
}

function renderNearbyList(techs) {
  const el = document.getElementById('nearby-list');
  if (!el) return;
  el.innerHTML = techs.length
    ? techs.map(t => techCardHTML(t)).join('')
    : `<div class="empty-state"><p>Belum ada teknisi terdaftar.<br><small>Ajak teknisi internet di daerah kamu untuk daftar!</small></p></div>`;
}

// ─── NAVIGATION ───
window.goHome = function() {
  if (currentUserData?.role === 'tech') { initTechDashboard(); return; }
  showScreen('home');
};
window.goSearch = function(mode) {
  showScreen('search');
  document.getElementById('search-input').value = '';
  renderSearchResults(allTechnicians, '');
  if (mode === 'darurat') toast('🚨 Mode Darurat aktif!');
};
window.goHistory = function() { showScreen('history'); loadHistory(); };
window.goProfile = function() {
  showScreen('profile');
  const pn = document.getElementById('profile-name');
  const pr = document.getElementById('profile-role');
  if (pn) pn.textContent = currentUserData?.name || '—';
  if (pr) pr.textContent = currentUserData?.role === 'tech' ? '🔧 Teknisi Internet' : '👩‍🏫 Guru / Staff Sekolah';
};

// ─── SEARCH ───
window.filterSearch = function(val) { renderSearchResults(allTechnicians, val, currentFilter); };
window.chipFilter = function(el, filter) {
  currentFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderSearchResults(allTechnicians, document.getElementById('search-input').value, filter);
};
function renderSearchResults(techs, search = '', filter = '') {
  const el = document.getElementById('search-list');
  const loading = document.getElementById('search-loading');
  if (loading) loading.style.display = 'none';
  let filtered = [...techs];
  if (filter === 'online') filtered = filtered.filter(t => t.isOnline);
  else if (filter) filtered = filtered.filter(t => (t.speciality||'').toLowerCase().includes(filter.toLowerCase()));
  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(t => t.name.toLowerCase().includes(s) || (t.speciality||'').toLowerCase().includes(s));
  }
  el.innerHTML = filtered.length ? filtered.map(t => techCardHTML(t)).join('') : `<div class="empty-state"><p>Tidak ada teknisi ditemukan.</p></div>`;
}

// ─── DETAIL ───
window.goDetail = async function(techId) {
  currentTechId = techId;
  const tech = allTechnicians.find(t => t.id === techId);
  if (!tech) return;
  document.getElementById('detail-back-btn').onclick = () => showScreen('search');
  document.getElementById('d-name').textContent = tech.name;
  document.getElementById('d-spec').textContent = tech.speciality || 'Teknisi Internet';
  document.getElementById('d-status-badge').textContent = tech.isOnline ? '● Online' : '● Offline';
  document.getElementById('d-status-badge').className = 'badge ' + (tech.isOnline ? 'green' : 'gray');
  document.getElementById('d-eta-badge').textContent = tech.eta ? `⚡ ~${tech.eta} mnt` : '⚡ —';
  document.getElementById('d-dist-badge').textContent = tech.dist ? `📍 ${tech.dist.toFixed(1)} km` : '📍 —';
  document.getElementById('d-rating').textContent = tech.rating > 0 ? tech.rating.toFixed(1) + ' ★' : '—';
  document.getElementById('d-jobs').textContent = tech.jobsCompleted || 0;
  document.getElementById('d-dist2').textContent = tech.dist ? tech.dist.toFixed(1) + ' km' : '—';
  const btnWa = document.getElementById('btn-wa');
  if (tech.whatsapp) {
    btnWa.disabled = false; btnWa.style.opacity = '1';
    btnWa.onclick = () => window.open(buildWaLink(tech.whatsapp, tech.name, currentUserData?.name || 'Pengguna', ''), '_blank');
  } else {
    btnWa.disabled = true; btnWa.style.opacity = '0.4';
    btnWa.onclick = () => toast('⚠️ Teknisi belum mengisi nomor WhatsApp.');
  }
  showScreen('detail');
  setTimeout(() => {
    if (detailMap) { detailMap.remove(); detailMap = null; }
    const centerLat = userLat || -6.8924, centerLng = userLng || 109.3753;
    detailMap = L.map('detail-map').setView([centerLat, centerLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(detailMap);
    if (userLat && userLng) {
      L.marker([userLat, userLng], { icon: L.divIcon({ html: `<div style="background:#ef4444;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white">🏫</div>`, iconSize:[30,30], iconAnchor:[15,15], className:'' }) }).addTo(detailMap).bindPopup('Lokasi Anda');
    }
    if (tech.lat && tech.lng) {
      L.marker([tech.lat, tech.lng], { icon: L.divIcon({ html: `<div style="background:#0ea874;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid white">🔧</div>`, iconSize:[34,34], iconAnchor:[17,17], className:'' }) }).addTo(detailMap).bindPopup(`<b>${tech.name}</b>`).openPopup();
      if (userLat && userLng) detailMap.fitBounds([[userLat,userLng],[tech.lat,tech.lng]], { padding:[40,40] });
    }
  }, 200);
  loadReviews(techId);
};

async function loadReviews(techId) {
  const el = document.getElementById('reviews-list');
  try {
    const snap = await getDocs(query(collection(db, 'reviews'), where('techId', '==', techId)));
    el.innerHTML = snap.empty ? '<p class="muted-text">Belum ada ulasan.</p>'
      : snap.docs.map(d => {
          const r = d.data();
          return `<div class="review-card"><div class="rv-head"><span class="rv-name">${escHtml(r.userName)}</span><span class="rv-stars">${'★'.repeat(r.rating||0)}</span></div><div class="rv-text">${escHtml(r.text)}</div></div>`;
        }).join('');
  } catch { el.innerHTML = '<p class="muted-text">Belum ada ulasan.</p>'; }
}

// ─── REPORT ───
window.openReport = () => document.getElementById('report-modal').classList.add('open');
window.closeReport = () => document.getElementById('report-modal').classList.remove('open');
window.submitReport = async function() {
  const type = document.getElementById('rep-type').value;
  const desc = document.getElementById('rep-desc').value.trim();
  const priority = document.querySelector('input[name="priority"]:checked').value;
  if (!currentTechId) return toast('⚠️ Pilih teknisi terlebih dahulu.');
  try {
    await addDoc(collection(db, 'reports'), {
      userId: currentUser.uid, userName: currentUserData?.name || 'Pengguna',
      userWhatsapp: currentUserData?.whatsapp || '', techId: currentTechId,
      type, description: desc, priority, status: 'pending', createdAt: serverTimestamp()
    });
    closeReport(); toast('✅ Laporan berhasil dikirim!');
    document.getElementById('rep-desc').value = '';
  } catch(e) { toast('❌ Gagal mengirim: ' + e.message); }
};

// ─── HISTORY ───
async function loadHistory() {
  const el = document.getElementById('history-list');
  try {
    const snap = await getDocs(query(collection(db, 'reports'), where('userId', '==', currentUser.uid)));
    if (snap.empty) { el.innerHTML = `<div class="empty-state"><p>Belum ada laporan.</p></div>`; return; }
    const docs = snap.docs.sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0));
    el.innerHTML = docs.map(d => {
      const r = d.data(), isDone = r.status === 'resolved';
      const date = r.createdAt?.toDate?.()?.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) || '—';
      return `<div class="history-card"><div class="hc-icon ${isDone?'done':'pending'}">${isDone?'✅':'⏳'}</div><div><div class="hc-title">${escHtml(r.type)}</div><div class="hc-meta">${date} · ${r.priority==='urgent'?'🚨 Darurat':'Normal'}</div></div><div class="hc-status"><span class="badge ${isDone?'green':'orange'}">${isDone?'Selesai':'Proses'}</span></div></div>`;
    }).join('');
  } catch(e) { el.innerHTML = `<div class="empty-state"><p>Gagal memuat riwayat.</p></div>`; }
}

// ─── TECH DASHBOARD ───
function initTechDashboard() {
  showScreen('tech-dashboard');
  const tg = document.getElementById('tech-greeting');
  const tr = document.getElementById('tech-rating-display');
  const tj = document.getElementById('tech-jobs-display');
  const ot = document.getElementById('online-toggle');
  if (tg) tg.textContent = 'Halo, ' + (currentUserData?.name?.split(' ')[0] || 'Teknisi') + '!';
  if (tr) tr.textContent = currentUserData?.rating > 0 ? currentUserData.rating.toFixed(1) + ' ★' : 'Belum ada';
  if (tj) tj.textContent = currentUserData?.jobsCompleted || 0;
  if (ot) ot.checked = currentUserData?.isOnline || false;
  updateOnlineSubtext(currentUserData?.isOnline || false);
  loadIncomingReports();
}

window.toggleOnlineStatus = async function(isOnline) {
  if (!currentUser) return;
  try {
    let locUpdate = {};
    if (isOnline && navigator.geolocation) {
      await new Promise(resolve => navigator.geolocation.getCurrentPosition(
        pos => { locUpdate = { lat: pos.coords.latitude, lng: pos.coords.longitude }; resolve(); },
        resolve, { timeout: 5000 }
      ));
    }
    await updateDoc(doc(db, 'users', currentUser.uid), { isOnline, ...locUpdate });
    if (currentUserData) currentUserData.isOnline = isOnline;
    updateOnlineSubtext(isOnline);
    toast(isOnline ? '🟢 Anda sekarang Online!' : '⚫ Anda sekarang Offline');
  } catch(e) { toast('❌ Gagal mengubah status.'); }
};

function updateOnlineSubtext(isOnline) {
  const el = document.getElementById('ot-sub-text');
  if (el) el.innerHTML = `Anda saat ini <strong style="color:${isOnline?'#0ea874':'#6b7280'}">${isOnline?'Online':'Offline'}</strong>`;
}

async function loadIncomingReports() {
  const el = document.getElementById('incoming-reports');
  if (!currentUser || !el) return;
  try {
    const q = query(collection(db, 'reports'), where('techId', '==', currentUser.uid), where('status', '==', 'pending'));
    onSnapshot(q, snap => {
      if (snap.empty) { el.innerHTML = `<div class="empty-state"><p>Tidak ada laporan masuk.<br><small>Pastikan status Anda Online.</small></p></div>`; return; }
      el.innerHTML = snap.docs.map(d => {
        const r = d.data();
        return `<div class="incoming-card"><div class="ic-head"><div><div class="ic-type">${escHtml(r.type)}</div><div class="ic-meta">Dari: ${escHtml(r.userName)}</div>${r.description?`<div class="ic-meta">${escHtml(r.description.slice(0,80))}</div>`:''}</div>${r.priority==='urgent'?`<span class="badge red">🚨 Darurat</span>`:''}</div><button class="btn-accept" onclick="acceptReport('${d.id}')">✅ Terima & Hubungi via WhatsApp</button></div>`;
      }).join('');
    });
  } catch(e) { if (el) el.innerHTML = `<div class="empty-state"><p>Gagal memuat laporan.</p></div>`; }
}

window.acceptReport = async function(reportId) {
  try {
    const repSnap = await getDoc(doc(db, 'reports', reportId));
    const r = repSnap.data();
    await updateDoc(doc(db, 'reports', reportId), { status: 'accepted' });
    if (r.userWhatsapp) {
      const clean = r.userWhatsapp.replace(/[^0-9]/g,'').replace(/^0/,'62');
      const msg = encodeURIComponent(`Halo ${r.userName}, saya ${currentUserData?.name||'Teknisi'} dari TechniFind.\n\nLaporan "${r.type}" sudah saya terima. Saya segera menuju lokasi Anda! 🔧`);
      window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
    } else {
      toast('✅ Laporan diterima!');
    }
  } catch(e) { toast('❌ Gagal: ' + e.message); }
};
