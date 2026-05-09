import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  doc, setDoc, getDoc, collection,
  addDoc, getDocs, query, where,
  orderBy, onSnapshot, updateDoc, serverTimestamp, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
    `Halo ${techName}, saya ${userName} dari ${schoolName || 'sekolah kami'}.\n\n` +
    `Kami menemukan Anda melalui TechniFind dan membutuhkan bantuan teknis untuk masalah internet.\n\n` +
    `Apakah Anda tersedia untuk membantu kami sekarang? 🙏`
  );
  return `https://wa.me/${clean}?text=${msg}`;
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'Email tidak ditemukan. Coba daftar dulu.',
    'auth/wrong-password': 'Password salah. Coba lagi.',
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/email-already-in-use': 'Email sudah terdaftar. Coba masuk.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/weak-password': 'Password minimal 6 karakter.',
    'auth/popup-closed-by-user': 'Login Google dibatalkan.',
    'auth/popup-blocked': 'Popup diblokir browser. Izinkan popup untuk situs ini.',
    'auth/network-request-failed': 'Tidak ada koneksi internet.',
  };
  return map[code] || `Terjadi kesalahan (${code}). Coba lagi.`;
}

// ─── AUTH ───
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
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        name: user.displayName || 'Pengguna',
        email: user.email,
        role: 'user',
        whatsapp: '',
        createdAt: serverTimestamp()
      });
    }
  } catch (e) {
    toast('❌ ' + friendlyError(e.code));
  }
};

window.registerUser = async function() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const wa    = document.getElementById('reg-wa').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const spec  = document.getElementById('reg-spec').value;

  if (!name || !email || !wa || !pass) return toast('⚠️ Lengkapi semua data terlebih dahulu.');
  if (selectedRole === 'tech' && !spec) return toast('⚠️ Pilih keahlian teknisi.');
  if (pass.length < 6) return toast('⚠️ Password minimal 6 karakter.');

  toast('⏳ Membuat akun...');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const uid = cred.user.uid;
    const base = { name, email, whatsapp: wa, role: selectedRole, createdAt: serverTimestamp() };
    if (selectedRole === 'tech') {
      Object.assign(base, {
        speciality: spec,
        isOnline: false,
        rating: 0,
        jobsCompleted: 0,
        lat: null,
        lng: null
      });
    }
    await setDoc(doc(db, 'users', uid), base);
    toast('✅ Akun berhasil dibuat! Selamat datang ' + name + '!');
  } catch (e) {
    toast('❌ ' + friendlyError(e.code));
  }
};

window.logout = async function() {
  await signOut(auth);
  currentUser = null;
  currentUserData = null;
  showScreen('auth');
};

// ─── AUTH STATE ───
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        currentUserData = snap.data();
        if (currentUserData.role === 'tech') {
          initTechDashboard();
        } else {
          initUserHome();
        }
      } else {
        // User exists in Auth but not in Firestore (Google login first time)
        currentUserData = {
          name: user.displayName || user.email,
          email: user.email,
          role: 'user',
          whatsapp: ''
        };
        await setDoc(doc(db, 'users', user.uid), {
          ...currentUserData,
          createdAt: serverTimestamp()
        });
        initUserHome();
      }
    } catch(e) {
      toast('❌ Gagal memuat profil: ' + e.message);
    }
  } else {
    showScreen('auth');
  }
});

// ─── LOCATION ───
window.detectLocation = function() {
  const el = document.getElementById('location-text');
  el.textContent = 'Mendeteksi lokasi...';
  if (!navigator.geolocation) {
    el.textContent = 'Geolokasi tidak didukung.';
    setDefaultLocation();
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${userLat}&lon=${userLng}&format=json`);
        const d = await r.json();
        const label = d.address?.suburb || d.address?.village || d.address?.city || 'Lokasi Anda';
        el.textContent = label;
      } catch {
        el.textContent = `${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
      }
      loadNearbyTechs();
    },
    () => {
      setDefaultLocation();
      loadNearbyTechs();
    },
    { timeout: 8000 }
  );
};

