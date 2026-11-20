# Прокачка выбранных мышц: план реализации

> **For agentic workers:** implement this plan task-by-task, in order. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Человек выбирает мышцы и получает разовую тренировку или программу с упором на них, а упражнения разложены по категориям.

**Architecture:** Вся логика подбора – чистые функции в `packages/domain/src/focus.ts`. `generateProgram` и шаблоны не меняются: `applyFocus` работает с готовым черновиком. Телефон получает экран выбора, предпросмотр тренировки, режим анкеты и ряд категорий в общем `ExerciseBrowser`.

**Tech Stack:** TypeScript, Expo Router, React Native, zustand, Drizzle (SQLite), vitest.

**Spec:** `docs/superpowers/specs/2026-11-02-muscle-focus-design.md`

## Global Constraints

- Без миграций, без изменений сервера, шаблонов и `generation.ts`.
- Новых npm-пакетов нет.
- React Compiler включён: `memo`, `useMemo`, `useCallback` вручную не добавлять.
- Весь текст интерфейса в `ru.json` и `en.json`, правила текстов – как в существующих строках.
- Цвета и отступы только из `apps/mobile/src/constants/theme.ts`.
- Коммиты не делаются: пользователь их не просил.

## Review Focus

1. Зал без подходящих упражнений для всех выбранных мышц: «Начать» недоступна, экран не падает. Тест: `planFocusWorkout` возвращает пустой `items`, а все мышцы в `dropped` (задача 2).
2. Упражнение с двумя основными выбранными мышцами не дублируется ни в тренировке, ни в дне программы. Тесты в задачах 2 и 3.
3. Запуск разовой тренировки, когда другая уже идёт: упражнения не добавляются в чужую тренировку. Тест в задаче 4.
4. Сохранённые ответы анкеты с `duration_min: 30` в режиме упора дают 45. Тест `focusAnswers` в задаче 3.
5. После выбора категории фильтр мышц и счётчик фильтров согласованы: категория считается за один фильтр, а смесь мышц из разных групп – поштучно. Тест в задаче 5.

---

### Задача 1: Категории и фиксация обычной анкеты

**Files:**
- Create: `packages/domain/src/focus.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/content/src/focus.test.ts`

**Interfaces:**
- Produces: `MUSCLE_CATEGORIES`, `type MuscleCategory`, `categoryOfMuscles(muscles: readonly string[]): MuscleCategory | null` – категория, если все мышцы из неё; пустой список – `null`.

- [ ] **Шаг 1: Написать тест-снимок.** В `packages/content/src/focus.test.ts`: `generateProgram` на настоящем каталоге для всех сочетаний уровня, частоты, длительности и полного зала, `toMatchSnapshot()`. Снимок создаётся до любых правок домена, он и есть записанный заранее результат.
- [ ] **Шаг 2: Запустить.** `pnpm --filter @mvp/content test` – снимок записан, тест прошёл.
- [ ] **Шаг 3: Написать тест категорий:** каждая мышца каталога входит ровно в одну категорию; `categoryOfMuscles(['biceps', 'triceps']) === 'arms'`; `categoryOfMuscles(['biceps', 'chest']) === null`; `categoryOfMuscles([]) === null`.
- [ ] **Шаг 4: Реализовать** значения `MUSCLE_CATEGORIES` из спецификации и экспорт из индекса.
- [ ] **Шаг 5: Запустить.** `pnpm --filter @mvp/content test` – PASS.

### Задача 2: Подбор и разовая тренировка

**Files:**
- Modify: `packages/domain/src/focus.ts`
- Test: `packages/domain/src/focus.test.ts`

**Interfaces:**
- Produces:
  - `interface FocusContext { exercises; equipment: ReadonlySet<string> | null; level: Level; known: ReadonlySet<string> }`
  - `rankForMuscle(muscle: string, ctx: FocusContext): Exercise[]`
  - `pickVaried(ranked: readonly Exercise[], count: number, taken: ReadonlySet<string>): Exercise[]` – отбор с разными `movement_pattern`
  - `planFocusWorkout(muscles: string[], durationMin: number, ctx: FocusContext): FocusWorkoutPlan`
  - `MAX_SETS_PER_MUSCLE = 12`

- [ ] **Шаг 1: Написать падающие тесты** на маленьких упражнениях-заготовках:
  - `rankForMuscle`: только основная мышца; без `cardio` и `stretch`; `time` только для `abs` и `obliques` при `kind === 'timed'`; нет упражнений без оборудования; `equipment: null` не фильтрует; новичку нет `advanced`; порядок: базовые, знакомые, популярные, `slug`.
  - `pickVaried`: сначала разные паттерны, повтор только когда других нет.
  - `planFocusWorkout`: 60 минут, одна мышца – 12 подходов; 60 минут, две мышцы – по 8; 90 минут, три мышцы – 9, 9 и 8 подходов (лимит 26); 30 минут, четыре мышцы – две в `dropped`; упражнений мало – `short: true`; упражнение с двумя выбранными мышцами один раз; базовые идут раньше изолирующих; зал без упражнений – пустой `items`, все мышцы в `dropped`, `short: false`.
