/* Twin Things — PWA bootstrap (не модуль; регистрирует service worker).
 * Web Push отложен до Wave 5 (напоминания о гарантии/сезонных вещах) —
 * тогда переиспользуем VAPID-логику из twin/pwa.js.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  // Когда новый service worker берёт управление — перезагружаем страницу один
  // раз, чтобы сразу подтянулся свежий код (важно на iOS-PWA, где старый кэш
  // залипает; так обновлённый js/firebase.js применяется без ручной чистки).
  var reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.update(); // проверить обновление SW при каждом заходе
      // Если новый SW уже установлен и ждёт — активировать немедленно.
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      reg.addEventListener('updatefound', function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', function () {
          if (sw.state === 'installed' && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
      });
    }).catch(function (err) {
      console.warn('[pwa] sw registration failed:', err);
    });
  });
})();
