import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripJsonFences, parseAiJsonArray, sanitizeAiItems, CHAR_TYPES,
  parseAiJsonObject, sanitizeAiDescription,
} from '../js/catalog-core.js';

test('stripJsonFences: убирает ```json и ``` ограждение', () => {
  assert.equal(stripJsonFences('```json\n[1,2]\n```'), '[1,2]');
  assert.equal(stripJsonFences('```\n{"a":1}\n```'), '{"a":1}');
  assert.equal(stripJsonFences('  [1]  '), '[1]');
});

test('parseAiJsonArray: чистый массив, обёрнутый в текст, объект-обёртка', () => {
  assert.deepEqual(parseAiJsonArray('[{"name":"A"}]'), [{ name: 'A' }]);
  assert.deepEqual(parseAiJsonArray('```json\n[{"name":"B"}]\n```'), [{ name: 'B' }]);
  // лишний текст вокруг — вырезаем первый массив
  assert.deepEqual(parseAiJsonArray('Вот вещи: [{"name":"C"}]. Готово.'), [{ name: 'C' }]);
  // объект с полем items
  assert.deepEqual(parseAiJsonArray('{"items":[{"name":"D"}]}'), [{ name: 'D' }]);
  // мусор → пустой массив
  assert.deepEqual(parseAiJsonArray('не json'), []);
  assert.deepEqual(parseAiJsonArray(''), []);
});

test('sanitizeAiItems: категория ограничена id каталога, иначе generic', () => {
  const opts = { categoryIds: ['electronics', 'generic'], tagIds: ['for-sale'] };
  const raw = [
    { name: 'Дрель', category: 'electronics', tags: ['for-sale', 'unknown'] },
    { name: 'Штука', category: 'spaceship' }, // неизвестная категория → generic
  ];
  const out = sanitizeAiItems(raw, opts);
  assert.equal(out.length, 2);
  assert.equal(out[0].category, 'electronics');
  assert.deepEqual(out[0].tags, ['for-sale']); // unknown отброшен
  assert.equal(out[1].category, 'generic');
});

test('sanitizeAiItems: фолбэк категории — первый id, если нет generic', () => {
  const out = sanitizeAiItems([{ name: 'X', category: 'nope' }], { categoryIds: ['tools', 'books'] });
  assert.equal(out[0].category, 'tools');
});

test('sanitizeAiItems: пустые имена отбрасываются, title как алиас name', () => {
  const out = sanitizeAiItems([
    { name: '   ' }, { title: 'Из title' }, { description: 'без имени' },
  ], { categoryIds: ['generic'] });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Из title');
});

test('sanitizeAiItems: характеристики — валидный type, пустые пары отброшены', () => {
  const out = sanitizeAiItems([{
    name: 'A', characteristics: [
      { label: 'Цена', value: '3500', type: 'money' },
      { label: 'Бренд', value: 'Bosch', type: 'weird' }, // невалидный тип → text
      { label: '', value: '' }, // пустая → отброшена
      'мусор',
    ],
  }], { categoryIds: ['generic'] });
  assert.equal(out[0].characteristics.length, 2);
  assert.deepEqual(out[0].characteristics[0], { label: 'Цена', value: '3500', type: 'money' });
  assert.equal(out[0].characteristics[1].type, 'text');
  assert.ok(CHAR_TYPES.includes('money') && CHAR_TYPES.includes('date'));
});

test('sanitizeAiItems: photoIndex — целое в диапазоне [0,photoCount), иначе нет поля', () => {
  const opts = { categoryIds: ['generic'], photoCount: 3 };
  const out = sanitizeAiItems([
    { name: 'A', photoIndex: 0 },
    { name: 'B', photoIndex: 2 },
    { name: 'C', photoIndex: 5 },   // вне диапазона → отброшен
    { name: 'D', photoIndex: -1 },  // отрицательный → отброшен
    { name: 'E' },                  // нет поля
    { name: 'F', photoIndex: 1.5 }, // не целое → отброшен
  ], opts);
  assert.equal(out[0].photoIndex, 0);
  assert.equal(out[1].photoIndex, 2);
  assert.ok(!('photoIndex' in out[2]));
  assert.ok(!('photoIndex' in out[3]));
  assert.ok(!('photoIndex' in out[4]));
  assert.ok(!('photoIndex' in out[5]));
  // без photoCount — любой валидный неотрицательный целый проходит
  const noCount = sanitizeAiItems([{ name: 'X', photoIndex: 9 }], { categoryIds: ['generic'] });
  assert.equal(noCount[0].photoIndex, 9);
});

test('sanitizeAiItems: не-массив на входе → пустой результат', () => {
  assert.deepEqual(sanitizeAiItems(null, {}), []);
  assert.deepEqual(sanitizeAiItems({}, {}), []);
  assert.deepEqual(sanitizeAiItems('строка', {}), []);
});

test('parseAiJsonObject: объект, обёртка, массив→первый, мусор→{}', () => {
  assert.deepEqual(parseAiJsonObject('{"description":"A"}'), { description: 'A' });
  assert.deepEqual(parseAiJsonObject('```json\n{"description":"B"}\n```'), { description: 'B' });
  assert.deepEqual(parseAiJsonObject('текст {"description":"C"} хвост'), { description: 'C' });
  assert.deepEqual(parseAiJsonObject('[{"description":"D"}]'), { description: 'D' });
  assert.deepEqual(parseAiJsonObject('не json'), {});
});

test('sanitizeAiDescription: описание + характеристики + теги из id', () => {
  const raw = {
    description: '  Синяя куртка  ',
    characteristics: [
      { label: 'Цвет', value: 'синий', type: 'text' },
      { label: 'Цена', value: '2000', type: 'money' },
      { label: '', value: '' },
    ],
    tags: ['seasonal', 'unknown'],
  };
  const out = sanitizeAiDescription(raw, { tagIds: ['seasonal', 'fragile'] });
  assert.equal(out.description, 'Синяя куртка');
  assert.equal(out.characteristics.length, 2);
  assert.deepEqual(out.tags, ['seasonal']); // unknown отброшен
  // мусор на входе → безопасные пустые значения
  assert.deepEqual(sanitizeAiDescription(null, {}), { description: '', characteristics: [], tags: [] });
});