- [ ] **Шаг 2: Запустить.** `pnpm --filter @mvp/domain test` – FAIL, функций нет.
- [ ] **Шаг 3: Реализовать** по разделам «Подбор» и «Разовая тренировка» спецификации. Число упражнений на мышцу: `Math.round(sets / 3)`, не меньше 1, подходы делятся поровну, не больше 4 на упражнение.
- [ ] **Шаг 4: Запустить.** `pnpm --filter @mvp/domain test` – PASS.

### Задача 3: Программа с упором

**Files:**
- Modify: `packages/domain/src/focus.ts`
- Test: `packages/domain/src/focus.test.ts`, `packages/content/src/focus.test.ts`

**Interfaces:**
- Consumes: `DraftProgram`, `defaultItemParams`, `sessionSetCap`, задача 2.
- Produces:
  - `FOCUS_WEEKLY_SETS: Record<Level, number>` – 12, 16, 20
  - `FOCUS_MIN_DURATION = 45`
  - `interface FocusedItem extends Omit<DraftItem, 'group'> { group: MuscleGroup | null }` – отдельный тип вместо правки `DraftItem`, чтобы `generation.ts` не менялся
  - `interface FocusedDraft extends Omit<DraftProgram, 'days'> { days: { key: string; items: FocusedItem[] }[]; focus_weekly_sets: Record<string, number>; dropped: string[]; short: string[] }`
  - `applyFocus(draft: DraftProgram, muscles: string[], answers: Answers, ctx: FocusContext): FocusedDraft`
  - `focusAnswers(answers: Answers): Answers` – `duration_min: 30` заменяется на 45

- [ ] **Шаг 1: Написать падающие тесты.** В `packages/domain/src/focus.test.ts` на заготовках: `focusAnswers`; упражнение с двумя выбранными мышцами не дублируется в дне; мышца без упражнений – в `dropped`; мышца с нехваткой – в `short`; `applyFocus` не меняет переданный черновик.
- [ ] **Шаг 2: Написать падающие проверки в `packages/content/src/focus.test.ts`** на настоящем каталоге: все уровни, все частоты, 45–90 минут, пары `['biceps']`, `['biceps','traps']`, `['side_delts','calves']`, `['chest','lats']`, `['quads','glutes']`, `['forearms']`, полный зал. Для каждого сочетания – все проверки из раздела «Проверка» спецификации. Отдельно: домашний зал и зал без оборудования.
- [ ] **Шаг 3: Запустить.** `pnpm --filter @mvp/content test` и `pnpm --filter @mvp/domain test` – FAIL.
- [ ] **Шаг 4: Реализовать** по разделу `applyFocus` спецификации. Группа упражнения: `MUSCLE_TO_GROUP` (ягодицы – `hamstrings`, приводящие – `quads`, поясница и остальная спина – `back`, дельты – `shoulders`, пресс и косые – `core`, трапеции и предплечья – `null`). Для обычных упражнений группа остаётся из черновика.
- [ ] **Шаг 5: Запустить.** Те же команды – PASS. Если проверка из спецификации не выполняется на каком-то сочетании, сначала разобраться в причине, а не ослаблять проверку.

### Задача 4: Данные на телефоне

**Files:**
- Modify: `apps/mobile/src/data/sessions.ts`, `apps/mobile/src/lib/preferences.ts`
- Test: `apps/mobile/src/data/sessions.test.ts`

**Interfaces:**
- Produces:
  - `addFreeExercise(ctx, sessionId, exerciseId, plannedSets?: number): SessionExerciseRow`
  - `startFocusSession(ctx: DataContext, items: readonly { exercise_id: string; sets: number }[]): SessionRow`
  - `knownExercises(ctx: DataContext): Set<string>`
  - `Preferences.lastAnswers: Answers | null`, по умолчанию `null`

- [ ] **Шаг 1: Написать падающие тесты:** `startFocusSession` создаёт свободную тренировку с упражнениями в заданном порядке и с заданными `planned_sets`; при идущей тренировке возвращает её, а её упражнения не меняются; `addFreeExercise` без `plannedSets` берёт прошлый раз, иначе 3; `knownExercises` видит только завершённые тренировки.
- [ ] **Шаг 2: Запустить.** `pnpm --filter @mvp/mobile test` – FAIL.
- [ ] **Шаг 3: Реализовать.** `startFocusSession` – в `ctx.db.transaction`, как `createProgramFromDraft`.
- [ ] **Шаг 4: Запустить.** `pnpm --filter @mvp/mobile test` – PASS.

### Задача 5: Категории в библиотеке

