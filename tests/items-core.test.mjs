import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeItem, parseMoney, formatMoney, itemValue, catalogStats, primaryPhoto,
  filterItems, sortItems, SORT_OPTIONS, labelOf, collectLocations,
  slugifyLabel, addTaxonomyEntry, statusLabel, FOR_SALE_TAG,
} from '../js/catalog-core.js';

const fixedNow = () => '2024-03-10T00:00:00.000Z';
const fixedId = () => 'item-fixed';

test('makeItem: дефолты, шаблон характеристик по категории, тримминг имени', () => {
  const it = makeItem({ name: '  Дрель Bosch  ', category: 'electronics' }, fixedNow, fixedId);
  assert.equal(it.id, 'item-fixed');
  assert.equal(it.name, 'Дрель Bosch');
  assert.equal(it.category, 'electronics');
  assert.equal(it.status, 'active');
  assert.equal(it.quantity, 1);
  assert.equal(it.source, 'manual');
  assert.equal(it.createdAt, fixedNow());
  assert.equal(it.updatedAt, fixedNow());
  // характеристики подставлены из шаблона electronics
  assert.ok(it.characteristics.some(c => c.label === 'Бренд' && c.value === ''));
});

test('makeItem: неизвестный статус чинится на have, свои характеристики сохраняются', () => {
  const chars = [{ label: 'Цвет', value: 'синий', type: 'text' }];
  const it = makeItem({ name: 'X', status: 'nonsense', characteristics: chars }, fixedNow, fixedId);
  assert.equal(it.status, 'active');
  assert.deepEqual(it.characteristics, chars);
  assert.equal(it.category, 'generic');
});

test('parseMoney: разные форматы', () => {
  assert.equal(parseMoney('3500'), 3500);
  assert.equal(parseMoney('3 500 ₽'), 3500);
  assert.equal(parseMoney('3,500'), 3500);
  assert.equal(parseMoney('3.500,50'), 3500.5); // европейский формат
  assert.equal(parseMoney('1234.56'), 1234.56);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(null), null);
  assert.equal(parseMoney('нет цены'), null);
});

test('formatMoney: округление и разделители', () => {
  assert.equal(formatMoney(0), '0');
  assert.equal(formatMoney(NaN), '0');
  assert.equal(typeof formatMoney(1234567), 'string');
});

test('itemValue: первая money-характеристика × количество', () => {
  const it = makeItem({
    name: 'A', quantity: 3,
    characteristics: [
      { label: 'Бренд', value: 'X', type: 'text' },
      { label: 'Цена', value: '1000 ₽', type: 'money' },
    ],
  }, fixedNow, fixedId);
  assert.equal(itemValue(it), 3000);
  // без money-характеристики — 0
  const it2 = makeItem({ name: 'B', characteristics: [{ label: 'Цвет', value: 'синий', type: 'text' }] });
  assert.equal(itemValue(it2), 0);
});

test('catalogStats: количество, суммарная ценность, на продажу', () => {
  const items = [
    makeItem({ name: 'A', tags: [FOR_SALE_TAG], characteristics: [{ label: 'Цена', value: '500', type: 'money' }] }),
    makeItem({ name: 'B', quantity: 2, characteristics: [{ label: 'Цена', value: '1000', type: 'money' }] }),
    makeItem({ name: 'C', tags: ['fragile'] }),
  ];
  const s = catalogStats(items);
  assert.equal(s.count, 3);
  assert.equal(s.totalValue, 500 + 2000);
  assert.equal(s.forSale, 1);
  assert.deepEqual(catalogStats([]), { count: 0, totalValue: 0, forSale: 0 });
});

test('primaryPhoto: isPrimary приоритетнее, иначе первое, иначе null', () => {
  assert.equal(primaryPhoto({ photos: [] }), null);
  assert.equal(primaryPhoto({}), null);
  const p1 = { url: 'a' }, p2 = { url: 'b', isPrimary: true };
  assert.equal(primaryPhoto({ photos: [p1, p2] }), p2);
  assert.equal(primaryPhoto({ photos: [p1] }), p1);
});

