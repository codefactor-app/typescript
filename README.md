# Codefactor для JavaScript и TypeScript

Codefactor — локальный статический анализатор, который помогает находить сложный код, дублирование и проблемы в зависимостях до рефакторинга и ревью. Этот пакет устанавливает консольную команду через npm для работы в вашем проекте.

Анализатор поддерживает PHP, Python, Rust, JavaScript и TypeScript: выбор пакета определяет способ установки, а не список доступных языков. Исходный код анализируется локально, не исполняется и не отправляется во внешний сервис.

## Что даёт анализ

| Задача | Что вы получаете |
| --- | --- |
| Найти места для рефакторинга | Размер функций и файлов, число параметров, вложенность, цикломатическая и когнитивная сложность, замечания с файлами и строками |
| Разобраться в незнакомом проекте | Графы вызовов, зависимости между каталогами и модулями, переходы к исходникам в локальном веб-интерфейсе |
| Проверить структуру проекта | Поиск дублирования, циклов зависимостей и нарушений заданных границ архитектурных слоёв |
| Оценить потенциально дорогой код | Статические оценки роста числа операций при увеличении размера входных данных |
| Контролировать изменения | Настраиваемые пороги, отчёты для ревью и CI, baseline для работы с существующими замечаниями |

После `scan` вы видите сводку проекта, метрики и замечания с уровнем, расположением и нарушенным порогом. Это помогает выбрать участок для проверки и сравнивать изменения по одним критериям.

## Установка

