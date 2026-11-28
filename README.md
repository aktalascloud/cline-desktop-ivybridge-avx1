# Cline Desktop Legacy

Неофициальный Cline Desktop для **Windows 7 SP1, 8 и 8.1 x64** с русским интерфейсом. Целевой процессор — Intel Core 2 Duo P9700 (Penryn, SSE4.1). Основан на Cline Desktop 0.0.51.

[Скачать установщик](https://github.com/aktalascloud/cline-desktop-legacy/releases/tag/legacy-v0.0.51.2) · [Все релизы](https://github.com/aktalascloud/cline-desktop-legacy/releases) · [Сборка](apps/examples/desktop-app/legacy/README.md) · [Замеры](apps/examples/desktop-app/legacy/PERFORMANCE.md)

- **ChatGPT Subscription (Codex)** — вход через браузер и оставшийся процент лимита с временем сброса в настройках провайдера. Доступ зависит от плана ChatGPT.
- **FreeLLM** — ERNIE 5.5 Flash Preview, Beam 1.0 и Nemotron 3.5 Super VL через Kilo Gateway. Ключ не требуется, запросы обрабатываются в облаке.
- **Автокомпакт** — по умолчанию 90 000 токенов до компакта, лимит ввода 120 000, до 40 последних сообщений.
- **Команды агента** — Windows PowerShell по умолчанию, CMD через `CLINE_LEGACY_SHELL=cmd`.
- **Установка** для текущего пользователя, с опциональным ярлыком на рабочем столе. Профиль — `%APPDATA%\Cline Desktop Legacy`.

Релиз предварительный. Установку, обновление, запуск и удаление проверила на Windows 11. Для Windows 7 SP1 и 8.1 ранее проверили запуск Node.js и SQLite в WinPE на виртуальном Penryn. Подробности проверки находятся в описании релиза.

## English

Unofficial Cline Desktop for Windows 7 SP1, 8 and 8.1 x64, targeting Intel Core 2 Duo Penryn. Includes Russian and English UI, ChatGPT Codex subscription limits, context compaction, three free cloud models, and an optional desktop shortcut. See the release for verification scope.

[Upstream Cline](https://github.com/cline/cline) · [Previous Ivy Bridge AVX1 branch](https://github.com/aktalascloud/cline-desktop-legacy/tree/avx1)
