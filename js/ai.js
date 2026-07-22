// AI-импорт вещей (Wave 3, §9). Batch-паттерн twin: разбор → чек-лист → сохранить.
// Вызовы GPT-4o (текст + vision) идут через Cloudflare Worker `/ai` — прокси
// OpenAI (ключ на стороне воркера, в браузер не попадает). Origin github.io уже
// в allow-list воркера, так что отдельная настройка не нужна.
import { parseAiJsonArray, sanitizeAiItems } from './catalog-core.js';

// Тот же воркер, что у twin (task-intake-worker). Endpoint /ai — тонкий прокси:
// принимает payload OpenAI chat completions, возвращает ответ OpenAI.
export const AI_WORKER_URL = 'https://task-intake-worker.ntsarapaeva.workers.dev';

export async function gpt(payload) {
  const res = await fetch(`${AI_WORKER_URL}/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Ошибка ИИ (${res.status})`);
  return data;
}

// Системный промпт получает АКТУАЛЬНУЮ таксономию каталога (из meta/*, не хардкод)
// и требует «только JSON, категории/теги — только из предложенных id» (§9).
// photoCount>0 — vision-режим: просим у модели photoIndex, чтобы привязать одно
// фото к одной карточке (а не все фото ко всем).
function systemPrompt(categories, tags, photoCount = 0) {
  const cats = categories.map(c => `${c.id} (${c.label})`).join(', ') || 'generic (Разное)';
  const tg = tags.map(t => `${t.id} (${t.label})`).join(', ') || '—';
  const photoField = photoCount > 0 ? ',"photoIndex":<номер фото>' : '';
  const photoRule = photoCount > 0
    ? `\n- photoIndex — номер фотографии (0..${photoCount - 1}), на которой находится эта вещь. Фото переданы по порядку. Обычно одна вещь = одно фото; если на одном фото несколько вещей, у них одинаковый photoIndex.`
    : '';
  return `Ты помощник по учёту домашних вещей. Верни ТОЛЬКО JSON-массив, без markdown и пояснений:
[{"name":"...","description":"...","category":"<один id категории>","tags":["<id тегов>"],"characteristics":[{"label":"...","value":"...","type":"text|number|money|date|select"}]${photoField}}]

Правила:
- name — короткое название вещи на русском.
- category — РОВНО ОДИН id из списка: ${cats}. Если не уверен — "generic".
- tags — ноль или несколько id ТОЛЬКО из: ${tg}. Не выдумывай новых.
- characteristics — уместные известные факты (бренд, модель, цена, размер, материал…); значения на русском; для цены type "money", для дат "date", для чисел "number".${photoRule}
- Не добавляй категории или теги вне указанных id. Каждая распознанная вещь — отдельный объект массива.`;
}

const ids = (list) => (list || []).map(x => x.id);

// Текст/голос → черновики вещей (§8.2).
export async function aiItemsFromText(text, categories, tags) {
  const data = await gpt({
    model: 'gpt-4o', max_tokens: 2000, temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt(categories, tags) },
      { role: 'user', content: 'Список вещей:\n\n' + text },
    ],
  });
  const content = data.choices?.[0]?.message?.content || '';
  return sanitizeAiItems(parseAiJsonArray(content), { categoryIds: ids(categories), tagIds: ids(tags) });
}

// Фото → черновики вещей (§8.1, vision). base64List — JPEG без префикса data:.
export async function aiItemsFromPhotos(base64List, categories, tags) {
  const list = base64List || [];
  const images = list.map(b => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${b}`, detail: 'high' },
  }));
  const data = await gpt({
    model: 'gpt-4o', max_tokens: 2000, temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt(categories, tags, list.length) },
      { role: 'user', content: [...images, { type: 'text', text: 'Определи вещи на фото и верни JSON-массив. У каждой вещи укажи photoIndex — номер фото, на котором она есть.' }] },
    ],
  });
  const content = data.choices?.[0]?.message?.content || '';
  return sanitizeAiItems(parseAiJsonArray(content), {
    categoryIds: ids(categories), tagIds: ids(tags), photoCount: list.length,
  });
}
