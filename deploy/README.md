# Деплой

Сервер API на одном VPS в РФ (Timeweb или Selectel): Docker Compose поднимает API, PostgreSQL,
Caddy (HTTPS через Let's Encrypt) и ежедневные бэкапы базы с хранением 14 дней.

## Первый запуск

1. VPS с Ubuntu, установлен Docker (`curl -fsSL https://get.docker.com | sh`).
2. DNS: A-запись домена API (например, `api.example.com`) указывает на IP сервера.
3. Склонировать репозиторий, затем:

   ```bash
   cd deploy
   cp .env.example .env    # заполнить: домен, пароль базы, JWT_SECRET, ADMIN_TOKEN, SMTP
   docker compose up -d --build
   ```

4. Загрузить каталог упражнений (с любого компьютера с репозиторием):

   ```bash
   API_URL=https://api.example.com ADMIN_TOKEN=... pnpm catalog:import
   ```

5. В приложении адрес API задаётся в `apps/mobile/.env.local`: `EXPO_PUBLIC_API_URL=https://api.example.com`.

Миграции базы применяются самим сервером при старте.

## Обновление

```bash
git pull
cd deploy && docker compose up -d --build api
```

## Бэкапы

Каждый день в `deploy/backups/` появляется `mvp-ГГГГ-ММ-ДД.dump`, файлы старше 14 дней удаляются.
Папку стоит копировать и за пределы сервера (например, в объектное хранилище провайдера).

Восстановление:

```bash
docker compose exec -T postgres pg_restore -U mvp -d mvp --clean --if-exists < backups/mvp-2026-10-18.dump
```

## Логи

```bash
docker compose logs -f api
```