function setDefaultLocation() {
  userLat = -6.8924;
  userLng = 109.3753;
  const el = document.getElementById('location-text');
  if (el) el.textContent = 'Pemalang, Jawa Tengah';
}

// ─── USER HOME ───
function initUserHome() {
  showScreen('home');
  document.getElementById('home-greeting').textContent =
    'Halo, ' + (currentUserData?.name?.split(' ')[0] || 'Pengguna') + ' 👋';
  document.getElementById('profile-back').onclick = goHome;
  detectLocation();
}

// ─── LOAD TECHNICIANS ───
async function loadNearbyTechs() {
  allTechnicians = [];
  try {
    // Simple query - no orderBy to avoid index requirement
    const q = query(collection(db, 'users'), where('role', '==', 'tech'));
    const snap = await getDocs(q);
    snap.forEach(docSnap => {
      const d = docSnap.data();
      let dist = null;
      let eta  = null;
      if (d.lat && d.lng && userLat && userLng) {
        dist = haversine(userLat, userLng, d.lat, d.lng);
        eta  = etaMinutes(dist);
      }
      allTechnicians.push({ id: docSnap.id, ...d, dist, eta });
    });

    // Sort in JS instead of Firestore (avoids index issues)
    allTechnicians.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      if (a.dist !== null && b.dist !== null) return a.dist - b.dist;
      return 0;
    });

    const onlineCount = allTechnicians.filter(t => t.isOnline).length;
    document.getElementById('stat-online').textContent = onlineCount;
    const etaArr = allTechnicians.filter(t => t.eta !== null).map(t => t.eta);
    document.getElementById('stat-eta').textContent =
      etaArr.length ? Math.round(etaArr.reduce((a,b)=>a+b,0)/etaArr.length) : '—';

    renderNearbyList(allTechnicians.slice(0, 3));
  } catch(e) {
    document.getElementById('nearby-list').innerHTML =
      `<div class="empty-state"><p>Gagal memuat teknisi: ${e.message}</p></div>`;
  }
}

function renderNearbyList(techs) {
  const el = document.getElementById('nearby-list');
  if (!techs.length) {
    el.innerHTML = `<div class="empty-state">
      <p>Belum ada teknisi terdaftar.<br>
      <small>Ajak teknisi internet di daerah kamu untuk daftar!</small></p>
    </div>`;
    return;
  }
  el.innerHTML = techs.map(t => techCardHTML(t)).join('');
}

function techCardHTML(t) {
  const dotClass = t.isOnline ? 'dot-green' : 'dot-gray';
  const statusBadge = t.isOnline
    ? `<span class="badge green">● Online</span>`
    : `<span class="badge gray">● Offline</span>`;
  const distBadge = t.dist !== null
    ? `<span class="badge blue">📍 ${t.dist.toFixed(1)} km</span>`
    : `<span class="badge gray">📍 —</span>`;
  const etaBadge = t.eta !== null
    ? `<span class="badge blue">⚡ ~${t.eta} mnt</span>`
    : '';
  const stars = t.rating > 0
    ? '★'.repeat(Math.round(t.rating)) + '☆'.repeat(5 - Math.round(t.rating))
    : '—';

  return `
    <div class="tech-card" onclick="goDetail('${t.id}')">
      <div class="tc-avatar">
        🔧
        <div class="tc-dot ${dotClass}"></div>
      </div>
      <div class="tc-info">
        <div class="tc-name">${escHtml(t.name)}</div>
        <div class="tc-spec">${escHtml(t.speciality || 'Teknisi Internet')}</div>
        <div class="tc-badges">${statusBadge}${distBadge}${etaBadge}</div>
      </div>
      <div class="tc-right">
        <div class="tc-rating">${stars}</div>
        <div class="tc-jobs">${t.jobsCompleted || 0} selesai</div>
        ${t.dist !== null ? `<div class="tc-dist">${t.dist.toFixed(1)} km</div>` : ''}
      </div>
    </div>`;
}

