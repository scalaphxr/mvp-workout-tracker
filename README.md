# MVP – трекер тренировок

Монорепозиторий (pnpm + Turborepo). Полное ТЗ – в файле `ТЗ MVP – трекер тренировок (Android + iOS).md`.

```
apps/
  mobile/     Expo-приложение (React Native, Expo Router)
  api/        Hono-сервер
packages/
  domain/     бизнес-логика, общая для телефона и сервера
  schemas/    Zod-схемы запросов и ответов API
  db/         схема Drizzle для PostgreSQL и миграции
```

## Запуск

Нужны Node.js 20.19.4+ (лучше 22) и pnpm (`corepack enable pnpm`).

```bash
pnpm install
pnpm dev:api      # API на http://localhost:3000
pnpm dev:mobile   # Expo: w – браузер, a – Android, QR – телефон
```

- **База.** Без настроек API работает на PGlite – PostgreSQL внутри процесса, данные лежат в
  `apps/api/.data`. Для настоящего PostgreSQL: `docker compose up -d` и `DATABASE_URL` в
  `apps/api/.env` (пример – `apps/api/.env.example`). Миграции применяются при старте сервера.
- **Почта.** Пока не задан `SMTP_URL`, код для входа печатается в консоль сервера.
- **Адрес API для телефона** задаётся в `apps/mobile/.env.local` (пример – `apps/mobile/.env.example`).

## Проверки

```bash
pnpm typecheck
pnpm lint
pnpm test
```

После изменения `packages/db/src/schema.ts` – `pnpm db:generate`, новая миграция появится в
`packages/db/drizzle`.
