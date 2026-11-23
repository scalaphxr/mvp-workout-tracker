# Источники каталога упражнений

Расширение добавляет 314 карточек к 200 исходным. У каждой новой карточки есть название,
описание исходного положения и техника на русском и английском. Все карточки входят
в общий каталог приложения и API. Движения с одинаковой техникой и разными названиями
сопоставляются через поисковые синонимы. Отдельная карточка нужна, когда меняются
движение, обязательный инвентарь или способ записи результата.

| Тип карточки | Добавлено | Всего |
| --- | ---: | ---: |
| Силовые | 146 | 251 |
| С собственным весом | 96 | 144 |
| Кардио | 29 | 42 |
| Растяжка и мобильность | 36 | 61 |
| Удержания на время | 7 | 16 |
| **Всего** | **314** | **514** |

126 карточек доступны без специального инвентаря. Добавлено 55 типов инвентаря
и 129 поисковых синонимов, включая марки, модели и артикулы тренажёров.

## Сравнение баз

| База | Покрытие и условия | Как использована |
| --- | --- | --- |
| [Free Exercise DB](https://github.com/yuhonas/free-exercise-db) | 876 строк в скачанном JSON. Силовые, растяжка, плиометрика, тяжёлая атлетика, стронгмен и 14 кардиопозиций. Репозиторий под Unlicense. | Подбор движений, вариантов и английских синонимов для свободных весов, плиометрики и мобильности. |
| [Kinetic Exercises Database](https://github.com/kinetic-place/exercises-db/blob/main/README.md) | 908 строк, 44 типа оборудования. [Лицензия MIT](https://github.com/kinetic-place/exercises-db/blob/main/LICENSE), © Kinetic.place. У 865 из 908 строк название совпало с Free Exercise DB после удаления пробелов, пунктуации и различий в регистре. | Сверка инвентаря и названий. Поза сфинкса, поза верблюда, втягивание подбородка, подъёмы I–Y–T, скольжение руками по стене и другие варианты вошли в расширение. |
| [2024 Adult Compendium](https://pacompendium.com/adult-compendium/) | Справочник видов физической активности, включая ходьбу, бег, велосипед, аэробику и водные занятия. | Покрытие кардио и вариантов для помещений, улицы и бассейна. |
| [OpenBody Registry](https://github.com/openbody/openbody-registry/blob/main/SOURCES.md) | CC0. Авторы указывают Free Exercise DB как основу большинства движений. | Проверен на пересечение с основной базой. |
| [wger](https://github.com/wger-project/wger#license) и [OpenExerciseDB](https://github.com/rfivesix/OpenExerciseDB#license) | У wger условия Creative Commons указаны для отдельных записей. У OpenExerciseDB данные CC BY-SA 4.0, при этом сохраняются авторство и лицензия исходных записей. | Кандидаты для отдельного импорта с учётом авторства и лицензии каждой записи. |
| [RepDB](https://huggingface.co/datasets/RepDB/exercise-dataset) | 708 карточек с иллюстрациями в проверенном публичном выпуске. Для публичных материалов требуется видимое упоминание RepDB в приложении. | Проверен как возможный источник иллюстраций. |
| [Набор Nielide](https://github.com/Nielide/exercises-dataset) и [Flow Exercise Dataset](https://github.com/ozansozuozgit/flow-exercise-dataset) | Большие списки упражнений. Для визуальных материалов у каждого источника свои условия и сведения о происхождении. | Проверены как возможные источники для будущего расширения. |

Описания и подсказки в карточках написаны для приложения. Использованы названия движений,
факты об оборудовании и идентификаторы моделей. Новые карточки выпущены с текстовой техникой.

## Каталоги производителей

| Производитель | Пример поискового запроса | Источник |
| --- | --- | --- |
| Life Fitness | `Life Fitness Integrity treadmill run` | [Integrity Series](https://www.lifefitness.com/en-gb/catalog/cardio/treadmills/integrity-series-treadmill), [перечень моделей](https://www.lifefitness.com/en-us/legal/patents) |
| Hammer Strength | `Hammer Strength Pendulum-X Squat` | [Силовые линейки](https://www.lifefitness.com/en-us/brands/hammer-strength), [Plate Loaded](https://www.lifefitness.com/en-us/catalog/strength-training/plate-loaded) |
| Technogym | `Technogym Skillmill` | [Skill Line](https://www.technogym.com/en-GB/skill-line-performance-equipment/), [Biostrength Leg Press](https://www.technogym.com/en-INT/product/biostrength-leg-press_MM51.html), [линейки](https://www.technogym.com/en-INT/shop-lines/) |
| Matrix | `Matrix Ultra G7-S70` | [Каталог Matrix Strength](https://images.jhtassets.com/a4c3b58fe48cc18d4c5e66022e096761263d3b50/original/named/strength-brochure.pdf) |
| Precor | `Precor Resolute RSL0602` | [Resolute](https://files.precor.com/en-US/strength/selectorized/resolute) |
| Panatta | `Panatta Super Vertical Leg Press` | [FreeWeight Special](https://www.panattasport.com/en/free-weight-special/super-vertical-leg-press), [общий каталог](https://www.panattasport.com/download/panatta-general-catalogue.pdf) |
| Nautilus | `Nautilus Inspiration IPLP5` | [Inspiration Leg Press](https://www.corehandf.com/products/nautilus-inspiration-leg-press), [разведение и сведение](https://shop.corehandf.com/cdn/shop/files/Nautilus_Inspiration_AbductionAdduction_IPAA5.pdf), [сгибание ног](https://shop.corehandf.com/cdn/shop/files/Nautilus_Inspiration_Leg_Curl_IPLC5.pdf), [верхний блок](https://shop.corehandf.com/cdn/shop/files/Nautilus_Inspiration_Lat_Pull_Down_IPPD5.pdf) |
| Concept2 | `Concept2 RowErg` | [Линейка Ergs](https://www.concept2.com/products?category=ergs) |
| Assault Fitness | `AssaultRunner Pro` | [AssaultRunner](https://www.assaultfitness.com/treadmills/), [AssaultBike](https://shop.assaultfitness.com/bikes/) |
| StairMaster | `StairMaster 8Gx` | [8Gx](https://www.corehandf.com/products/stairmaster-8gx-1) |

Карточки движений лежат в `exercises/expansion-*.json`, дополнительные типы инвентаря
в `equipment-expansion.json`, синонимы в `exercise-aliases.json`. Модели связаны с типами
тренажёров через карточки движений. Каталог использует общие для типа оборудования шаги веса,
а профиль зала позволяет указать фактический шаг.
