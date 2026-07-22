import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin, MAX_MAIN, MAX_THUMB } from '../js/image.js';

test('fitWithin: не увеличивает изображения меньше предела', () => {
  assert.deepEqual(fitWithin(800, 600, MAX_MAIN), { w: 800, h: 600 });
});

test('fitWithin: масштабирует по большей стороне, сохраняя пропорции', () => {
  // альбомная 4000x3000 → ширина 1600, высота 1200
  assert.deepEqual(fitWithin(4000, 3000, MAX_MAIN), { w: 1600, h: 1200 });
  // портретная 3000x4000 → высота 1600, ширина 1200
  assert.deepEqual(fitWithin(3000, 4000, MAX_MAIN), { w: 1200, h: 1600 });
});

test('fitWithin: превью ~300px', () => {
  assert.deepEqual(fitWithin(4000, 3000, MAX_THUMB), { w: 300, h: 225 });
});

test('fitWithin: нулевые/пустые размеры не падают', () => {
  assert.deepEqual(fitWithin(0, 0, MAX_MAIN), { w: 0, h: 0 });
  assert.deepEqual(fitWithin(undefined, 100, MAX_MAIN), { w: 0, h: 0 });
});
