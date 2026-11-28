# Патчи Cline Desktop Legacy

Набор воспроизводит исходники опубликованного `legacy-v0.0.51.2` из официального `desktop-v0.0.51` (`aa6e19157`). Порядок применения соответствует нумерации. Каждому патчу соответствует один коммит.

| Патч | Коммит | Содержание |
| --- | --- | --- |
| [0001](0001-electron-legacy-port.patch) | `b45ec1642` | Перенос на Electron Legacy и Node. NSIS, локальный интерфейс, изолированный IPC, sidecar, Hub, нативный выбор папки и запуск плагинов. |
| [0002](0002-managed-hub-port.patch) | `c33de7542` | Управляемый порт и обнаружение Hub без конфликта со стандартным клиентом. |
| [0003](0003-russian-compaction-freellm.patch) | `c07e2369c` | Русский UI, автокомпакт, восстановление после переполнения, метаданные контекста моделей и каталог FreeLLM. Адаптация патчей из ветки `avx1`. |
| [0004](0004-validate-freellm-capabilities.patch) | `54a55e798` | Проверка возможностей и лимитов моделей в поставляемом каталоге. |
| [0005](0005-document-compaction-preferences.patch) | `b5322e73c` | Документация настроек автокомпакта. |
| [0006](0006-codex-limits-shell-settings-startup-installer.patch) | `cc661917e` | Квоты подписки Codex, старый PowerShell, CMD, параллельный запуск окна и sidecar, предварительная загрузка настроек, проверка SSE3 и опциональный ярлык. |

На основе официального тега примените `git am` с этими шестью файлами по порядку. Проверка выполнила `git apply --cached` на отдельном индексе Git. Результирующее дерево `79027e064c5c15cea13905a9ca368d7eac5a52d9` совпало с деревом `legacy-v0.0.51.2`.

В рабочей ветке дополнительно применяется [0007](0007-penryn-sse41-installer-check.patch) (`b95152751`). Он добавляет x86-проверку SSE4.1 через CPUID перед установкой нативной сборки Penryn. Воспроизведение семи патчей проверено на том же базовом теге. На Windows 11 отдельно проверены старый путь SSE3, успешная проверка SSE4.1 и отказ при тестовом отрицательном результате.

Три файла с именами зависимостей (`@opentui-ui/dialog`, `@shadcn/react`, `ollama-ai-provider-v2`) уже входят в официальный тег и используются Bun. [Патч для официального NSIS](upstream-windows-installer-requirements.patch) предназначен для ветки `main` официального Cline. В Legacy используется собственный установщик из 0001 и 0006. [Сравнение ветки официального патча](https://github.com/cline/cline/compare/main...aktalascloud:fix/windows-desktop-installer-requirements)

## Нативная сборка Electron для Penryn

[electron-penryn-codegen.patch](electron-penryn-codegen.patch) добавляет опцию GN `cline_enable_penryn`. При её включении clang-cl компилирует базовый код Windows x64 с `-march=penryn` и `-mtune=penryn`. В релизном профиле Electron Legacy уже включены ThinLTO и PGO. Специализированные SIMD-пути сохраняют собственные параметры компиляции и проверку возможностей CPU в рантайме.

Патч проверен через `git apply --check` на Chromium `152.0.7977.169`. Его цель — следующая нативная сборка. Бинарник в теге `legacy-v0.0.51.2` был собран без этого патча.

Исходники Electron Legacy закреплены на `cc856cee9aa412ceb758bc6fe4d93e7243bd7edc` (`v44.11.5-src`). Из их корня примените [electron-legacy-runtime-only.patch](electron-legacy-runtime-only.patch). В режиме Penryn он собирает архив рантайма с SHA-256 и экономит время на дополнительных целях сборки.

После синхронизации и применения серии Electron Legacy примените `electron-penryn-codegen.patch` из корня Chromium `checkout/src`. Затем запустите `build.sh x64 --xp --build-only --package --gn-args 'cline_enable_penryn=true'`. Режим `--xp` сохраняет вариант рантайма с `winwrap.dll` из предыдущего релиза. Для сравнения используйте одинаковое приложение и одну установку каждой ОС. [Инструкция сборки Electron Legacy](https://github.com/Alex313031/electron-legacy/blob/v44.11.5-src/docs/BUILDING.md)
