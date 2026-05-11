import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, where, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
let userLat = -6.8924, userLng = 109.3753;
let allTechs = [];
let mainMap = null;
let techMarkers = {};
let selectedTechId = null;
let currentTechUser = null;
let currentTechData = null;

// ─── UTILS ───
function toast(msg, ms = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
}

function haversine(la1, lo1, la2, lo2) {
  const R = 6371, dL = (la2-la1)*Math.PI/180, dO = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function eta(km) { return Math.max(1, Math.round(km / 30 * 60)); }

function waLink(phone, techName) {
  const clean = phone.replace(/\D/g,'').replace(/^0/,'62');
  const msg = encodeURIComponent(`Halo ${techName}, saya menemukan Anda melalui TechniFind. Apakah Anda tersedia untuk membantu masalah internet kami? 🙏`);
  return `https://wa.me/${clean}?text=${msg}`;
}

// ─── INIT MAP ───
function initMap() {
  if (mainMap) return;
  mainMap = L.map('main-map', { zoomControl: false, attributionControl: false })
    .setView([userLat, userLng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mainMap);
  L.control.zoom({ position: 'bottomright' }).addTo(mainMap);
  mainMap.on('click', () => closeDetail());
}

// ─── DETECT LOCATION ───
window.detectLocation = function() {
  document.getElementById('loc-text').textContent = 'Mendeteksi lokasi...';
  if (!navigator.geolocation) { loadTechs(); return; }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      if (mainMap) mainMap.setView([userLat, userLng], 14);

      // Add user marker
      const userIcon = L.divIcon({
        html: `<div class="custom-marker marker-user" style="width:28px;height:28px;font-size:14px">📍</div>`,
        iconSize: [28,28], iconAnchor: [14,14], className: ''
      });
      L.marker([userLat, userLng], { icon: userIcon }).addTo(mainMap)
        .bindPopup('<b>Lokasi Anda</b>');

      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`);
        const d = await r.json();
        document.getElementById('loc-text').textContent =
          d.address?.suburb || d.address?.village || d.address?.city_district || d.address?.city || 'Lokasi Anda';
      } catch {
        document.getElementById('loc-text').textContent = 'Lokasi terdeteksi';
      }
      loadTechs();
    },
    () => {
      document.getElementById('loc-text').textContent = 'Pemalang, Jawa Tengah (default)';
      loadTechs();
    },
    { timeout: 8000 }
  );
};

// ─── LOAD TECHNICIANS ───
async function loadTechs() {
  allTechs = [];
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'tech')));
    snap.forEach(d => {
      const t = d.data();
      const dist = (t.lat && t.lng) ? haversine(userLat, userLng, t.lat, t.lng) : null;
      allTechs.push({ id: d.id, ...t, dist, eta: dist ? eta(dist) : null });
    });
    allTechs.sort((a,b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      if (a.dist !== null && b.dist !== null) return a.dist - b.dist;
      return 0;
    });
    renderTechCards();
    renderMapMarkers();

    const onlineCount = allTechs.filter(t => t.isOnline).length;
    document.getElementById('sheet-label').textContent =
      onlineCount > 0
        ? `${onlineCount} teknisi online di sekitar Anda`
        : `${allTechs.length} teknisi terdaftar`;
  } catch(e) {
    document.getElementById('sheet-label').textContent = 'Gagal memuat data';
    document.getElementById('tech-scroll').innerHTML =
      `<div style="padding:8px;color:#9ca3af;font-size:13px">Gagal: ${e.message}</div>`;
  }
}

function renderTechCards() {
  const el = document.getElementById('tech-scroll');
  if (!allTechs.length) {
    el.innerHTML = `<div style="padding:8px 4px;color:#9ca3af;font-size:13px;white-space:nowrap">Belum ada teknisi terdaftar di area ini.</div>`;
    return;
  }
  el.innerHTML = allTechs.map(t => `
    <div class="tech-chip ${selectedTechId === t.id ? 'selected' : ''}" onclick="selectTech('${t.id}')">
      <div class="tc-top">
        <div class="tc-ava">🔧<div class="tc-status-dot ${t.isOnline ? 'dot-on' : 'dot-off'}"></div></div>
        <div class="tc-name">${escHtml(t.name)}</div>
      </div>
      <div class="tc-spec">${escHtml(t.speciality || 'Teknisi Internet')}</div>
      <div class="tc-meta">
        <span class="tc-dist">${t.dist !== null ? t.dist.toFixed(1) + ' km' : '—'}</span>
        <span class="tc-eta">${t.eta ? '~' + t.eta + ' mnt' : ''}</span>
        <span class="tc-rating">${t.rating > 0 ? '★' + t.rating.toFixed(1) : ''}</span>
      </div>
    </div>
  `).join('');
}

function renderMapMarkers() {
  // Clear old markers
  Object.values(techMarkers).forEach(m => m.remove());
  techMarkers = {};

  allTechs.forEach(t => {
    if (!t.lat || !t.lng) return;
    const icon = L.divIcon({
      html: `<div class="custom-marker ${t.isOnline ? 'marker-online' : 'marker-offline'}" style="width:34px;height:34px;font-size:18px" title="${t.name}">🔧</div>`,
      iconSize: [34,34], iconAnchor: [17,17], className: ''
    });
    const marker = L.marker([t.lat, t.lng], { icon })
      .addTo(mainMap)
      .on('click', () => selectTech(t.id));
    techMarkers[t.id] = marker;
  });
}

// ─── SELECT TECH ───
window.selectTech = function(techId) {
  selectedTechId = techId;
  const t = allTechs.find(x => x.id === techId);
  if (!t) return;

  // Highlight card
  document.querySelectorAll('.tech-chip').forEach(c => c.classList.remove('selected'));
  const card = [...document.querySelectorAll('.tech-chip')].find(c => c.onclick?.toString().includes(techId));
  if (card) { card.classList.add('selected'); card.scrollIntoView({ behavior: 'smooth', inline: 'center' }); }

  // Pan map to tech
  if (t.lat && t.lng && mainMap) mainMap.setView([t.lat, t.lng], 15);

  // Fill detail panel
  document.getElementById('dp-name').textContent = t.name;
  document.getElementById('dp-spec').textContent = t.speciality || 'Teknisi Internet';
  document.getElementById('dp-rating').textContent = t.rating > 0 ? t.rating.toFixed(1) + '★' : '—';
  document.getElementById('dp-jobs').textContent = t.jobsCompleted || 0;
  document.getElementById('dp-dist').textContent = t.dist !== null ? t.dist.toFixed(1) + ' km' : '—';

  const badges = document.getElementById('dp-badges');
  badges.innerHTML = `
    <span class="badge ${t.isOnline ? 'badge-green' : 'badge-gray'}">${t.isOnline ? '● Online' : '● Offline'}</span>
    ${t.dist ? `<span class="badge badge-blue">📍 ${t.dist.toFixed(1)} km</span>` : ''}
    ${t.eta ? `<span class="badge badge-blue">⚡ ~${t.eta} mnt</span>` : ''}
  `;

  const waBtn = document.getElementById('dp-wa-btn');
  const offlineNote = document.getElementById('dp-offline-note');
  if (t.whatsapp) {
    waBtn.disabled = false;
    waBtn.onclick = () => window.open(waLink(t.whatsapp, t.name), '_blank');
    offlineNote.style.display = t.isOnline ? 'none' : 'block';
  } else {
    waBtn.disabled = true;
    waBtn.onclick = () => toast('⚠️ Teknisi belum mengisi nomor WhatsApp.');
    offlineNote.style.display = 'none';
  }

  document.getElementById('detail-panel').classList.add('open');
};

window.closeDetail = function() {
  document.getElementById('detail-panel').classList.remove('open');
  selectedTechId = null;
  document.querySelectorAll('.tech-chip').forEach(c => c.classList.remove('selected'));
};

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── NAVIGATION ───
window.goHome = function() { showScreen('map'); };
window.goTechLogin = function() { showScreen('techlogin'); };

// ─── TECH AUTH TABS ───
window.switchTLTab = function(tab) {
  document.querySelectorAll('.tl-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tl-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`.tl-tab[onclick="switchTLTab('${tab}')"]`).classList.add('active');
  document.getElementById('tl-' + tab).classList.add('active');
};

// ─── TECH LOGIN ───
window.techLogin = async function() {
  const email = document.getElementById('tl-email').value.trim();
  const pass  = document.getElementById('tl-pass').value;
  if (!email || !pass) return toast('⚠️ Isi email dan password.');
  toast('⏳ Masuk...');
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch(e) {
    const map = {
      'auth/invalid-credential': 'Email atau password salah.',
      'auth/user-not-found': 'Akun tidak ditemukan.',
      'auth/wrong-password': 'Password salah.',
    };
    toast('❌ ' + (map[e.code] || e.code));
  }
};

// ─── TECH REGISTER ───
window.techRegister = async function() {
  const name  = document.getElementById('tl-name').value.trim();
  const wa    = document.getElementById('tl-wa').value.trim();
  const spec  = document.getElementById('tl-spec').value;
  const email = document.getElementById('tl-reg-email').value.trim();
  const pass  = document.getElementById('tl-reg-pass').value;
  if (!name||!wa||!spec||!email||!pass) return toast('⚠️ Lengkapi semua data.');
  if (pass.length < 6) return toast('⚠️ Password minimal 6 karakter.');
  toast('⏳ Membuat akun...');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await setDoc(doc(db, 'users', cred.user.uid), {
      name, whatsapp: wa, speciality: spec, email, role: 'tech',
      isOnline: false, rating: 0, jobsCompleted: 0, lat: null, lng: null,
      createdAt: serverTimestamp()
    });
    toast('✅ Akun teknisi berhasil dibuat!');
  } catch(e) {
    const map = {
      'auth/email-already-in-use': 'Email sudah terdaftar.',
      'auth/invalid-email': 'Format email tidak valid.',
      'auth/weak-password': 'Password minimal 6 karakter.',
    };
    toast('❌ ' + (map[e.code] || e.code));
  }
};

// ─── TECH LOGOUT ───
window.techLogout = async function() {
  await signOut(auth);
  currentTechUser = null; currentTechData = null;
  showScreen('map');
  toast('Berhasil keluar.');
};

// ─── AUTH STATE ───
onAuthStateChanged(auth, async user => {
  if (user) {
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists() && snap.data().role === 'tech') {
        currentTechUser = user;
        currentTechData = snap.data();
        initTechDash();
      }
    } catch(e) { console.error(e); }
  }
});

// ─── TECH DASHBOARD ───
function initTechDash() {
  showScreen('techdash');
  document.getElementById('td-greeting').textContent =
    'Halo, ' + (currentTechData?.name?.split(' ')[0] || 'Teknisi') + '!';
  const tog = document.getElementById('online-toggle');
  tog.checked = currentTechData?.isOnline || false;
  updateToggleSub(currentTechData?.isOnline || false);
  listenIncomingReports();
}

window.setOnlineStatus = async function(isOnline) {
  if (!currentTechUser) return;
  let loc = {};
  if (isOnline && navigator.geolocation) {
    await new Promise(res => navigator.geolocation.getCurrentPosition(
      p => { loc = { lat: p.coords.latitude, lng: p.coords.longitude }; res(); },
      res, { timeout: 6000 }
    ));
  }
  try {
    await updateDoc(doc(db, 'users', currentTechUser.uid), { isOnline, ...loc });
    if (currentTechData) currentTechData.isOnline = isOnline;
    updateToggleSub(isOnline);
    toast(isOnline ? '🟢 Anda sekarang Online!' : '⚫ Anda sekarang Offline');
  } catch(e) { toast('❌ Gagal: ' + e.message); }
};

function updateToggleSub(on) {
  document.getElementById('toggle-sub').innerHTML =
    `Anda <strong style="color:${on?'#00c47d':'#6b7a6d'}">${on?'Online':'Offline'}</strong>`;
}

function listenIncomingReports() {
  const el = document.getElementById('incoming-list');
  if (!currentTechUser) return;
  const q = query(collection(db, 'reports'),
    where('techId', '==', currentTechUser.uid),
    where('status', '==', 'pending'));
  onSnapshot(q, snap => {
    if (snap.empty) {
      el.innerHTML = `<div class="empty-box">Belum ada laporan masuk.<br>Aktifkan status Online untuk mulai menerima.</div>`;
      return;
    }
    el.innerHTML = snap.docs.map(d => {
      const r = d.data();
      return `<div class="report-card">
        <div>
          <div class="rc-type">${escHtml(r.type)}</div>
          <div class="rc-from">Dari: ${escHtml(r.userName)}</div>
          ${r.description ? `<div class="rc-from" style="margin-top:4px">${escHtml(r.description.slice(0,80))}</div>` : ''}
        </div>
        ${r.priority==='urgent' ? `<div class="rc-urgent">🚨 Darurat</div>` : ''}
        <button class="btn-accept" onclick="acceptReport('${d.id}')">✅ Terima & WA Pengguna</button>
      </div>`;
    }).join('');
  });
}

window.acceptReport = async function(rid) {
  try {
    const snap = await getDoc(doc(db, 'reports', rid));
    const r = snap.data();
    await updateDoc(doc(db, 'reports', rid), { status: 'accepted' });
    if (r.userWhatsapp) {
      const clean = r.userWhatsapp.replace(/\D/g,'').replace(/^0/,'62');
      const msg = encodeURIComponent(`Halo ${r.userName}, saya ${currentTechData?.name||'Teknisi'} dari TechniFind. Laporan "${r.type}" sudah saya terima dan saya segera menuju lokasi Anda! 🔧`);
      window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
    } else {
      toast('✅ Laporan diterima!');
    }
  } catch(e) { toast('❌ ' + e.message); }
};

// ─── BOOT ───
window.addEventListener('load', () => {
  initMap();
  detectLocation();
});