test('filterItems: категория, тег, статус, локация, текст', () => {
  const items = [
    makeItem({ name: 'Дрель', category: 'tools', tags: ['for-sale'], location: 'Гараж' }),
    makeItem({ name: 'Диван', category: 'furniture', location: 'Гостиная', status: 'spare' }),
    makeItem({ name: 'Молоток', category: 'tools', location: 'Гараж / полка 2' }),
  ];
  assert.equal(filterItems(items, { category: 'tools' }).length, 2);
  assert.equal(filterItems(items, { tag: 'for-sale' }).length, 1);
  assert.equal(filterItems(items, { status: 'spare' }).length, 1);
  assert.equal(filterItems(items, { location: 'гараж' }).length, 2);
  assert.equal(filterItems(items, { text: 'молот' }).length, 1);
  // пустые фильтры → всё
  assert.equal(filterItems(items, {}).length, 3);
  // статус по умолчанию have
  assert.equal(filterItems(items, { status: 'active' }).length, 2);
});

test('filterItems: текст ищет по характеристикам', () => {
  const items = [
    makeItem({ name: 'Дрель', characteristics: [{ label: 'Бренд', value: 'Bosch', type: 'text' }] }),
    makeItem({ name: 'Диван' }),
  ];
  assert.equal(filterItems(items, { text: 'bosch' }).length, 1);
});

test('sortItems: newest/oldest/name/value', () => {
  const a = makeItem({ name: 'Яблоко', createdAt: '2024-01-01T00:00:00Z', characteristics: [{ label: 'Цена', value: '10', type: 'money' }] });
  const b = makeItem({ name: 'Банан', createdAt: '2024-06-01T00:00:00Z', characteristics: [{ label: 'Цена', value: '100', type: 'money' }] });
  assert.equal(sortItems([a, b], 'newest')[0], b);
  assert.equal(sortItems([a, b], 'oldest')[0], a);
  assert.equal(sortItems([a, b], 'name')[0], b); // Банан < Яблоко
  assert.equal(sortItems([a, b], 'value')[0], b); // 100 > 10
  // не мутирует вход
  const src = [a, b];
  sortItems(src, 'name');
  assert.deepEqual(src, [a, b]);
  assert.ok(SORT_OPTIONS.length >= 3);
});

test('labelOf / collectLocations', () => {
  const cats = [{ id: 'tools', label: 'Инструменты' }];
  assert.equal(labelOf(cats, 'tools'), 'Инструменты');
  assert.equal(labelOf(cats, 'unknown'), 'unknown'); // фолбэк на id
  const items = [
    makeItem({ name: 'A', location: 'Гараж' }),
    makeItem({ name: 'B', location: 'Гараж' }),
    makeItem({ name: 'C', location: '' }),
    makeItem({ name: 'D', location: 'Кухня' }),
  ];
  assert.deepEqual(collectLocations(items), ['Гараж', 'Кухня']);
});

test('slugifyLabel: транслит кириллицы и латиница', () => {
  assert.equal(slugifyLabel('Электроника'), 'elektronika');
  assert.equal(slugifyLabel('For Sale!'), 'for-sale');
  assert.equal(slugifyLabel('   '), 'item'); // фолбэк
});

test('addTaxonomyEntry: уникальный id, тримминг, пустое отклоняется', () => {
  let list = [{ id: 'toys', label: 'Игрушки' }];
  const r1 = addTaxonomyEntry(list, '  Книги  ');
  assert.equal(r1.entry.label, 'Книги');
  assert.equal(r1.entry.id, 'knigi');
  assert.equal(r1.list.length, 2);
  // коллизия id → суффикс
  const r2 = addTaxonomyEntry([{ id: 'knigi', label: 'X' }], 'Книги');
  assert.equal(r2.entry.id, 'knigi-2');
  // пустое
  const r3 = addTaxonomyEntry(list, '   ');
  assert.equal(r3.entry, null);
  assert.equal(r3.list, list);
});

test('statusLabel: известные статусы переводятся', () => {
  assert.equal(statusLabel('active'), 'Актуально');
  assert.equal(statusLabel('giveaway'), 'Отдать');
  assert.equal(statusLabel('weird'), 'weird');
});
