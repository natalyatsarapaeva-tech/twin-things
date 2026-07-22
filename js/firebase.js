// Единая инициализация Firebase для всех страниц Twin Things.
// Основано на kitchen js/firebase.js + добавлен Storage (фото вещей).
//
// ⚠️ ЗАПОЛНИТЬ: вставь web-конфиг СВОЕГО нового Firebase-проекта (Console →
// Project settings → General → Your apps → Web). Это отдельный проект, НЕ
// natas-kitchen. Конфиг публичный по дизайну — доступ гейтят Firestore/Storage rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-storage.js";

export {
  collection, collectionGroup, getDocs, doc, setDoc, deleteDoc, getDoc,
  query, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";

export {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";

export {
  ref as storageRef, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Разрешается после восстановления сессии — страницы, пишущие в Firestore/Storage,
// ждут, чтобы запросы ушли с токеном (важно для rules по членству).
export const authReady = new Promise(resolve => {
  const off = onAuthStateChanged(auth, user => { off(); resolve(user); });
});
