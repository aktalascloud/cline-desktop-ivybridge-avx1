# Cline Desktop AVX1 RU

Неофициальный [Cline](https://github.com/cline/cline) для Windows x64: **локальные LLM, особенно Strata**, инструменты, MCP и дополненный русский интерфейс с переключением на английский. Ivy Bridge AVX/F16C/SSE4.2/POPCNT; без требования AVX2/FMA, PGO и pinning. Desktop, CLI/Hub и необходимые компоненты входят в один установщик.

**[Скачать EXE](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest/download/Cline-Desktop-AVX1-RU-Setup.exe)** · [Релиз и SHA256](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [English](README.md)

**DeepSeek без локальных лимитов — DSW2API.** Свой веб-аккаунт, без ClinePass, местной квоты запросов и обрезания ответа/tool results. DSW2API находится рядом со Strata в списке провайдеров. Вход открывает установленный браузер по умолчанию в его обычном профиле; сессия подключается через расширение только для DeepSeek (разовое разрешение), без копирования токенов. Общее расширение поддерживает Cline и OWUI; очередь разделяет запросы одного аккаунта. Значок отличает переданную сессию от подтверждённого ответа. Python и native PoW включены. У самого DeepSeek остаются ограничения и зависимость от доступности; гарантированный безлимит сервиса не заявляется. Исправлены ложный HTTP 503 после tool call и обновление занятого браузерного моста. Два независимых переключателя: «Глубокое мышление» и «Умный поиск». Ultra/Adaptive доступны только разрешённой DavidAU Qwen3.8 Next / Flash Next; у других моделей сохранены обычные уровни reasoning и sampling, включая температуру. Проверенного полного безлимита DSH пока нет.

1.0.13: устранена ложная ошибка «All accounts busy» после сбоя. Открытые чаты обновляют подключение после перезапуска шлюза. Отклонённая сессия требует переподключения через расширение; запросы автоматически не повторяются.

Установщик запрашивает администратора, закрывает компоненты только своей установки и сохраняет данные. Собственные ID приложения и подписанный updater используют только этот форк. Authenticode: **NotSigned**; Tauri-подпись проверяет обновления. Проверяемая система: Windows 10 LTSC x64, Xeon E5-2697 v2, WebView2.

Исправления: токенизация доступа к Hub, восстановление сессий, обработка reasoning-only ответов, безопасная замена Windows runtime, пагинация MCP, RU/EN. DSW2API наследует исправления [потоковых инструментов #17](https://github.com/snake-aabb-wtf/deepseek-web2api-free/pull/17) и [parent chain #10](https://github.com/snake-aabb-wtf/deepseek-web2api-free/pull/10). [Реестр патчей](fork/review-ledger.json) · [Состав и источники](fork/components.json) · [DSW2API](fork/dsw2api/SOURCE.json).

Проверки: production build, типы, целевые тесты, установщик и offline-сценарии инструментов/потока/отмены. Сессия DeepSeek и синтетический потоковый ответ проверены; интерактивный GUI не является gate. Улучшение LLM tokens/s не заявляется. [Замеры и ограничения](fork/performance.md); Bun/JSC, WebView2, Python и wheels — prebuilt, им не приписываются наши Rust-флаги. CLI TUI и внешние ошибки могут оставаться английскими.

[Сборка](fork/README.md) · [Лицензия Apache-2.0](LICENSE) · [Политика истории](fork/history-policy.md). Лицензии, notices и ссылки на исходники зависимостей сохранены. Ключи, настройки, история и модели в Git/EXE не входят.