Установка напрямую из GitHub не требует регистрации пакета в npm. **Пока публичный репозиторий порта пуст, эти команды недоступны:** готовый самостоятельный CLI уже можно скачать из [релизов Codefactor](https://github.com/codefactor-app/core/releases). Инструкции ниже рассчитаны на опубликованный пакет в этом репозитории.

Нужны Node.js >=18, npm и Git. Из каталога проекта с `package.json`:

```sh
npm install --save-dev "git+https://github.com/codefactor-app/typescript.git#main"
npx --no-install codefactor --version
```

Оставьте установочные скрипты npm включёнными: они подготавливают консольную команду и скачивают анализатор. При установке из Git npm также получает зависимости для подготовки пакета. Закоммитьте `package.json` и `package-lock.json`.

Для короткого запуска добавьте скрипты в существующий `package.json`:

```json
{
  "scripts": {
    "codefactor": "codefactor",
    "analyze": "codefactor scan .",
    "analyze:ui": "codefactor serve . --port 8080 --open --watch"
  }
}
```

Запуск: `npm run analyze` или `npm run codefactor -- scan . --all`.

При установке выбирается последний стабильный бинарь анализатора из [GitHub Releases](https://github.com/codefactor-app/core/releases), проверяются размер и SHA-256. Поддерживаются Linux, macOS и Windows на x64 и ARM64. Для скачивания нужен доступ к GitHub; токен не требуется. После установки команды работают без сети.

## Быстрый старт

Из корня проекта выполните:

```sh
npx --no-install codefactor scan .
```

Для первого запуска конфигурация не нужна. Лучше анализировать корень проекта, чтобы учитывать метаданные импортов и зависимостей, а область анализа ограничивать через YAML.

Чтобы увидеть все замечания и сохранить отчёт:

```sh
npx --no-install codefactor scan . --all
npx --no-install codefactor scan . --format json --out codefactor-report.json
```

Консоль по умолчанию показывает до 50 замечаний. `--all` снимает это ограничение; экспортируемый JSON всегда содержит полный отчёт. Коды завершения помогают отличить найденные нарушения от сбоя команды — таблица приведена в разделе CI.

## Конфигурация проекта

Создайте `analyzer.yaml` в корне проекта. Например, для JavaScript и TypeScript:

```yaml
config_version: 1
languages:
  enabled: [javascript, typescript]
paths:
  include: ["**"]
  exclude:
    - "**/__tests__/**"
    - "**/__mocks__/**"
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/test/**"
    - "**/tests/**"
    - "**/fixtures/**"
    - "e2e/**"
    - "cypress/**"
    - "dist/**"
    - "build/**"
    - "coverage/**"
    - "**/generated/**"
    - "**/*.d.ts"
    - "**/*.stories.*"
vendor:
  paths: ["node_modules/**", "**/node_modules/**", "vendor/**"]
  mode: collapsed
  parse: lazy
limits:
  file_lines: {warn: 400, error: 800}
  function_lines: {warn: 40, error: 100}
  functions_per_file: {warn: 20, error: 40}
  methods_per_class: {warn: 15, error: 30}
  function_params: {warn: 4, error: 7}
  cyclomatic_complexity: {warn: 10, error: 20}
  module_cycle: {warn: 0}
architecture:
  enabled: true
  profile: strict
cache:
  enabled: true
  path: .analyzer-cache
output:
  formats: [console]
```

Этот пример не привязан к фреймворку: он анализирует файлы выбранных языков, исключает тесты, сгенерированный код, файлы деклараций `.d.ts` и истории Storybook, задаёт пороги предупреждений `warn` и ошибок `error`. Порог `module_cycle` показывает циклы импортов между файлами. Пути считаются от корня анализа, globs чувствительны к регистру. Правила `.gitignore` тоже учитываются; для анализа тестов удалите соответствующие исключения. Каталоги зависимостей отмечены отдельно и могут раскрываться при анализе связей.

Проверьте настройки и выполните анализ:

```sh
npx --no-install codefactor config check --file analyzer.yaml --strict
npx --no-install codefactor scan . --config analyzer.yaml --strict-config
npx --no-install codefactor config show --file analyzer.yaml --resolved
```

`scan .` автоматически находит `analyzer.yaml` или `analyzer.yml`. При анализе другого корня, например `scan ./src`, указывайте файл явно: `--config analyzer.yaml`. Параметры CLI имеют приоритет над YAML, YAML — над настройками по умолчанию.

### Готовые профили

| Язык | Минимальный | Для повседневной работы | Расширенный |
| --- | --- | --- | --- |
| JavaScript | [minimal.yaml](examples/config/javascript/minimal.yaml) | [medium.yaml](examples/config/javascript/medium.yaml) | [maximum.yaml](examples/config/javascript/maximum.yaml) |
| TypeScript | [minimal.yaml](examples/config/typescript/minimal.yaml) | [medium.yaml](examples/config/typescript/medium.yaml) | [maximum.yaml](examples/config/typescript/maximum.yaml) |

| Фреймворк | Профиль | Когда использовать |
| --- | --- | --- |
| NestJS | [nestjs.yaml](examples/config/nestjs.yaml) | Слои по суффиксам `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.entity.ts`, `*.dto.ts`; внешние вызовы HttpService, ClientProxy, TypeORM, Mongoose, Bull |
| React | [react.yaml](examples/config/react.yaml) | Фронтенд на Vite, Create React App или Next.js: слои `pages → components → hooks → services, store`, вызовы fetch и axios |

```sh
cp node_modules/@codefactor/codefactor/examples/config/typescript/medium.yaml analyzer.yaml
```

Для JavaScript замените `typescript/medium.yaml` на `javascript/medium.yaml`. Для смешанного проекта укажите `languages.enabled: [javascript, typescript]`; профили фреймворков включают оба языка.

Каждый пример самодостаточен. Профили `minimal`, `medium` и `maximum` не привязаны к фреймворку; в `maximum` пути слоёв, имена сущностей и каталоги сторонних библиотек служат примерами — замените их на свои. Профили `nestjs` и `react` описывают слои по стандартной раскладке этих фреймворков и подстраиваются под проект переименованием селекторов. Профиль `minimal` выбирает язык, сохраняя остальные настройки по умолчанию, включая архитектурный и алгоритмический анализ.

[Как выбрать и применить профиль](examples/README.md) · [Полный справочник YAML](docs/configuration.md). Доступные ключи установленной версии также показывает `npx --no-install codefactor config keys`.

## Изучение проекта в браузере

```sh
npx --no-install codefactor serve . --port 8080 --open --watch
```

Откройте `http://127.0.0.1:8080/`, если браузер не открылся автоматически. В интерфейсе доступны исходники с замечаниями, карта кода, графы вызовов, зависимости, архитектурные проверки и действующие критерии анализа. `--watch` обновляет анализ при изменении исходников; остановка — `Ctrl+C`. После редактирования YAML перезапустите сервер.

Сервер по умолчанию доступен только с этого компьютера. Если меняете `--host`, учитывайте, что подключённые пользователи получают доступ к исходникам анализируемого проекта.

## Полезные команды

```sh
npx --no-install codefactor metrics . --group-by directory
npx --no-install codefactor relations --a 'dir:src' --b 'dir:tests' --format md
npx --no-install codefactor external list --category db
npx --no-install codefactor --help
npx --no-install codefactor scan --help
```

`metrics` сравнивает показатели по группам; `relations` показывает вызовы между выбранными частями проекта; `external` перечисляет распознанные внешние операции. Замените `src` и `tests` на каталоги своего проекта. Для подробного графа вызовов используйте `npx --no-install codefactor graph --help` или откройте нужную функцию в веб-интерфейсе.

## Отчёты и CI

| Формат `scan` | Для чего использовать |
| --- | --- |
| `console` | Чтение результатов в терминале |
| `json` | Сохранение полного отчёта и дальнейшая обработка |
| `md` | Отчёт для ревью и документации |
| `sarif` | Передача замечаний в инструменты статического анализа |

```sh
npm ci --include=dev
npx --no-install codefactor config check --file analyzer.yaml --strict
npx --no-install codefactor scan . --strict-config --fail-on-warn --format sarif --out codefactor.sarif
```

Оставьте установочные скрипты включёнными и установите dev-зависимости. `npx --no-install` использует пакет проекта и не пытается скачать другую версию при запуске.

Сохраняйте `codefactor.sarif` как артефакт CI. Для JSON замените формат на `json` и имя файла на `codefactor-report.json`. Логи идут в stderr отдельно от отчёта.

| Код завершения | Значение |
| --- | --- |
| `0` | Нет блокирующих замечаний |
| `1` | Предупреждения при `--fail-on-warn` либо ошибка выполнения команды |
| `2` | Найдены ошибки правил анализа |
| `3` | Синтаксическая ошибка YAML в основном файле конфигурации |

Без `--fail-on-warn` обычные предупреждения не блокируют проверку. Архитектурные замечания носят рекомендательный характер и не меняют код завершения, в том числе с `--fail-on-warn`: нарушения границ слоёв читайте из отчёта `sarif` или `json`. Чтобы цикл импортов между файлами блокировал проверку, задайте порог `limits.module_cycle`: в профилях `medium`, `nestjs` и `react` он даёт предупреждение, в `maximum` — ошибку. При ошибке команды читайте stderr и диагностику отчёта.

### Подключение к существующему проекту

После просмотра первого отчёта сохраните принятые замечания в снимок допущений (baseline):

```sh
npx --no-install codefactor baseline create --root . --config analyzer.yaml --capture violations
npx --no-install codefactor scan . --strict-config --baseline-mode review --fail-on-warn
```

Снимок по умолчанию сохраняется в `.analyzer-baseline.yaml`. Принятое значение скрывается, пока не ухудшится: если для функции допущено 8 параметров, при 9 появится замечание «Допущено 8, сейчас 9» с уровнем действующего правила.

Чтобы сохранить все метрики и проверять ухудшения даже ниже обычных порогов, используйте полный снимок:

```sh
npx --no-install codefactor baseline create --root . --config analyzer.yaml --capture all --baseline accepted.yaml
npx --no-install codefactor scan . --baseline accepted.yaml --baseline-mode regressions --fail-on-warn
npx --no-install codefactor baseline update --root . --config analyzer.yaml --baseline accepted.yaml
```

Режим `review` применяет обычные пороги с учётом допущений; `regressions` дополнительно показывает ухудшения сохранённых показателей. Оба режима доступны также у `metrics`. Сканирование не меняет снимок: новое состояние принимается только через `baseline update`. Проверка без допущений — `scan . --no-baseline`.

Старые `.analyzer-baseline.json` продолжают читаться; перед режимом `regressions` обновите их через `baseline update --baseline .analyzer-baseline.json`. Проверьте снимок и закоммитьте вместе с `analyzer.yaml`. В `.gitignore` добавьте `.analyzer-cache/` и создаваемые отчёты. Формат файла, выбор путей и правила сравнения описаны в [справочнике снимков допущений](docs/configuration.md#снимки-допущений-и-проверка-ухудшений).

## Обновление

Версия пакета и версия Core независимы. В основном `analyzer.yaml` можно выбрать последний стабильный Core или закрепить точную версию:

```yaml
core:
  version: latest  # либо "0.1.3"
```

Чтобы скачать выбранный Core без обновления библиотеки и lock-файла:

```sh
npx --no-install codefactor core update
npx --no-install codefactor --version
```

Для другого YAML используйте `npx --no-install codefactor core update --config path/to/analyzer.yaml`. Команда соблюдает закрепление; для смены версии измените конфиг. Переменная `CODEFACTOR_CORE_VERSION=0.1.3` переопределяет YAML, в том числе при исходной сборке Python/Cargo. Версия должна быть строкой `latest` или `X.Y.Z`; диапазоны и префикс `v` не поддерживаются. `core.version` читается только из основного файла, не из `include`.

Бинарники сохраняются в `.codefactor/core/` рядом с выбранным YAML, без конфига — в текущем проекте. Добавьте этот каталог в `.gitignore`. Все четыре интеграции используют один формат кеша; разные проекты обновляются независимо. При обычном запуске CLI/API сетевых проверок нет. Если закреплённой версии ещё нет, выполните `core update`; команда также восстанавливает повреждённый кеш. При неудачном скачивании рабочая версия сохраняется.

`CODEFACTOR_BINARY` и явный путь в API по-прежнему выбирают локальный исполняемый файл. При `CODEFACTOR_BINARY` команда обновления только сообщает о внешнем бинарнике, без скачивания и замены файла. Чтобы запустить старый Core со строгой проверкой YAML, задайте версию через `CODEFACTOR_CORE_VERSION`, не добавляя неизвестную ему секцию `core`.

Установочный hook npm/Composer также применяет конфиг проекта. Отдельная команда обновления работает и после установки с отключённым скачиванием бинарника.

## Если что-то не работает

- **Команда не найдена:** установите dev-зависимости и запускайте `npx --no-install codefactor` из корня проекта.
- **Бинарь отсутствует после `--ignore-scripts`:** выполните `npx --no-install codefactor core update`.
- **Ошибка установки из GitHub:** проверьте Git в `PATH` и доступ к реестру npm для зависимостей пакета.
- **Ошибка HTTPS:** проверьте доступ к GitHub и доверенные сертификаты.
- **Настройки не применяются:** запускайте из корня проекта или передайте `--config analyzer.yaml`; используйте `config check --strict` и `config show --resolved`.
- **Нужна установка через корпоративное зеркало:** `CODEFACTOR_RELEASE_BASE_URL` задаёт HTTPS-адрес зеркала, `CODEFACTOR_CA_BUNDLE` — доверенный сертификат. `CODEFACTOR_BINARY` позволяет использовать уже скачанный бинарь нужной платформы вместо сетевой загрузки.

## Как читать результаты

Статический анализ может не определить часть динамических вызовов, рефлексии и метапрограммирования. Оценки алгоритмической сложности описывают рост числа операций, а не измеренное время выполнения. Проверяйте диагностику разбора и определения связей; отсутствие замечания не доказывает отсутствие проблемы. Дополнительные архитектурные гипотезы профиля `extended` требуют проверки человеком.

## Лицензия

[MIT](LICENSE).
