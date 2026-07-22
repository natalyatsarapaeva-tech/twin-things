import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES, isValidRole, canEditItems, canManageCatalog,
  makeJoinCode, normalizeJoinCode, makeCatalogId, makeItemId,
  pickActiveCatalog, templateCharacteristics, CATEGORY_TEMPLATES,
  DEFAULT_CATEGORIES, ITEM_STATUSES,
} from '../js/catalog-core.js';

test('роли: owner и editor валидны, viewer пока нет', () => {
  assert.deepEqual(ROLES, ['owner', 'editor']);
  assert.ok(isValidRole('owner'));
  assert.ok(isValidRole('editor'));
  assert.ok(!isValidRole('viewer'));
  assert.ok(!isValidRole('nonsense'));
});

test('права: editor правит вещи, но не управляет каталогом', () => {
  assert.ok(canEditItems('owner'));
  assert.ok(canEditItems('editor'));
  assert.ok(canManageCatalog('owner'));
  assert.ok(!canManageCatalog('editor'));
});

test('joinCode: 6 символов из безопасного алфавита, без похожих', () => {
  for (let i = 0; i < 200; i++) {
    const code = makeJoinCode();
    assert.equal(code.length, 6);
    assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    assert.ok(!/[ILO01]/.test(code), `код ${code} содержит похожий символ`);
  }
});

test('normalizeJoinCode: верхний регистр, только буквы/цифры', () => {
  assert.equal(normalizeJoinCode(' ab-cd 12 '), 'ABCD12');
  assert.equal(normalizeJoinCode('xy_z!9'), 'XYZ9');
  assert.equal(normalizeJoinCode(null), '');
});

test('makeCatalogId: слаг + случайный хвост, кириллица сохраняется', () => {
  const id = makeCatalogId('Мой дом', () => 0.5);
  assert.match(id, /^мой-дом-/);
  // разные вызовы дают разные id
  let a = makeCatalogId('Дача', () => 0.1);
  let b = makeCatalogId('Дача', () => 0.9);
  assert.notEqual(a, b);
  // пустое имя не падает
  assert.match(makeCatalogId(''), /^каталог-/);
});

test('makeItemId: формат item-<ts>-<rand>', () => {
  const id = makeItemId(() => 1700000000000, () => 0.5);
  assert.match(id, /^item-1700000000000-[a-z0-9]+$/);
});

test('pickActiveCatalog: сохранённый если валиден, иначе первый, иначе null', () => {
  const cats = [{ id: 'a' }, { id: 'b' }];
  assert.equal(pickActiveCatalog(cats, 'b'), 'b');
  assert.equal(pickActiveCatalog(cats, 'zzz'), 'a'); // сохранённого нет в списке
  assert.equal(pickActiveCatalog(cats, null), 'a');
  assert.equal(pickActiveCatalog([], 'a'), null);
  assert.equal(pickActiveCatalog(null, 'a'), null);
});

test('templateCharacteristics: пары из шаблона, generic для незнакомой категории', () => {
  const el = templateCharacteristics('electronics');
  assert.equal(el.length, CATEGORY_TEMPLATES.electronics.length);
  assert.deepEqual(el[0], { label: 'Бренд', value: '', type: 'text' });
  assert.ok(el.some(f => f.type === 'money')); // «Цена»
  // незнакомая категория → generic
  const unknown = templateCharacteristics('spaceships');
  assert.deepEqual(unknown, templateCharacteristics('generic'));
});

test('дефолтная таксономия и статусы непусты и консистентны', () => {
  assert.ok(DEFAULT_CATEGORIES.length >= 3);
  assert.ok(DEFAULT_CATEGORIES.every(c => c.id && c.label));
  assert.ok(ITEM_STATUSES.includes('active'));
  assert.ok(ITEM_STATUSES.includes('for-sale') === false); // for-sale — это тег, не статус
});
