# Настройка Twin Things

Приложение статическое, но ему нужен **свой** Firebase-проект и (для AI)
Cloudflare Worker. Шаги, которые может сделать только владелец аккаунта.

## 1. Новый Firebase-проект (отдельный, НЕ natas-kitchen)

1. [Firebase Console](https://console.firebase.google.com/) → **Add project**
   (напр. `twin-things`).
2. **Build → Authentication → Get started** → Sign-in method → включить
   **Google** и **Email/Password**.
3. **Authentication → Settings → Authorized domains** → добавить
   `natalyatsarapaeva-tech.github.io` (и `localhost` для локальных тестов).
4. **Build → Firestore Database → Create database** (регион — ближайший).
5. **Build → Storage → Get started** (для фото вещей).
6. **Project settings → General → Your apps → Web (</>)** → скопировать
   `firebaseConfig` и вставить в [`js/firebase.js`](js/firebase.js) вместо
   `REPLACE_ME`.

## 2. Правила безопасности (ОБЯЗАТЕЛЬНО — иначе test mode = база открыта)

Урок Twin/Kitchen: без задеплоенных правил любой может читать и писать.

- **Firestore:** Console → Firestore Database → **Rules** → вставить содержимое
  [`firestore.rules`](firestore.rules) → Publish.
- **Storage:** Console → Storage → **Rules** → вставить содержимое
  [`storage.rules`](storage.rules) → Publish.

> Storage-правила читают Firestore (`firestore.exists(... /members/...)`) —
> убедись, что оба задеплоены, иначе доступ к фото не разрешится.

## 3. Индексы Firestore (по мере надобности)

- `collectionGroup('invites')` по полю `email` — понадобится в Wave 2 (экран
  входящих приглашений). Firestore подскажет ссылку на создание индекса при
  первом запросе.

## 4. Cloudflare Worker `/ai` (для AI-разбора — Wave 3)

Переиспользуем воркер twin (`worker/task-intake-worker.js`, эндпоинт `/ai` —
прокси OpenAI с проверкой Origin). Нужно лишь добавить **новый origin** в
`isAllowedOrigin`:

```js
origin === 'https://natalyatsarapaeva-tech.github.io'  // уже есть
// хост github.io общий для всех репо-страниц — отдельный origin для twin-things
// НЕ требуется; путь /twin-things/ различается, а Origin один.
```

То есть если Pages Twin Things живёт на том же `natalyatsarapaeva-tech.github.io`,
origin уже разрешён — можно переиспользовать существующий воркер как есть.
Секрет `OPENAI_API_KEY` — в Cloudflare (`wrangler secret put OPENAI_API_KEY`).

## 5. GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → `main` / root.
После первого мержа в `main` сайт будет на
`https://natalyatsarapaeva-tech.github.io/twin-things/`.

## 6. Иконки PWA

Положить `icons/icon-192.png` и `icons/icon-512.png` (можно временно взять из
twin). Без них приложение работает, но не устанавливается как PWA с иконкой.

---

## Проверка после настройки

1. `npm test` — чистые модули зелёные (не требует Firebase).
2. Открыть сайт → войти через Google → должен авто-создаться каталог «Мой дом»,
   появиться свитчер каталогов и пустой грид.
3. В свитчере создать второй каталог / присоединиться по коду — проверить, что
   активный каталог переключается и роль отображается.
