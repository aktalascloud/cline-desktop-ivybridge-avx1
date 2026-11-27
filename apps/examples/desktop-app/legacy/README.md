# Cline Desktop Legacy RU 0.0.51-legacy.1

Неофициальная сборка Cline Desktop для 64-битных Windows 7 SP1, 8 и 8.1. Целевой процессор — Intel Core 2 Duo P9700 (Penryn, 2 ядра, SSE4.1). Интерфейс и SDK взяты из тега `desktop-v0.0.51`.

NSIS устанавливает приложение для текущего пользователя и добавляет ярлык в «Пуск». WebView2 и Bun на компьютере пользователя не нужны. Настройки, история и ключи этого порта хранятся в `%APPDATA%\Cline Desktop Legacy`, отдельно от стандартного клиента. Удаление через «Программы и компоненты» сохраняет их. Установщик не подписан.

Вместо Tauri и Bun используется [Electron Legacy 44.11.5](https://github.com/Alex313031/electron-legacy/releases/tag/v44.11.5) с Node.js 24.22.3. Интерфейс открывается из локальной сборки, управление идёт через WebSocket на loopback с проверкой origin и токена. Лимит дискового кэша Chromium — 32 МиБ. Пул ввода-вывода Node ограничен двумя потоками, WebSocket передаёт локальные сообщения без сжатия. В инсталляторе оставлены ресурсы Chromium для en-US и ru.

Доступны отдельный профиль, выбор папки и штатный локальный Hub. Встроенный терминал, нативный трей, автоматическое обновление и внешние SSH-помощники требуют дополнительной адаптации. Для генерации настройте модель в Cline. Производительность модели зависит от машины, на которой она запущена.

Русский интерфейс включён по умолчанию. В настройках можно переключиться на English. Автокомпакт включён по умолчанию, порог составляет 90 000 токенов, лимит ввода — 120 000, сохраняется до 40 последних сообщений с учётом бюджета модели. Полная история остаётся на диске.

В списке провайдеров доступен FreeLLM через Kilo Gateway. Для него ключ не нужен. Каталог включает ERNIE 5.5 Flash Preview, Beam 1.0 и Nemotron 3.5 Super VL с баллами 31, 18 и 14 по Artificial Analysis Intelligence Index среди бесплатных моделей шлюза с подтверждённой оценкой и поддержкой инструментов. Доступность проверена 27 ноября 2026 года. У шлюза общий лимит 200 запросов в час на IP. Запросы уходят в облако и могут журналироваться. Бесплатный endpoint NVIDIA предназначен для пробного использования, без личных или конфиденциальных данных. [Методика и оценки](https://artificialanalysis.ai/models/releases) · [Условия доступа Kilo](https://kilo.ai/docs/gateway/models-and-providers)

Перенесены патчи [02–04 из ветки AVX1](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/tree/292f1627d48d97f078dfd9f9de551dc9c1c387a0/patches/local). Legacy использует свой установщик и собственный рантайм для Penryn.

## Сборка

На современной Windows установите Bun 1.4.2 и Node.js 24. Скачайте [архив Electron Legacy x64](https://github.com/Alex313031/electron-legacy/releases/download/v44.11.5/electron-v44.11.5-win32-x64.zip), проверьте SHA-256 и распакуйте его. SHA-256 архива — `c59130291c70dfbd3dedcc2663a64bed82475898be4a6c050a835586a9227ea6`. Для упаковки используется [NSIS 3.13](https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.13/nsis-3.13.zip).

Из корня репозитория выполните:

```powershell
bun install --frozen-lockfile
bun run build:sdk
$env:NEXT_TELEMETRY_DISABLED = '1'
bun -F @cline/code build:web
bun apps/examples/desktop-app/legacy/package.mts C:\Build\ElectronLegacy C:\Build\NSIS\makensis.exe ..\dist
```

Результат — `Cline_0.0.51-legacy.1_x64-setup.exe`. После упаковки для повторной сборки заново выполните `build:web`, чтобы восстановить карты исходников для списка лицензий.

После установки для проверки запуска выполните `ClineLegacy.exe --smoke-test=C:\Temp\cline-qa\result.json`. Каталог результата служит изолированным профилем проверки. Отчёт содержит язык интерфейса, версию, настройки автокомпакта, список моделей FreeLLM и состояние подключения к Hub.
