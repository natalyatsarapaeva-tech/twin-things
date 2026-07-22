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
  storage, storageRef, uploadBytes, getDownloadURL, deleteObject,
} from './firebase.js';
import {
  makeCatalogId, makeJoinCode, normalizeJoinCode, pickActiveCatalog,
  OWNER, EDITOR, DEFAULT_CATEGORIES, DEFAULT_TAGS, CATEGORY_TEMPLATES,
} from './catalog-core.js';
import { compressForUpload } from './image.js';

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

// ── Каталог: переименование ─────────────────────────────────────────────────
// Пишет и сам каталог, и денормализованный индекс у пользователя.
export async function renameCatalog(cid, name) {
  const uid = currentUid();
  const trimmed = (name || '').trim();
  if (!uid || !trimmed) return;
  await setDoc(doc(db, 'catalogs', cid), { name: trimmed }, { merge: true });
  await setDoc(doc(db, 'users', uid, 'catalogs', cid), { name: trimmed }, { merge: true });
}
// Метаданные каталога (name, ownerUid, joinCode) — для settings.html.
export async function getCatalog(cid) {
  const snap = await getDoc(doc(db, 'catalogs', cid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── Вещи активного каталога ─────────────────────────────────────────────────
export async function listItems(cid) {
  const snap = await getDocs(collection(db, 'catalogs', cid, 'items'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getItem(cid, itemId) {
  const snap = await getDoc(doc(db, 'catalogs', cid, 'items', itemId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}
export async function saveItem(cid, item) {
  const toSave = { ...item, updatedAt: new Date().toISOString() };
  await setDoc(doc(db, 'catalogs', cid, 'items', item.id), toSave);
  return toSave;
}
// Удаляет вещь и подчищает её файлы в Storage (сироты §7).
export async function deleteItem(cid, item) {
  const itemId = typeof item === 'string' ? item : item?.id;
  const photos = typeof item === 'object' ? (item.photos || []) : [];
  await Promise.allSettled(photos.flatMap(p => [
    p.path && deleteObject(storageRef(storage, p.path)),
    p.thumbPath && deleteObject(storageRef(storage, p.thumbPath)),
  ].filter(Boolean)));
  await deleteDoc(doc(db, 'catalogs', cid, 'items', itemId));
}

// ── Метаданные каталога (категории/теги/шаблоны) ────────────────────────────
export async function loadMeta(cid, name) {
  const snap = await getDoc(doc(db, 'catalogs', cid, 'meta', name));
  return snap.exists() ? snap.data() : null;
}
export async function saveMeta(cid, name, data) {
  await setDoc(doc(db, 'catalogs', cid, 'meta', name), data);
}
// Загружает всю таксономию каталога разом (с фолбэком на дефолты).
export async function loadTaxonomy(cid) {
  const [cats, tags, tpl] = await Promise.all([
    loadMeta(cid, 'categories'), loadMeta(cid, 'tags'), loadMeta(cid, 'categoryTemplates'),
  ]);
  return {
    categories: cats?.list || DEFAULT_CATEGORIES,
    tags: tags?.list || DEFAULT_TAGS,
    templates: tpl?.map || CATEGORY_TEMPLATES,
  };
}

// ── Пайплайн фото: сжатие (image.js) + загрузка в Storage (§7) ──────────────
// Загружает одно фото вещи: основное + превью. Возвращает дескриптор для
// массива photos в документе вещи. index — порядковый номер файла в вещи.
export async function uploadItemPhoto(cid, itemId, file, index, isPrimary = false) {
  const { main, thumb } = await compressForUpload(file);
  const base = `catalogs/${cid}/items/${itemId}`;
  const path = `${base}/${index}.jpg`;
  const thumbPath = `${base}/${index}_thumb.jpg`;
  const mainRef = storageRef(storage, path);
  const thumbRef = storageRef(storage, thumbPath);
  await uploadBytes(mainRef, main.blob, { contentType: 'image/jpeg' });
  await uploadBytes(thumbRef, thumb.blob, { contentType: 'image/jpeg' });
  const [url, thumbUrl] = await Promise.all([
    getDownloadURL(mainRef), getDownloadURL(thumbRef),
  ]);
  return {
    path, thumbPath, url, thumbUrl,
    isPrimary, w: main.w, h: main.h, uploadedAt: new Date().toISOString(),
  };
}
// Удаляет файлы одного фото из Storage (при удалении фото из галереи).
export async function deleteItemPhoto(photo) {
  if (!photo) return;
  await Promise.allSettled([
    photo.path && deleteObject(storageRef(storage, photo.path)),
    photo.thumbPath && deleteObject(storageRef(storage, photo.thumbPath)),
  ].filter(Boolean));
}