// ─── NAVIGATION ───
window.goHome = function() {
  if (currentUserData?.role === 'tech') { initTechDashboard(); return; }
  showScreen('home');
};

window.goSearch = function(mode) {
  showScreen('search');
  renderSearchResults(allTechnicians, '');
  document.getElementById('search-input').value = '';
  if (mode === 'darurat') toast('🚨 Mode Darurat — cari teknisi segera!');
};

window.goHistory = function() {
  showScreen('history');
  loadHistory();
};

window.goProfile = function() {
  showScreen('profile');
  document.getElementById('profile-name').textContent = currentUserData?.name || '—';
  document.getElementById('profile-role').textContent =
    currentUserData?.role === 'tech' ? '🔧 Teknisi Internet' : '👩‍🏫 Guru / Staff Sekolah';
};

// ─── SEARCH ───
window.filterSearch = function(val) {
  renderSearchResults(allTechnicians, val, currentFilter);
};

window.chipFilter = function(el, filter) {
  currentFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderSearchResults(allTechnicians, document.getElementById('search-input').value, filter);
};

function renderSearchResults(techs, search = '', filter = '') {
  const el = document.getElementById('search-list');
  document.getElementById('search-loading').style.display = 'none';

  let filtered = [...techs];
  if (filter === 'online') filtered = filtered.filter(t => t.isOnline);
  else if (filter) filtered = filtered.filter(t => (t.speciality||'').toLowerCase().includes(filter.toLowerCase()));

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(s) ||
      (t.speciality||'').toLowerCase().includes(s)
    );
  }

  if (!filtered.length) {
    el.innerHTML = `<div class="empty-state"><p>Tidak ada teknisi ditemukan.</p></div>`;
    return;
  }
  el.innerHTML = filtered.map(t => techCardHTML(t)).join('');
}