**Files:**
- Modify: `apps/mobile/src/lib/library-filters.ts`, `apps/mobile/src/components/exercise-browser.tsx`, `apps/mobile/src/app/exercise-filters.tsx`, `apps/mobile/src/i18n/locales/ru.json`, `apps/mobile/src/i18n/locales/en.json`
- Test: `apps/mobile/src/lib/library-filters.test.ts`

**Interfaces:**
- Consumes: `MUSCLE_CATEGORIES`, `categoryOfMuscles`.
- Produces: `useLibraryFilters.setMuscles(codes: string[])`; `Chip` остаётся без изменений здесь.

- [ ] **Шаг 1: Написать падающий тест `activeFilterCount`:** вся категория `arms` – 1; `['biceps']` – 1; `['biceps','chest']` – 2; категория, оборудование и уровень – 3.
- [ ] **Шаг 2: Запустить.** `pnpm --filter @mvp/mobile test` – FAIL.
- [ ] **Шаг 3: Реализовать** `setMuscles` и подсчёт: только полный набор мышц категории считается за один фильтр. Мышцы одной категории, но не все, считаются поштучно.
- [ ] **Шаг 4: Добавить ряды чипов в `ExerciseBrowser`** между строкой поиска и списком, горизонтальные `ScrollView`, поведение – из раздела «Категории в `ExerciseBrowser`» спецификации. На экране фильтров мышцы разбиты по категориям.
- [ ] **Шаг 5: Запустить.** `pnpm --filter @mvp/mobile test` и `pnpm --filter @mvp/mobile typecheck` – PASS.

### Задача 6: Выбор мышц и разовая тренировка

**Files:**
- Create: `apps/mobile/src/app/focus/index.tsx`, `apps/mobile/src/app/focus/workout.tsx`, `apps/mobile/src/lib/focus-workout.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`, `apps/mobile/src/app/(tabs)/index.tsx`, `apps/mobile/src/app/(tabs)/programs.tsx`, `apps/mobile/src/app/exercise-picker.tsx`, `apps/mobile/src/components/chip.tsx`, `ru.json`, `en.json`

**Interfaces:**
- Consumes: задачи 2 и 4, `setMuscles`.
- Produces:
  - `Chip` с необязательным `disabled`
  - `useFocusLevel(): Level` в `lib/focus-workout.ts`
  - `useFocusWorkout` (zustand): `items`, `dropped`, `short`, `setPlan(plan)`, `replace(index, exerciseId)`, `remove(index)` – как `useImportDraft`
  - параметр маршрута `focusItem` у `exercise-picker`

- [ ] **Шаг 1: Экран выбора** – по разделу спецификации. Кнопки: `router.push({ pathname: '/focus/workout', params: { muscles } })` и `router.push({ pathname: '/questionnaire', params: { focus } })`, мышцы через запятую.
- [ ] **Шаг 2: Экран предпросмотра.** Новый план считается при открытии и при смене длительности. «Заменить»: `setMuscles([muscle])`, затем `exercise-picker` с `focusItem`. Выбор вызывает `replace` и `filters.reset()`.
- [ ] **Шаг 3: Входы** на главном экране и экране программ, регистрация маршрутов в `_layout.tsx`, тексты.
- [ ] **Шаг 4: Проверить.** `pnpm --filter @mvp/mobile typecheck` и `pnpm --filter @mvp/mobile lint` – без ошибок.

### Задача 7: Анкета с упором

**Files:**
- Modify: `apps/mobile/src/app/questionnaire.tsx`, `ru.json`, `en.json`

**Interfaces:**
- Consumes: `applyFocus`, `focusAnswers`, `FOCUS_MIN_DURATION`, `useFocusLevel`, `lastAnswers`.

- [ ] **Шаг 1: Начальные ответы:** `lastAnswers`, иначе `goal`, `level`, частота из активной программы, иначе нынешние значения. С `focus` результат проходит через `focusAnswers`. Частота из `days_per_week`: подходящее значение из `FREQUENCIES`, иначе 3.
- [ ] **Шаг 2: Режим `focus`** – по разделу «Программа» спецификации: без 30 минут, `applyFocus`, плашка с мышцами, объём выбранных мышц, предупреждения, запрет сохранения при `dropped`, название `Упор: бицепс, трапеции`.
- [ ] **Шаг 3: Сохранить `lastAnswers`** при создании программы.
- [ ] **Шаг 4: Проверить.** `pnpm --filter @mvp/mobile typecheck` и `pnpm --filter @mvp/mobile lint` – без ошибок.

### Задача 8: Общая проверка

- [ ] **Шаг 1:** `pnpm typecheck`, `pnpm lint`, `pnpm test` – всё проходит. Если мешает Node ниже 22.13, зафиксировать это и запускать проверки по пакетам.
- [ ] **Шаг 2:** В браузере 390×844: обе ветки от кнопки до тренировки и черновика, возврат к старой программе, категории в разделе и в выборе упражнения, обычная анкета и обычная свободная тренировка.
- [ ] **Шаг 3:** Обновить раздел про программы в `README.md`: одна строка о `packages/domain/src/focus.ts`.
