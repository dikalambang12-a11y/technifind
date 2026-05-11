import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

let userLat = -6.8924, userLng = 109.3753; // Default Pemalang
let allTechs = [];
let mainMap = null;
let techMarkers = {};
let selectedTechId = null;

// --- UTILS ---
function haversine(la1, lo1, la2, lo2) {
  const R = 6371;
  const dL = (la2-la1)*Math.PI/180, dO = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dO/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// --- INIT MAP ---
function initMap() {
  if (mainMap) return;
  mainMap = L.map('main-map', { zoomControl: false, attributionControl: false }).setView([userLat, userLng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mainMap);

  // LOGIKA ALA GOOGLE MAPS: Filter saat peta digeser
  mainMap.on('moveend', () => {
    const center = mainMap.getCenter();
    updateTechDistances(center.lat, center.lng);
  });
}

// --- LOAD DATA ---
async function loadTechs() {
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'tech')));
    allTechs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateTechDistances(userLat, userLng);
  } catch(e) { console.error("Error loading:", e); }
}

function updateTechDistances(lat, lng) {
  const keyword = document.getElementById('main-search').value.toLowerCase();
  
  const processed = allTechs.map(t => {
    const dist = (t.lat && t.lng) ? haversine(lat, lng, t.lat, t.lng) : 999;
    return { ...t, dist };
  });

  // Filter berdasarkan pencarian DAN jarak (radius 15km)
  const filtered = processed.filter(t => {
    const matchSearch = t.name.toLowerCase().includes(keyword) || (t.speciality || '').toLowerCase().includes(keyword);
    return matchSearch && t.dist < 15; 
  }).sort((a, b) => a.dist - b.dist);

  renderUI(filtered);
}

function renderUI(data) {
  // 1. Render Cards
  const scroll = document.getElementById('tech-scroll');
  scroll.innerHTML = data.map(t => `
    <div class="tech-chip ${selectedTechId === t.id ? 'selected' : ''}" onclick="selectTech('${t.id}')">
      <div class="tc-top">
        <div class="tc-ava">🔧<div class="tc-status-dot ${t.isOnline ? 'dot-on' : 'dot-off'}"></div></div>
        <div class="tc-name">${t.name}</div>
      </div>
      <div class="tc-spec">${t.speciality || 'Teknisi'}</div>
      <div class="tc-meta"><span>${t.dist.toFixed(1)} km</span></div>
    </div>
  `).join('');

  // 2. Render Markers
  Object.values(techMarkers).forEach(m => m.remove());
  techMarkers = {};
  data.forEach(t => {
    const icon = L.divIcon({
      html: `<div class="custom-marker ${t.isOnline ? 'marker-online' : 'marker-offline'}" style="width:30px;height:30px">🔧</div>`,
      iconSize: [30,30], className: ''
    });
    const m = L.marker([t.lat, t.lng], { icon }).addTo(mainMap).on('click', () => selectTech(t.id));
    techMarkers[t.id] = m;
  });
}

// --- DETECT LOCATION ---
window.detectLocation = function() {
  navigator.geolocation.getCurrentPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    mainMap.setView([userLat, userLng], 15);
    L.marker([userLat, userLng], { icon: L.divIcon({ html: '📍', className: 'marker-user' }) }).addTo(mainMap);
    updateTechDistances(userLat, userLng);
  }, () => loadTechs());
};

// --- SELECT TECH ---
window.selectTech = function(id) {
  selectedTechId = id;
  const t = allTechs.find(x => x.id === id);
  document.getElementById('dp-name').textContent = t.name;
  document.getElementById('dp-spec').textContent = t.speciality;
  document.getElementById('dp-dist').textContent = t.dist ? t.dist.toFixed(1) + ' km' : '—';
  document.getElementById('detail-panel').classList.add('open');
};

window.closeDetail = () => document.getElementById('detail-panel').classList.remove('open');

// --- BOOT ---
window.addEventListener('load', () => {
  initMap();
  loadTechs();
  document.getElementById('main-search').addEventListener('input', () => {
    const center = mainMap.getCenter();
    updateTechDistances(center.lat, center.lng);
  });
});