// ─── DETAIL ───
window.goDetail = async function(techId) {
  currentTechId = techId;
  document.getElementById('detail-back-btn').onclick = () => showScreen('search');

  const tech = allTechnicians.find(t => t.id === techId);
  if (!tech) return;

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
    btnWa.onclick = () => {
      const link = buildWaLink(
        tech.whatsapp, tech.name,
        currentUserData?.name || 'Pengguna',
        currentUserData?.school || 'Sekolah Kami'
      );
      window.open(link, '_blank');
    };
    btnWa.disabled = false;
    btnWa.style.opacity = '1';
  } else {
    btnWa.disabled = true;
    btnWa.style.opacity = '0.4';
    btnWa.onclick = () => toast('⚠️ Teknisi belum mengisi nomor WhatsApp.');
  }

  showScreen('detail');

  // Map
  setTimeout(() => {
    if (detailMap) { detailMap.remove(); detailMap = null; }
    const mapEl = document.getElementById('detail-map');
    let centerLat = userLat || -6.8924;
    let centerLng = userLng || 109.3753;
    if (tech.lat && tech.lng) {
      centerLat = (centerLat + tech.lat) / 2;
      centerLng = (centerLng + tech.lng) / 2;
    }
    detailMap = L.map('detail-map', { zoomControl: true }).setView([centerLat, centerLng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(detailMap);

    if (userLat && userLng) {
      const userIcon = L.divIcon({
        html: `<div style="background:#ef4444;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🏫</div>`,
        iconSize: [32,32], iconAnchor: [16,16], className: ''
      });
      L.marker([userLat, userLng], { icon: userIcon }).addTo(detailMap).bindPopup('Lokasi Anda');
    }

    if (tech.lat && tech.lng) {
      const techIcon = L.divIcon({
        html: `<div style="background:#0ea874;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">🔧</div>`,
        iconSize: [36,36], iconAnchor: [18,18], className: ''
      });
      L.marker([tech.lat, tech.lng], { icon: techIcon }).addTo(detailMap)
        .bindPopup(`<b>${tech.name}</b>`).openPopup();
      if (userLat && userLng) {
        detailMap.fitBounds([[userLat, userLng],[tech.lat, tech.lng]], { padding: [40,40] });
      }
    }
  }, 200);

  loadReviews(techId);
};

async function loadReviews(techId) {
  const el = document.getElementById('reviews-list');
  try {
    // Simple query without orderBy to avoid index issues
    const q = query(collection(db, 'reviews'), where('techId', '==', techId));
    const snap = await getDocs(q);
    if (snap.empty) { el.innerHTML = '<p class="muted-text">Belum ada ulasan.</p>'; return; }
    el.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const stars = '★'.repeat(r.rating||0) + '☆'.repeat(5-(r.rating||0));
      return `<div class="review-card">
        <div class="rv-head">
          <span class="rv-name">${escHtml(r.userName)}</span>
          <span class="rv-stars">${stars}</span>
        </div>
        <div class="rv-text">${escHtml(r.text)}</div>
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<p class="muted-text">Belum ada ulasan.</p>';
  }
}

// ─── REPORT ───
window.openReport = function() {
  document.getElementById('report-modal').classList.add('open');
};
window.closeReport = function() {
  document.getElementById('report-modal').classList.remove('open');
};
window.submitReport = async function() {
  const type = document.getElementById('rep-type').value;
  const desc = document.getElementById('rep-desc').value.trim();
  const priority = document.querySelector('input[name="priority"]:checked').value;
  if (!currentTechId) return toast('⚠️ Pilih teknisi terlebih dahulu.');
  try {
    await addDoc(collection(db, 'reports'), {
      userId: currentUser.uid,
      userName: currentUserData?.name || 'Pengguna',
      userSchool: currentUserData?.school || '',
      userWhatsapp: currentUserData?.whatsapp || '',
      techId: currentTechId,
      type, description: desc, priority,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    closeReport();
    toast('✅ Laporan berhasil dikirim ke teknisi!');
    document.getElementById('rep-desc').value = '';
  } catch(e) {
    toast('❌ Gagal mengirim laporan: ' + e.message);
  }
};

// ─── HISTORY ───
async function loadHistory() {
  const el = document.getElementById('history-list');
  try {
    // Simple query without orderBy
    const q = query(collection(db, 'reports'), where('userId', '==', currentUser.uid));
    const snap = await getDocs(q);
    if (snap.empty) {
      el.innerHTML = `<div class="empty-state"><p>Belum ada laporan yang dibuat.</p></div>`;
      return;
    }
    const docs = snap.docs.sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0));
    el.innerHTML = docs.map(d => {
      const r = d.data();
      const isDone = r.status === 'resolved';
      const date = r.createdAt?.toDate?.()?.toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) || '—';
      return `<div class="history-card">
        <div class="hc-icon ${isDone ? 'done' : 'pending'}">${isDone ? '✅' : '⏳'}</div>
        <div>
          <div class="hc-title">${escHtml(r.type)}</div>
          <div class="hc-meta">${date} · ${r.priority==='urgent'?'🚨 Darurat':'Normal'}</div>
          ${r.description ? `<div class="hc-meta">${escHtml(r.description.slice(0,80))}${r.description.length>80?'…':''}</div>` : ''}
        </div>
        <div class="hc-status">
          <span class="badge ${isDone?'green':'orange'}">${isDone?'Selesai':'Proses'}</span>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>Gagal memuat riwayat.</p></div>`;
  }
}

// ─── TECH DASHBOARD ───
function initTechDashboard() {
  showScreen('tech-dashboard');
  document.getElementById('tech-greeting').textContent =
    'Halo, ' + (currentUserData?.name?.split(' ')[0] || 'Teknisi') + '!';
  document.getElementById('tech-rating-display').textContent =
    currentUserData?.rating > 0 ? currentUserData.rating.toFixed(1) + ' ★' : 'Belum ada';
  document.getElementById('tech-jobs-display').textContent = currentUserData?.jobsCompleted || 0;
  document.getElementById('online-toggle').checked = currentUserData?.isOnline || false;
  updateOnlineSubtext(currentUserData?.isOnline || false);
  loadIncomingReports();
}

window.toggleOnlineStatus = async function(isOnline) {
  if (!currentUser) return;
  try {
    let locUpdate = {};
    if (isOnline && navigator.geolocation) {
      await new Promise(resolve => {
        navigator.geolocation.getCurrentPosition(pos => {
          locUpdate = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve();
        }, resolve, { timeout: 5000 });
      });
    }
    await updateDoc(doc(db, 'users', currentUser.uid), { isOnline, ...locUpdate });
    currentUserData.isOnline = isOnline;
    updateOnlineSubtext(isOnline);
    toast(isOnline ? '🟢 Anda sekarang Online!' : '⚫ Anda sekarang Offline');
  } catch(e) {
    toast('❌ Gagal mengubah status.');
  }
};

function updateOnlineSubtext(isOnline) {
  document.getElementById('ot-sub-text').innerHTML =
    `Anda saat ini <strong style="color:${isOnline?'#0ea874':'#6b7280'}">${isOnline?'Online':'Offline'}</strong>`;
}

async function loadIncomingReports() {
  const el = document.getElementById('incoming-reports');
  if (!currentUser) return;
  try {
    // Simple query without orderBy to avoid index
    const q = query(
      collection(db, 'reports'),
      where('techId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    onSnapshot(q, snap => {
      if (snap.empty) {
        el.innerHTML = `<div class="empty-state"><p>Tidak ada laporan masuk saat ini.<br><small>Pastikan status Anda Online.</small></p></div>`;
        return;
      }
      const docs = snap.docs.sort((a,b) => (b.data().createdAt?.seconds||0) - (a.data().createdAt?.seconds||0));
      el.innerHTML = docs.map(d => {
        const r = d.data();
        const isUrgent = r.priority === 'urgent';
        return `<div class="incoming-card">
          <div class="ic-head">
            <div>
              <div class="ic-type">${escHtml(r.type)}</div>
              <div class="ic-meta">Dari: ${escHtml(r.userName)} ${r.userSchool?'· '+escHtml(r.userSchool):''}</div>
              ${r.description?`<div class="ic-meta">${escHtml(r.description.slice(0,100))}</div>`:''}
            </div>
            ${isUrgent?`<span class="badge red ic-priority-badge">🚨 Darurat</span>`:''}
          </div>
          <button class="btn-accept" onclick="acceptReport('${d.id}')">
            ✅ Terima & Hubungi via WhatsApp
          </button>
        </div>`;
      }).join('');
    });
  } catch(e) {
    el.innerHTML = `<div class="empty-state"><p>Gagal memuat laporan.</p></div>`;
  }
}

window.acceptReport = async function(reportId) {
  try {
    const repSnap = await getDoc(doc(db, 'reports', reportId));
    const repData = repSnap.data();
    await updateDoc(doc(db, 'reports', reportId), { status: 'accepted' });

    if (repData.userWhatsapp) {
      const clean = repData.userWhatsapp.replace(/[^0-9]/g,'').replace(/^0/,'62');
      const msg = encodeURIComponent(
        `Halo ${repData.userName}, saya ${currentUserData?.name||'Teknisi'} dari TechniFind.\n\n` +
        `Laporan Anda: "${repData.type}" sudah saya terima.\n` +
        `Saya segera menuju lokasi Anda. Mohon tunggu! 🔧`
      );
      window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
    } else {
      toast('✅ Laporan diterima! Hubungi pengguna secara langsung.');
    }
  } catch(e) {
    toast('❌ Gagal menerima laporan: ' + e.message);
  }
};
