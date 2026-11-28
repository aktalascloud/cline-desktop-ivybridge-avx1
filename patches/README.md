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

[0008](0008-use-published-electron-44.11.6.patch) (`30c8c974a`) переключает Cline `0.0.51-legacy.3` на опубликованный Electron Legacy `44.11.6`. Примените патчи 0001–0008 по порядку. Для обновлений Cline повторно используйте скачанный архив с проверенной SHA‑256. Установщик с опубликованным рантаймом использует проверку SSE3.

Три файла с именами зависимостей (`@opentui-ui/dialog`, `@shadcn/react`, `ollama-ai-provider-v2`) уже входят в официальный тег и используются Bun. [Патч для официального NSIS](upstream-windows-installer-requirements.patch) предназначен для ветки `main` официального Cline. В Legacy используется собственный установщик из 0001 и 0006. [Сравнение ветки официального патча](https://github.com/cline/cline/compare/main...aktalascloud:fix/windows-desktop-installer-requirements)

## Экспериментальные патчи Electron для Penryn

[electron-penryn-codegen.patch](electron-penryn-codegen.patch) добавляет профиль GN `electron_x86_profile="penryn"` для Windows x64. Профиль наследует набор инструкций SSE4.1 из Electron Legacy и настраивает планирование инструкций на Penryn в clang-cl (`-mtune=penryn`) и Rust. Релизная конфигурация Electron Legacy использует `-O3`, ThinLTO и PGO. Встроенные пути Skia с AVX2 и AVX-512 сохраняют свои флаги `/arch` и проверку CPU при запуске. Явный `-march` в clang-cl перекрывает `/arch` и ломает сборку этих путей.

Патч проверен через `git apply --check` на Chromium `152.0.7977.169` после применения штатных патчей Electron Legacy. Нативную сборку остановили. Установщики Cline `legacy.2` и `legacy.3` используют опубликованные рантаймы Electron Legacy.

Исходники Electron Legacy закреплены на `cc856cee9aa412ceb758bc6fe4d93e7243bd7edc` (`v44.11.5-src`). Из их корня примените [electron-legacy-runtime-only.patch](electron-legacy-runtime-only.patch). В режиме Penryn он собирает архив рантайма с SHA-256 и экономит время на дополнительных целях сборки.

Для сборки на Windows нужны Visual Studio 2022 Build Tools с компонентом C++ ATL для v143 и Windows SDK `10.0.26100.0` с Debugging Tools for Windows. При нестандартном размещении Visual Studio задайте `vs2022_install` и `GYP_MSVS_OVERRIDE_PATH` с путём к Build Tools. Если depot_tools ещё не создала `python3.bat`, выполните `bootstrap\win_tools.bat` из папки depot_tools перед применением серии Electron Legacy. [Установка Debugging Tools for Windows](https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/debugger-download-tools)

[chromium-windows-localized-acl-output.patch](chromium-windows-localized-acl-output.patch) читает вывод `icacls` в кодовой странице Windows OEM. Это позволяет выполнить штатную настройку прав AppContainer при сборке на русской Windows. Действие `set_appcontainer_acls.py` проверено на русской Windows с `PYTHONUTF8=1`.

После синхронизации и применения серии Electron Legacy примените оба патча Chromium из корня `checkout/src`. Затем запустите `build.sh x64 --xp --build-only --package --gn-args 'electron_x86_profile="penryn"'`. Режим `--xp` сохраняет вариант рантайма с `winwrap.dll` из предыдущего релиза. Для сравнения используйте одинаковое приложение и одну установку каждой ОС. [Инструкция сборки Electron Legacy](https://github.com/Alex313031/electron-legacy/blob/v44.11.5-src/docs/BUILDING.md)
