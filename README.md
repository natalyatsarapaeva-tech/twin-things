# Twin Things 🏠

Совместный каталог домашних вещей: каждая вещь — карточка с фото, категорией,
тегами и характеристиками. Каталогов («баз») у пользователя может быть несколько,
в любой можно пригласить других людей с ролью. Ключевая фича — **массовое
создание вещей ИИ** по фото или тексту/голосу.

Статическое веб-приложение без сборки (vanilla JS ES-модули), архитектура
семейства **Twin**: хостинг на GitHub Pages, **отдельный** Firebase-проект
(Auth + Firestore + Storage), GPT-4o (текст + vision) через Cloudflare Worker `/ai`.

> **Статус: Wave 0 (каркас + доступ).** Полный план разработки — [`docs/PLAN.md`](docs/PLAN.md).
> Перед первым запуском выполни настройку — [`SETUP.md`](SETUP.md).

## Что уже есть (Wave 0)

| Файл | Назначение |
|---|---|
| `index.html` | Вход (Google + email/пароль), онбординг, свитчер каталогов, грид вещей |
| `styles.css` | Дизайн-система (перенесена из twin, палитра та же) |
| `js/firebase.js` | Инициализация Firebase (Firestore + Auth + Storage), `authReady` |
| `js/catalog-core.js` | **Чистая** логика: роли, коды приглашений, id, шаблоны характеристик |
| `js/store.js` | Auth + модель много-ко-многим: список каталогов, активный, онбординг, CRUD вещей |
| `js/image.js` | Пайплайн сжатия фото (canvas): основное ~1600px + превью ~300px |
| `voice.js` | Голосовой ввод EN/RU (перенесён из twin, как есть) |
| `pwa.js` / `sw.js` / `manifest.json` | PWA: офлайн-оболочка, установка |
| `firestore.rules` / `storage.rules` | Правила доступа по членству в каталоге (роли owner/editor) |
| `tests/*.test.mjs` | Тесты чистых модулей (`node --test`, без зависимостей) |

## Модель данных (Firestore)

```
users/{uid}                     — профиль {displayName, email, createdAt}
users/{uid}/catalogs/{cid}      — индекс «мои каталоги» {role, name, joinedAt}
catalogs/{cid}                  — {name, ownerUid, joinCode, createdAt}
catalogs/{cid}/members/{uid}    — ИСТОЧНИК ПРАВ {role, addedBy, joinedAt}
catalogs/{cid}/invites/{id}     — email-приглашения (Wave 2)
catalogs/{cid}/items/{id}       — карточки вещей
catalogs/{cid}/meta/*           — categories | tags | categoryTemplates
```

Роли MVP: **owner** (всё + участники + удаление каталога) и **editor** (полный
CRUD вещей/категорий/тегов/фото). Роль **viewer** (только чтение) — Wave 5.

Фото лежат в **Firebase Storage** по пути `catalogs/{cid}/items/{itemId}/{n}.jpg`
(+ `{n}_thumb.jpg`); в документе вещи — `{path, url, thumbUrl, isPrimary, w, h}`.

## Тесты и запуск

```bash
npm test       # node --test — чистые модули (catalog-core, image)
npm run serve  # локальный сервер; file:// не работает (ES-модули)
```

## Дальше

Роадмап по волнам (ядро каталога → совместный доступ → AI-импорт → организация →
умные фичи) — в [`docs/PLAN.md`](docs/PLAN.md), раздел 10.
