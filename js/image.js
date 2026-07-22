// Пайплайн фото Twin Things: сжатие на клиенте (основное ~1600px + превью ~300px).
// Основано на canvas-паттерне twin (add-task.html). Чистая математика масштаба
// (fitWithin) тестируется в Node; функции с canvas/DOM работают в браузере.

export const MAX_MAIN = 1600; // макс. сторона основного изображения
export const MAX_THUMB = 300; // макс. сторона превью для грида
export const JPEG_Q = 0.8;

// Чистая функция: вписать (w,h) в квадрат maxSide, сохранив пропорции.
// Не увеличивает изображения меньше maxSide. Возвращает целые пиксели.
export function fitWithin(w, h, maxSide) {
  if (!w || !h) return { w: 0, h: 0 };
  const scale = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

// ── Ниже — браузерный код (canvas/Image/File), в Node не вызывается ──────────

// Читает File → HTMLImageElement (dataURL). EXIF-ориентацию современные
// браузеры применяют к <img> автоматически при image-orientation:from-image.
export function fileToImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Рисует изображение в заданный максимум и отдаёт JPEG-Blob + размеры.
function drawToBlob(img, maxSide, quality) {
  const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve({ blob, w, h }), 'image/jpeg', quality);
  });
}

// Основной вход пайплайна: File → { main:{blob,w,h}, thumb:{blob,w,h} }.
export async function compressForUpload(file) {
  const img = await fileToImage(file);
  const main = await drawToBlob(img, MAX_MAIN, JPEG_Q);
  const thumb = await drawToBlob(img, MAX_THUMB, JPEG_Q);
  return { main, thumb };
}
