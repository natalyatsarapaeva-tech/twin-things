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

// ── Статусы вещи ────────────────────────────────────────────────────────────
export const ITEM_STATUSES = ['have', 'wishlist', 'lent', 'discarded'];
export const STATUS_LABELS = {
  have: 'В наличии', wishlist: 'Вишлист', lent: 'Отдано/одолжено', discarded: 'Списано',
};
export function statusLabel(status) { return STATUS_LABELS[status] || status || 'В наличии'; }

// Тег «на продажу» — сквозной, используется для статистики (не путать со статусом).
export const FOR_SALE_TAG = 'for-sale';

// ── Фабрика документа вещи (§5.1) ───────────────────────────────────────────
// Чистая: id/время подаются извне, чтобы тестировалось детерминированно.
export function makeItem(fields = {}, now = () => new Date().toISOString(), idFn = makeItemId) {
  const ts = now();
  const category = fields.category || 'generic';
  return {
    id: fields.id || idFn(),
    name: (fields.name || '').trim(),
    description: fields.description || '',
    category,
    tags: Array.isArray(fields.tags) ? fields.tags : [],
    characteristics: Array.isArray(fields.characteristics)
      ? fields.characteristics
      : templateCharacteristics(category),
    photos: Array.isArray(fields.photos) ? fields.photos : [],
    location: fields.location || '',
    quantity: Number.isFinite(fields.quantity) ? fields.quantity : 1,
    status: ITEM_STATUSES.includes(fields.status) ? fields.status : 'have',
    source: fields.source || 'manual',
    aiGenerated: !!fields.aiGenerated,
    createdBy: fields.createdBy || null,
    createdAt: fields.createdAt || ts,
    updatedAt: ts,
  };
}

// ── Деньги ──────────────────────────────────────────────────────────────────
// Достаёт число из значения характеристики: "3 500 ₽", "3,500.50" → 3500 / 3500.5.
export function parseMoney(value) {
  if (value == null) return null;
  const raw = String(value).replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!raw) return null;
  const hasDot = raw.includes('.'), hasComma = raw.includes(',');
  let normalized;
  if (hasDot && hasComma) {
    // Оба разделителя: последний — десятичный, остальные — группировочные.
    const lastSep = Math.max(raw.lastIndexOf('.'), raw.lastIndexOf(','));
    normalized = raw.slice(0, lastSep).replace(/[.,]/g, '') + '.' + raw.slice(lastSep + 1).replace(/[.,]/g, '');
  } else if (hasDot || hasComma) {
    const sep = hasDot ? '.' : ',';
    const parts = raw.split(sep);
    // Один разделитель, за которым ровно 3 цифры → группировочный (тысячи).
    const grouping = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    normalized = grouping ? raw.replace(/[.,]/g, '') : raw.replace(sep, '.');
  } else {
    normalized = raw;
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

// Формат для отображения суммарной ценности (без валюты — валюта у характеристики).
export function formatMoney(n) {
  if (!Number.isFinite(n)) return '0';
  return Math.round(n).toLocaleString('ru-RU');
}

// Цена одной вещи = первая money-характеристика × количество.
export function itemValue(item) {
  const chars = item?.characteristics || [];
  const priceChar = chars.find(c => c.type === 'money' && parseMoney(c.value) != null);
  const unit = priceChar ? parseMoney(priceChar.value) : 0;
  const qty = Number.isFinite(item?.quantity) ? item.quantity : 1;
  return (unit || 0) * qty;
}

// ── Статистика каталога (хедер index.html) ──────────────────────────────────
export function catalogStats(items = []) {
  let totalValue = 0, forSale = 0;
  for (const it of items) {
    totalValue += itemValue(it);
    if ((it.tags || []).includes(FOR_SALE_TAG)) forSale += 1;
  }
  return { count: items.length, totalValue, forSale };
}

// ── Обложка вещи ────────────────────────────────────────────────────────────
export function primaryPhoto(item) {
  const photos = item?.photos || [];
  return photos.find(p => p.isPrimary) || photos[0] || null;
}

// ── Фильтрация и поиск ──────────────────────────────────────────────────────
// filters = { text?, category?, tag?, status?, location? }. Пустые поля игнорятся.
export function filterItems(items = [], filters = {}) {
  const text = (filters.text || '').trim().toLowerCase();
  const loc = (filters.location || '').trim().toLowerCase();
  return items.filter(it => {
    if (filters.category && it.category !== filters.category) return false;
    if (filters.status && (it.status || 'have') !== filters.status) return false;
    if (filters.tag && !(it.tags || []).includes(filters.tag)) return false;
    if (loc && !String(it.location || '').toLowerCase().includes(loc)) return false;
    if (text && !matchesText(it, text)) return false;
    return true;
  });
}

function matchesText(item, text) {
  if (String(item.name || '').toLowerCase().includes(text)) return true;
  if (String(item.description || '').toLowerCase().includes(text)) return true;
  if (String(item.location || '').toLowerCase().includes(text)) return true;
  return (item.characteristics || []).some(c =>
    String(c.value || '').toLowerCase().includes(text) ||
    String(c.label || '').toLowerCase().includes(text));
}

// ── Сортировка ──────────────────────────────────────────────────────────────
export const SORT_OPTIONS = [
  { id: 'newest', label: 'Сначала новые' },
  { id: 'oldest', label: 'Сначала старые' },
  { id: 'name',   label: 'По названию' },
  { id: 'value',  label: 'По ценности' },
];

export function sortItems(items = [], key = 'newest') {
  const arr = items.slice();
  switch (key) {
    case 'oldest':
      return arr.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    case 'name':
      return arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    case 'value':
      return arr.sort((a, b) => itemValue(b) - itemValue(a));
    case 'newest':
    default:
      return arr.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }
}

// ── Резолв меток по id (категории/теги живут в meta/* как [{id,label}]) ──────
export function labelOf(list, id) {
  const found = (list || []).find(x => x.id === id);
  return found ? found.label : id;
}
// Уникальные непустые локации из вещей — для фильтра по локации.
export function collectLocations(items = []) {
  const seen = new Set();
  for (const it of items) {
    const loc = String(it.location || '').trim();
    if (loc) seen.add(loc);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, 'ru'));
}

