# Конфигурация Codefactor для JavaScript и TypeScript

Выберите профиль и сохраните его в своём проекте. Все YAML самостоятельные: дополнительные файлы для `include` не нужны.

| Язык | Минимальный | Для повседневной работы | Расширенный |
| --- | --- | --- | --- |
| JavaScript | [minimal.yaml](config/javascript/minimal.yaml) | [medium.yaml](config/javascript/medium.yaml) | [maximum.yaml](config/javascript/maximum.yaml) |
| TypeScript | [minimal.yaml](config/typescript/minimal.yaml) | [medium.yaml](config/typescript/medium.yaml) | [maximum.yaml](config/typescript/maximum.yaml) |

| Фреймворк | Профиль | Для чего подходит |
| --- | --- | --- |
| NestJS | [nestjs.yaml](config/nestjs.yaml) | Исключения `test/`, `*.spec.ts`, `dist/`, слои по суффиксам `controllers → services → repositories → entities, dto`, внешние вызовы HttpService, ClientProxy, TypeORM, Mongoose, Bull |
| React | [react.yaml](config/react.yaml) | Исключения `.next/`, `build/`, `public/`, `*.stories.*`, слои `pages → components → hooks → services, store`, вызовы fetch и axios, `node_conditions: [browser]` |

Профили `minimal`, `medium` и `maximum` не привязаны к фреймворку и подходят любому npm-проекту; `medium` и `maximum` помимо тестов исключают файлы деклараций `.d.ts`, так как движок считает их сигнатуры функциями. Профили `nestjs` и `react` берут за основу `medium`, включают оба языка и добавляют каталоги, слои, переопределения порогов и внешние вызовы стандартной раскладки фреймворка; каталог или суффикс, которого нет в проекте, просто не даёт совпадений.

## Применить профиль

Если пакет установлен, скопируйте профиль из его каталога:

```sh
cp node_modules/@codefactor/codefactor/examples/config/typescript/medium.yaml analyzer.yaml
```

Для JavaScript замените `typescript/medium.yaml` на `javascript/medium.yaml`. Для смешанного проекта задайте `languages.enabled: [javascript, typescript]`.

Из корня анализируемого проекта:

```sh
npx --no-install codefactor config check --file analyzer.yaml --strict
npx --no-install codefactor scan . --config analyzer.yaml --strict-config
npx --no-install codefactor config show --file analyzer.yaml --resolved
```

## Адаптировать под свой проект

- `languages.enabled` определяет языки анализа; пакет поддерживает все пять языков Codefactor.
- `paths.include: ["**"]` включает поддерживаемые файлы, в том числе файлы в корне. Средний и расширенный профили исключают тесты, сгенерированный код и типовые артефакты. Уберите нужные исключения, если хотите анализировать эти файлы.
- Правила `.gitignore` также учитываются. Зависимости выделены через `vendor.paths`, чтобы изучать их связи отдельно от метрик проекта.
- Globs чувствительны к регистру: `**/__tests__/**` не исключает `__Tests__/`, а `**/*.spec.*` не исключает `*.Spec.ts`, поэтому перечисляйте написания, принятые в проекте.
- `limits` задаёт уровни предупреждений `warn` и ошибок `error`. Подберите пороги для своего проекта, затем проверьте их через `config check --strict`. `limits.by_language` нужен только смешанным проектам, чтобы задать разные пороги для `javascript` и `typescript`: для единственного языка он молча перекрывает общий порог.
- Контроллеры NestJS и React-компоненты по замыслу содержат независимые обработчики и длинную разметку, поэтому профили фреймворков поднимают для них `lcom4`, `function_params` и `function_lines` через `limits.by_path`.
- В расширенном профиле и профилях фреймворков пути слоёв, полные имена сущностей, сторонние библиотеки и каталоги старого кода — примеры для замены. FQN сущности в `limits.by_entity` — путь файла без расширения, затем класс и метод через точку, например `src/application/worker.Worker.run`. `architecture.composition_roots` действует, только если файл сборки попадает в селектор слоя.
- В `external.rules` цель вызова записывается как `<импорт>::<метод>`: для `import axios from 'axios'` это `*axios.default::post`, для сервиса, внедрённого через типизированное свойство класса, — `*HttpService::*`. Правила проверяются по порядку, первое совпадение побеждает; вызовы по цепочке свойств вроде `prisma.user.findMany()` не сопоставляются.

Минимальный профиль сохраняет архитектурный и алгоритмический анализ по умолчанию. `scan .` автоматически находит `analyzer.yaml` или `analyzer.yml`; для `scan ./src` передавайте файл явно: `--config analyzer.yaml`. После изменения YAML перезапустите локальный веб-интерфейс.

Добавьте `analyzer.yaml` в репозиторий проекта, а `.analyzer-cache/` — в `.gitignore`.

## Контроль структуры в CI

Архитектурные находки `arch_cycle` и `arch_boundary` не меняют код завершения даже с `--fail-on-warn`. Для блокировки используйте числовые пороги: `limits.module_cycle: {warn: 0}` в `medium`, `nestjs` и `react` превращает цикл импортов между файлами в предупреждение, которое останавливает проверку с `--fail-on-warn`; `{error: 0}` в `maximum` даёт код завершения `2` без флага. Нарушения запрещённых зависимостей между слоями читайте из отчёта `--format sarif` или `--format json`.

[Полный справочник YAML](../docs/configuration.md) · [Установка, запуск и CI](../README.md).
