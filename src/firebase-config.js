import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAvklqFtqPJTF0YEILBxNIsOP2eZlhYc9w",
  authDomain: "technifind-2266d.firebaseapp.com",
  projectId: "technifind-2266d",
  storageBucket: "technifind-2266d.firebasestorage.app",
  messagingSenderId: "684030071009",
  appId: "1:684030071009:web:3cbfaccb8cfad042fb67a0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