// ── Хелперы для редактора таксономии (settings.html) ────────────────────────
// Слаг id из метки (латиница/цифры/дефис); кириллица транслитерируется грубо.
const TRANSLIT = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',
  м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',
  щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
export function slugifyLabel(label) {
  const lower = String(label || '').toLowerCase().trim();
  let out = '';
  for (const ch of lower) out += (TRANSLIT[ch] ?? ch);
  return out.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
}
// Добавляет запись {id,label} в список таксономии, гарантируя уникальный id.
export function addTaxonomyEntry(list, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) return { list, entry: null };
  const base = slugifyLabel(trimmed);
  let id = base, n = 2;
  const taken = new Set((list || []).map(x => x.id));
  while (taken.has(id)) id = `${base}-${n++}`;
  const entry = { id, label: trimmed };
  return { list: [...(list || []), entry], entry };
}

// ── AI-импорт: разбор и санитайзинг ответа модели (§9) ──────────────────────
// Типы виджетов характеристик (см. §5.2). Всё прочее приводим к 'text'.
export const CHAR_TYPES = ['text', 'number', 'money', 'date', 'select'];

// Убирает markdown-ограждение ```json … ``` вокруг ответа модели.
export function stripJsonFences(text) {
  return String(text || '').trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
}

// Достаёт JSON-массив из ответа модели. Фолбэк: вырезать первый [...] блок,
// если модель добавила лишний текст вокруг.
export function parseAiJsonArray(content) {
  const cleaned = stripJsonFences(content);
  try {
    const v = JSON.parse(cleaned);
    if (Array.isArray(v)) return v;
    if (v && Array.isArray(v.items)) return v.items;
  } catch (_) { /* попробуем вырезать массив ниже */ }
  const s = cleaned.indexOf('['), e = cleaned.lastIndexOf(']');
  if (s !== -1 && e > s) {
    try { const v = JSON.parse(cleaned.slice(s, e + 1)); if (Array.isArray(v)) return v; } catch (_) {}
  }
  return [];
}

// Приводит сырой ответ ИИ к чистым черновикам вещей, ограниченным таксономией
// каталога: категория — ровно один известный id (иначе 'generic'/первый), теги —
// только известные id, характеристики — пары {label,value,type} с валидным type.
export function sanitizeAiItems(raw, { categoryIds = [], tagIds = [] } = {}) {
  const cats = new Set(categoryIds);
  const tags = new Set(tagIds);
  const fallbackCat = cats.has('generic') ? 'generic' : (categoryIds[0] || 'generic');
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const r of arr) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.name || r.title || '').trim();
    if (!name) continue;
    const category = cats.has(r.category) ? r.category : fallbackCat;
    const itemTags = Array.isArray(r.tags) ? r.tags.filter(t => tags.has(t)) : [];
    const characteristics = (Array.isArray(r.characteristics) ? r.characteristics : [])
      .map(c => ({
        label: String(c?.label || '').trim(),
        value: String(c?.value ?? '').trim(),
        type: CHAR_TYPES.includes(c?.type) ? c.type : 'text',
      }))
      .filter(c => c.label || c.value);
    out.push({ name, description: String(r.description || '').trim(), category, tags: itemTags, characteristics });
  }
  return out;
}
