# Тренировка без программы: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Запуск тренировки с главного экрана без программы, запись подходов таблицей и сохранение тренировки как программы.

**Architecture:** `program_id` и `program_day_id` у тренировки становятся необязательными, число задуманных подходов хранится в `session_exercises.planned_sets`. Логика добавляется в `data/sessions.ts`, общий маршрут `workout/[id]` показывает новый компонент `FreeWorkout`, если программы нет.

**Tech Stack:** Expo 58, React Native, expo-router, Drizzle (SQLite на телефоне, PostgreSQL на сервере), zod, Hono, vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-free-workout-design.md`

## Global Constraints

- Коммиты делаются только по просьбе пользователя, поэтому шагов с коммитом в плане нет.
- `pnpm typecheck`, `pnpm test`, `pnpm lint` проходят в конце работы.
- Новые тексты есть и в `ru.json`, и в `en.json`.
- Комментарии в коде на английском, в стиле соседнего кода.
- Обычная тренировка по программе не меняет поведения: существующие тесты проходят без правок, кроме вынужденных правок типов.

## Review Focus

1. Обновление телефона с идущей тренировкой и неотправленной очередью: строки на месте, очередь не выросла, новые записи в неё попадают.
2. Приложение закрыли посреди свободной тренировки: `activeSession` возвращает её, запись продолжается.
3. Упражнение убрали и выбрали снова: создаётся новая карточка, а не «воскресает» старая и не срабатывает запрет дублей.
4. Отмена подходов и уменьшение числа подходов: нельзя опуститься ниже сделанных, а при нуле сделанных ниже 1.
5. Свободная тренировка приходит на второй телефон: строка проходит проверку, `program_id` равен `null`, итоги открываются.

---

### Task 1: Схемы и миграции

**Files:**
- Modify: `packages/schemas/src/workouts.ts`, `packages/db/src/schema.ts:369-374,386-400`, `packages/db/src/sqlite/schema.ts:127-128,139-147`
- Create: новая миграция в `packages/db/drizzle`, две в `packages/db/drizzle-sqlite` (сгенерированная и custom с триггерами)
- Test: `packages/db/src/sqlite/migrations.test.ts`

**Interfaces:**
- Produces: `SessionRow.program_id: string | null`, `SessionRow.program_day_id: string | null`, `SessionExerciseRow.planned_sets: number | null` (`count.min(1).nullable()`).

- [ ] **Step 1: Написать падающие тесты в `migrations.test.ts`**

`it('keeps queuing workouts for the server after the sessions table was rebuilt')`: вставить в `sessions` строку с `program_id: null`, `program_day_id: null`; ожидать одну запись в `outbox` с `table_name: 'sessions'`; обновить строку и ожидать, что запись одна.

`it('keeps the rows of an older database')`: применить миграции из `localMigrations` только до тега `0005_activity_logs` на чистой базе better-sqlite3, вставить программу, тренировку и запись `outbox`, применить остальные; ожидать, что тренировка на месте, `outbox` не вырос, а индекс `sessions_status_idx` есть в `sqlite_master`.

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `pnpm --filter @mvp/db test`
Expected: FAIL: `NOT NULL constraint failed: sessions.program_id`.

- [ ] **Step 3: Изменить схемы и сгенерировать миграции**

Снять `.notNull()` с обоих полей `sessions` в двух схемах, убрать обязательность в zod, добавить `planned_sets` (`plannedSets` на сервере). Запустить `pnpm db:generate`. Затем `pnpm --filter @mvp/db exec drizzle-kit generate --custom --config drizzle.sqlite.config.ts --name restore_sessions_triggers`, скопировать в файл два блока `outbox_sessions_*` из `0002_sync_triggers.sql` с разделителем `--> statement-breakpoint`, снова запустить `pnpm db:generate`, чтобы обновить `migrations.generated.ts`.

- [ ] **Step 4: Запустить тесты**

Run: `pnpm --filter @mvp/db test`
Expected: PASS.

### Task 2: Синхронизация на сервере

**Files:**
- Modify: `apps/api/src/sync.ts:54-62,202-248,394-399`
- Test: `apps/api/test/offline.test.ts`

**Interfaces:**
- Consumes: типы из Task 1, `startFreeSession`, `addFreeExercise` из Task 3 (тест пишется после Task 3).
- Produces: `Handler.parent.id: (row) => string | null`.

- [ ] **Step 1: Написать падающий тест `'carries a workout without a program to another phone'`**

Первый телефон создаёт и завершает свободную тренировку с одним подходом, `runSync`; ожидать `pendingCount` равным 0. Второй телефон с тем же токеном делает `runSync`; ожидать `lastFinishedSession(second)` с `program_id: null`, `sessionSummary(second, id)` с одним упражнением и `planned_sets` из первого телефона.

`'does not take over a workout without a program of another user'`: чужой токен отправляет тренировку с тем же id; ожидать `rejected` с кодом `forbidden`.

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `pnpm --filter @mvp/api test -- offline`
Expected: FAIL: ошибка типа или `validation_error`.

- [ ] **Step 3: Реализовать**

В `upsert` строка с `parent.id(row) === null` считается верхнеуровневой: `parent = { ownerId: userId }`. Если строка уже принадлежит другому, срабатывает существующая проверка `existing?.ownerId`. У `sessions` `parent.id` возвращает `row.program_id`. `planned_sets` добавить в `toDb` и `fromDb` у `session_exercises`.

- [ ] **Step 4: Запустить тесты**

Run: `pnpm --filter @mvp/api test`
Expected: PASS.

### Task 3: Логика свободной тренировки

**Files:**
- Modify: `apps/mobile/src/data/sessions.ts`, `apps/mobile/src/data/history.ts:39-40`
- Test: `apps/mobile/src/data/sessions.test.ts`

**Interfaces:**
- Consumes: типы из Task 1.
- Produces, все в `data/sessions.ts`:
  - `startFreeSession(ctx: DataContext): SessionRow`
  - `addFreeExercise(ctx: DataContext, sessionId: string, exerciseId: string): SessionExerciseRow`
  - `removeFreeExercise(ctx: DataContext, sessionExerciseId: string): void`
  - `setPlannedSets(ctx: DataContext, sessionExerciseId: string, count: number): void`
  - `DEFAULT_FREE_SETS = 3`

- [ ] **Step 1: Написать падающие тесты, `describe('a workout without a program')`**

- `'starts empty, and a second start returns the same workout'`: `program_id` равен `null`, `activeSession` возвращает её, упражнений нет.
- `'adds an exercise once, with as many sets as the last time'`: первое добавление даёт `plannedSets` 3; повторное возвращает ту же строку; после завершённой тренировки с 4 подходами новая получает 4.
- `'adds an exercise again after it was removed'`: `removeFreeExercise`, затем `addFreeExercise`; одна живая карточка, `position` больше прежней.
- `'keeps an exercise that has sets'`: `removeFreeExercise` ничего не меняет.
- `'does not plan fewer sets than were done, nor less than one'`: 2 подхода, `setPlannedSets(…, 1)` даёт 2; без подходов `setPlannedSets(…, 0)` даёт 1.
- `'does not touch programs when finished'`: `getProgramState` и `listPrograms` те же, `nextWorkout` тот же, в `progression_state` пусто, `sessionSummary` отдаёт `offerDeload: false`, `plan: null`.
- `'is shown in the history and as the last time of a program workout'`: `listWorkouts` содержит её с `dayTitle: ''`, `lastPerformance` тренировки по программе показывает её подходы.

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `pnpm --filter @mvp/mobile test -- sessions`
Expected: FAIL: функции не определены.

- [ ] **Step 3: Реализовать функции и защиту от `null`**

`startSession` получает `planned_sets: null` у упражнений. `getSession`: `deload = session.program_id !== null && …`; `plannedSets` равен `exercise.planned_sets ?? (item ? … : 0)`. `finishSession`: после смены статуса при `program_id === null` или `program_day_id === null` возврат. `sessionSummary`: `sameDay` и `state` считаются только при наличии программы. `history.ts`: запросы дня и программы только при наличии идентификаторов. Число подходов из `lastPerformance(ctx, exerciseId, sessionId).length || DEFAULT_FREE_SETS`.

- [ ] **Step 4: Запустить тесты**

Run: `pnpm --filter @mvp/mobile test`
Expected: PASS.

### Task 4: Сохранение как программы

**Files:**
- Modify: `apps/mobile/src/data/sessions.ts`, `apps/mobile/src/app/workout/summary/[id].tsx`, `ru.json`, `en.json`
- Test: `apps/mobile/src/data/sessions.test.ts`

**Interfaces:**
- Consumes: `createProgram`, `addItem` из `data/programs.ts`.
- Produces: `saveSessionAsProgram(ctx: DataContext, sessionId: string, input: { title: string; dayTitle: string; params: (exerciseId: string) => ItemParams | null }): ProgramRow | null`.

- [ ] **Step 1: Написать падающие тесты**

- `'saves the exercises that were done, in order, with their number of sets'`: три упражнения, в одном нет подходов; `getProgramTree` даёт один день, два элемента в порядке тренировки, `sets` равно числу подходов, `rep_min` из `params`.
- `'skips an exercise the catalog does not know'`: `params` возвращает `null` для одного.
- `'leaves the workout free'`: `getSession(...).session.program_id` равен `null`, `exercises[i].exercise.program_item_id` равен `null`.
- `'saves nothing from a workout with a program or without sets'`: возвращает `null`, `listPrograms` не изменился.

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `pnpm --filter @mvp/mobile test -- sessions`
Expected: FAIL: функция не определена.

- [ ] **Step 3: Реализовать `saveSessionAsProgram`**

Транзакция: `createProgram`, `getProgramTree` для первого дня, `addItem` с `{ ...params, sets: число подходов }`.

- [ ] **Step 4: Запустить тесты**

Run: `pnpm --filter @mvp/mobile test`
Expected: PASS.

- [ ] **Step 5: Добавить блок на экран итогов**

Условие: `session.program_id === null && summary.exercises.some((entry) => entry.sets.length > 0)`. Поле `TextField`, значение по умолчанию `t('summary.saveDefaultTitle', { date })`, кнопка неактивна при пустом названии. `params` строится через `exerciseById` и `itemDefaults(exercise, null)`. После сохранения: `useActiveProgram.getState()`; если `id === null`, вызвать `set(program.id)`; локальное состояние `savedProgramId`, строка `summary.saved` и кнопка `summary.openProgram` на `/program/[id]`. Запись через существующий `change`. `startDeload` вызывается только при заданном `session.program_id`.

### Task 5: Экраны

**Files:**
- Create: `apps/mobile/src/components/free-workout.tsx`
- Modify: `apps/mobile/src/app/workout/[id].tsx:56-82`, `apps/mobile/src/app/(tabs)/index.tsx`, `apps/mobile/src/app/exercise-picker.tsx`, `apps/mobile/src/app/(tabs)/progress.tsx:191`, `apps/mobile/src/lib/report.ts:150`, `ru.json`, `en.json`
- Test: `apps/mobile/src/lib/report.test.ts`

**Interfaces:**
- Consumes: всё из Task 3, `afterSet` не нужен, `lastPerformance`, `logSet`, `recordsOfSet`, `removeLastSet`, `abandonSession`, `finishSession`, `CardioSet`, `RecordBanner`, `RestTimer`, `useRestTimer`.
- Produces: `FreeWorkout({ view }: { view: SessionView })`, ключи `workout.freeTitle`, `today.startFree`.

- [ ] **Step 1: Написать падающий тест в `report.test.ts`**

`'names a workout without a program'`: запись с `dayTitle: ''` в отчёте содержит текст `workout.freeTitle`.

- [ ] **Step 2: Запустить и убедиться в падении**

Run: `pnpm --filter @mvp/mobile test -- report`
Expected: FAIL.

- [ ] **Step 3: Подпись в отчёте и истории**

`workout.dayTitle || t('workout.freeTitle')` в `report.ts` и `progress.tsx`. Запустить тест, ожидать PASS.

- [ ] **Step 4: Главный экран**

Кнопка `today.startFree` (variant `secondary`) с `open(mutate(startFreeSession).id)` в карточке следующей тренировки и в пустой карточке. Кнопка в пустой карточке идёт после кнопки к программам.

- [ ] **Step 5: Выбор упражнения**

Параметр `sessionId` в `exercise-picker.tsx`: `mutate((ctx) => addFreeExercise(ctx, params.sessionId, exercise.id))`, затем `router.back()`.

- [ ] **Step 6: `FreeWorkout` и ветвление в `workout/[id].tsx`**

`Workout` проверяет `view.session.program_id === null` до расчётов и возвращает `<FreeWorkout view={view} />`. Компонент содержит список карточек из спецификации, таймер отдыха и баннер рекорда. Строка, уже сделанная, показывает значения; первая несделанная редактируется; остальные показывают подсказку серым. Галочка у сделанной строки активна только у последней. Завершение: при нуле подходов `abandonSession` и `router.back()`, иначе как в `Workout.finish`. Ввод веса в единицах пользователя, запятая принимается как разделитель.

- [ ] **Step 7: Проверка**

Run: `pnpm typecheck && pnpm test && pnpm lint`
Expected: без ошибок.

- [ ] **Step 8: Ручная проверка в браузере**

В окне 390×844 пройти: «Начать без программы», добавить упражнение с историей и без, заполнить подходы, изменить их число, отменить последний, убрать пустое упражнение, завершить, сохранить как программу, открыть её, запустить тренировку по ней и увидеть подставленный вес. Отдельно: завершить пустую тренировку, в итогах не должно быть ничего нового в истории.
