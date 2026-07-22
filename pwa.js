/* Twin Things — PWA bootstrap (не модуль; регистрирует service worker).
 * Web Push отложен до Wave 5 (напоминания о гарантии/сезонных вещах) —
 * тогда переиспользуем VAPID-логику из twin/pwa.js.
 */
(function () {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('[pwa] sw registration failed:', err);
      });
    });
  }
})();
