// Авторизация + доступ к данным каталогов. Много-ко-многим (адаптация kitchen
// store.js, где было один-юзер→одна-семья).
//
// Модель:
//   users/{uid}                  — профиль {displayName, email, createdAt}
//   users/{uid}/catalogs/{cid}   — индекс «мои каталоги» {role, name, joinedAt}
//   catalogs/{cid}               — {name, ownerUid, joinCode, createdAt}
//   catalogs/{cid}/members/{uid} — источник прав {role, addedBy, joinedAt}
//   catalogs/{cid}/items/{id}    — вещи
//   catalogs/{cid}/meta/*        — categories | tags | categoryTemplates
import {
  db, doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where,
  auth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from './firebase.js';
import {
  makeCatalogId, makeJoinCode, normalizeJoinCode, pickActiveCatalog,
  OWNER, EDITOR, DEFAULT_CATEGORIES, DEFAULT_TAGS, CATEGORY_TEMPLATES,
} from './catalog-core.js';

export { normalizeJoinCode };

const ACTIVE_KEY = 'activeCatalogId';

let currentUser = null;
onAuthStateChanged(auth, user => { currentUser = user; });

let firstAuth = null;
export function initAuth() {
  if (!firstAuth) firstAuth = new Promise(resolve => {
    const off = onAuthStateChanged(auth, user => { off(); currentUser = user; resolve(user); });
  });
  return firstAuth;
}

export function currentUid() { return currentUser?.uid || null; }
export function currentUserEmail() { return currentUser?.email || ''; }
export function currentUserName() { return currentUser?.displayName || ''; }

// ── Вход/выход ──────────────────────────────────────────────────────────────
export async function signInGoogle() {
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  currentUser = cred.user;
  await ensureUserDoc();
  return cred;
}
export async function signInEmail(email, pass) {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  currentUser = cred.user;
  await ensureUserDoc();
  return cred;
}
export async function registerEmail(email, pass) {
  const cred = await createUserWithEmailAndPassword(auth, email, pass);
  currentUser = cred.user;
  await ensureUserDoc();
  return cred;
}
export function signOutUser() { return signOut(auth); }

async function ensureUserDoc() {
  const uid = currentUid();
  if (!uid) return;
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName: currentUserName(), email: currentUserEmail(),
      createdAt: new Date().toISOString(),
    });
  }
}

// ── Мои каталоги (индекс) + активный ────────────────────────────────────────
// Возвращает [{id, name, role, joinedAt}] из users/{uid}/catalogs.
export async function listMyCatalogs() {
  const uid = currentUid();
  if (!uid) return [];
  const snap = await getDocs(collection(db, 'users', uid, 'catalogs'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function getActiveCatalogId() { return localStorage.getItem(ACTIVE_KEY); }
export function setActiveCatalogId(cid) { localStorage.setItem(ACTIVE_KEY, cid); }

// Выбирает валидный активный каталог из списка (сохранённый/первый/null).
export function resolveActiveCatalog(catalogs) {
  const active = pickActiveCatalog(catalogs, getActiveCatalogId());
  if (active) setActiveCatalogId(active);
  return active;
}

// ── Онбординг: создать каталог / присоединиться по коду ─────────────────────
// Создаёт каталог + запись владельца в members + индекс у пользователя +
// дефолтную таксономию в meta/*. Возвращает id нового каталога.
export async function createCatalog(name) {
  const uid = currentUid();
  const cid = makeCatalogId(name);
  const now = new Date().toISOString();

  await setDoc(doc(db, 'catalogs', cid), {
    name: name || 'Мой дом', ownerUid: uid, joinCode: makeJoinCode(), createdAt: now,
  });
  await setDoc(doc(db, 'catalogs', cid, 'members', uid), {
    role: OWNER, addedBy: uid, joinedAt: now,
  });
  await setDoc(doc(db, 'users', uid, 'catalogs', cid), {
    role: OWNER, name: name || 'Мой дом', joinedAt: now,
  });
  // Дефолтная таксономия каталога.
  await setDoc(doc(db, 'catalogs', cid, 'meta', 'categories'), { list: DEFAULT_CATEGORIES });
  await setDoc(doc(db, 'catalogs', cid, 'meta', 'tags'), { list: DEFAULT_TAGS });
  await setDoc(doc(db, 'catalogs', cid, 'meta', 'categoryTemplates'), { map: CATEGORY_TEMPLATES });

  setActiveCatalogId(cid);
  return cid;
}

// Присоединение по коду: находит каталог, пишет себя в members + индекс.
// Возвращает id каталога или null, если код не найден.
export async function joinCatalogByCode(rawCode, role = EDITOR) {
  const uid = currentUid();
  const code = normalizeJoinCode(rawCode);
  if (code.length < 4) return null;
  const snap = await getDocs(query(collection(db, 'catalogs'), where('joinCode', '==', code)));
  if (!snap.docs.length) return null;
  const cat = snap.docs[0];
  const now = new Date().toISOString();
  await setDoc(doc(db, 'catalogs', cat.id, 'members', uid), {
    role, addedBy: uid, joinedAt: now,
  });
  await setDoc(doc(db, 'users', uid, 'catalogs', cat.id), {
    role, name: cat.data().name || 'Каталог', joinedAt: now,
  });
  setActiveCatalogId(cat.id);
  return cat.id;
}

// При первом входе (нет ни одного каталога) — авто-создать личный «Мой дом».
export async function ensureFirstCatalog() {
  const mine = await listMyCatalogs();
  if (mine.length) return resolveActiveCatalog(mine);
  await createCatalog('Мой дом');
  return getActiveCatalogId();
}

// ── Вещи активного каталога (базовый CRUD; UI — в Wave 1) ───────────────────
export async function listItems(cid) {
  const snap = await getDocs(collection(db, 'catalogs', cid, 'items'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function saveItem(cid, item) {
  await setDoc(doc(db, 'catalogs', cid, 'items', item.id), item);
}
export async function deleteItem(cid, itemId) {
  await deleteDoc(doc(db, 'catalogs', cid, 'items', itemId));
}
export async function loadMeta(cid, name) {
  const snap = await getDoc(doc(db, 'catalogs', cid, 'meta', name));
  return snap.exists() ? snap.data() : null;
}
