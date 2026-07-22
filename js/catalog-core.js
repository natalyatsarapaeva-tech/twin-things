// Чистая логика каталогов Twin Things (без Firebase — тестируется в Node).
//
// Модель много-ко-многим (в отличие от одной-семьи в kitchen):
//   users/{uid}/catalogs/{cid}   — индекс «мои каталоги» {role, name, joinedAt}
//   catalogs/{cid}/members/{uid} — источник прав {role, addedBy, joinedAt}
// Роли MVP: owner | editor  (viewer — отдельная волна).

// ── Роли ──────────────────────────────────────────────────────────────────
export const ROLES = ['owner', 'editor']; // viewer добавится в Wave 5
export const OWNER = 'owner';
export const EDITOR = 'editor';

export function isValidRole(role) {
  return ROLES.includes(role);
}
// Может править вещи/категории/теги/фото (owner и editor; в будущем — не viewer).
export function canEditItems(role) {
  return role === OWNER || role === EDITOR;
}
// Может управлять участниками и удалять каталог (только владелец).
export function canManageCatalog(role) {
  return role === OWNER;
}

// ── Коды присоединения (перенесено из kitchen household-core) ───────────────
// 6 символов без визуально похожих (I/L/O/0/1).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeJoinCode(rand = Math.random) {
  return Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('');
}
export function normalizeJoinCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ── Идентификаторы ──────────────────────────────────────────────────────────
// Id каталога: слаг имени + случайный хвост (уникальность без счётчиков).
export function makeCatalogId(name, rand = Math.random) {
  const slug = String(name || 'каталог').toLowerCase()
    .replace(/[^а-яёa-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'каталог';
  return `${slug}-${Math.floor(rand() * 1e9).toString(36)}`;
}
// Id вещи: item-<timestamp>-<rand>.
export function makeItemId(now = Date.now, rand = Math.random) {
  return `item-${now()}-${Math.floor(rand() * 1e6).toString(36)}`;
}

// ── Активный каталог ────────────────────────────────────────────────────────
// Выбирает валидный активный каталог: сохранённый, если он ещё в списке;
// иначе первый; иначе null. `catalogs` — массив {id, ...}.
export function pickActiveCatalog(catalogs, savedId) {
  if (!Array.isArray(catalogs) || catalogs.length === 0) return null;
  if (savedId && catalogs.some(c => c.id === savedId)) return savedId;
  return catalogs[0].id;
}

// ── Таксономия по умолчанию для нового каталога ─────────────────────────────
// Категория — одна основная классификация; теги — сквозные метки.
export const DEFAULT_CATEGORIES = [
  { id: 'electronics', label: 'Электроника' },
  { id: 'furniture',   label: 'Мебель' },
  { id: 'clothing',    label: 'Одежда' },
  { id: 'books',       label: 'Книги' },
  { id: 'kitchen',     label: 'Кухня' },
  { id: 'tools',       label: 'Инструменты' },
  { id: 'generic',     label: 'Разное' },
];

export const DEFAULT_TAGS = [
  { id: 'fragile',  label: 'Хрупкое' },
  { id: 'for-sale', label: 'На продажу' },
  { id: 'kids',     label: 'Детское' },
  { id: 'seasonal', label: 'Сезонное' },
];

// Шаблоны рекомендуемых характеристик по категории (§5.2 ТЗ).
// type управляет виджетом ввода: text | number | money | date | select.
export const CATEGORY_TEMPLATES = {
  electronics: [
    { label: 'Бренд', type: 'text' }, { label: 'Модель', type: 'text' },
    { label: 'Серийный №', type: 'text' }, { label: 'Гарантия до', type: 'date' },
    { label: 'Цена', type: 'money' }, { label: 'Дата покупки', type: 'date' },
  ],
  furniture: [
    { label: 'Материал', type: 'text' }, { label: 'Цвет', type: 'text' },
    { label: 'Размеры', type: 'text' }, { label: 'Комната', type: 'text' },
  ],
  clothing: [
    { label: 'Размер', type: 'text' }, { label: 'Бренд', type: 'text' },
    { label: 'Сезон', type: 'select' }, { label: 'Цвет', type: 'text' },
  ],
  books: [
    { label: 'Автор', type: 'text' }, { label: 'Год', type: 'number' },
    { label: 'Язык', type: 'text' },
  ],
  generic: [
    { label: 'Состояние', type: 'text' }, { label: 'Цена', type: 'money' },
    { label: 'Где куплено', type: 'text' }, { label: 'Количество', type: 'number' },
  ],
};

// Пустые характеристики из шаблона категории — подставляются при создании вещи.
export function templateCharacteristics(category) {
  const tpl = CATEGORY_TEMPLATES[category] || CATEGORY_TEMPLATES.generic;
  return tpl.map(f => ({ label: f.label, value: '', type: f.type }));
}

export const ITEM_STATUSES = ['have', 'wishlist', 'lent', 'discarded'];
