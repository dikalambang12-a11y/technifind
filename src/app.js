import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Konfigurasi tetap sama
const firebaseConfig = {
  apiKey: "AIzaSyAvklqFtqPJTF0YEILBxNIsOP2eZlhYc9w",
  authDomain: "technifind-2266d.firebaseapp.com",
  projectId: "technifind-2266d",
  storageBucket: "technifind-2266d.firebasestorage.app",
  messagingSenderId: "684030071009",
  appId: "1:684030071009:web:3cbfaccb8cfad042fb67a0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let mainMap = null;
let allTechs = [];
let techMarkers = {};
let userLat = -6.8924, userLng = 109.3753; // Default

// Fungsi hitung jarak
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2-lat1) * Math.PI/180;
  const dLon = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function initApp() {
  // 1. Inisialisasi Peta
  mainMap = L.map('main-map', { zoomControl: false, attributionControl: false }).setView([userLat, userLng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mainMap);

  // 2. Ambil Data Teknisi dari Firebase
  const q = query(collection(db, "users"), where("role", "==", "tech"));
  const snap = await getDocs(q);
  allTechs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 3. Event: Setiap kali peta digeser atau di-zoom
  mainMap.on('moveend', refreshUI);

  // 4. Event: Setiap kali mengetik di kolom pencarian
  document.getElementById('main-search').addEventListener('input', refreshUI);

  // Jalankan render pertama kali
  refreshUI();
  detectLocation();
}

function refreshUI() {
  const keyword = document.getElementById('main-search').value.toLowerCase();
  const bounds = mainMap.getBounds(); // Ambil area yang terlihat di layar
  const center = mainMap.getCenter();

  // Filter teknisi yang HANYA ada di dalam layar peta DAN sesuai keyword
  const visibleTechs = allTechs.filter(t => {
    if (!t.lat || !t.lng) return false;
    
    const pos = L.latLng(t.lat, t.lng);
    const isInBounds = bounds.contains(pos); // Cek apakah posisi masuk di layar HP
    const matchKeyword = t.name.toLowerCase().includes(keyword) || 
                         (t.speciality && t.speciality.toLowerCase().includes(keyword));
    
    return isInBounds && matchKeyword;
  }).map(t => {
    // Tambahkan info jarak dari tengah peta
    return { ...t, dist: getDistance(center.lat, center.lng, t.lat, t.lng) };
  }).sort((a, b) => a.dist - b.dist); // Urutkan dari yang paling tengah

  renderMarkers(visibleTechs);
  renderList(visibleTechs);
}

function renderMarkers(techs) {
  // Hapus marker lama yang tidak perlu
  Object.keys(techMarkers).forEach(id => {
    mainMap.removeLayer(techMarkers[id]);
    delete techMarkers[id];
  });

  // Tambah marker baru
  techs.forEach(t => {
    const icon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background:${t.isOnline ? '#00c47d' : '#9ca3af'}; 
             width:35px; height:35px; border-radius:50%; border:3px solid white; 
             display:flex; align-items:center; justify-content:center; color:white; 
             box-shadow:0 4px 10px rgba(0,0,0,0.2)">🔧</div>`,
      iconSize: [35, 35]
    });

    const m = L.marker([t.lat, t.lng], { icon }).addTo(mainMap);
    m.on('click', () => {
        mainMap.panTo([t.lat, t.lng]);
        showDetail(t);
    });
    techMarkers[t.id] = m;
  });
}

function renderList(techs) {
  const container = document.getElementById('tech-scroll');
  if (techs.length === 0) {
    container.innerHTML = `<div style="padding:20px; color:#6b7a6d; font-size:13px;">Tidak ada teknisi di area ini...</div>`;
    return;
  }

  container.innerHTML = techs.map(t => `
    <div class="tech-chip" onclick="focusTech('${t.id}', ${t.lat}, ${t.lng})">
      <div class="tc-top">
        <div class="tc-ava">🔧</div>
        <div class="tc-name">${t.name}</div>
      </div>
      <div class="tc-spec">${t.speciality || 'Teknisi Umum'}</div>
      <div class="tc-meta">
        <span style="color:#00c47d">● Online</span>
        <span>${t.dist.toFixed(1)} km</span>
      </div>
    </div>
  `).join('');
}

window.focusTech = function(id, lat, lng) {
  mainMap.flyTo([lat, lng], 16);
  const t = allTechs.find(x => x.id === id);
  if(t) showDetail(t);
}

function showDetail(t) {
  document.getElementById('dp-name').innerText = t.name;
  document.getElementById('dp-spec').innerText = t.speciality || 'Teknisi';
  document.getElementById('dp-dist').innerText = getDistance(userLat, userLng, t.lat, t.lng).toFixed(1) + ' km';
  document.getElementById('detail-panel').classList.add('open');
  
  document.getElementById('dp-wa-btn').onclick = () => {
    const phone = t.whatsapp.replace(/\D/g,'').replace(/^0/,'62');
    window.open(`https://wa.me/${phone}?text=Halo%20${t.name},%20saya%20butuh%20bantuan%20teknisi`, '_blank');
  };
}

function detectLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      document.getElementById('loc-text').innerText = "Lokasi Saya";
      mainMap.setView([userLat, userLng], 15);
      L.marker([userLat, userLng]).addTo(mainMap).bindPopup("Lokasi Kamu").openPopup();
    });
  }
}

// Jalankan sistem
window.addEventListener('DOMContentLoaded', initApp);
