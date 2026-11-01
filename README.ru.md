# Cline Desktop AVX1 RU

Неофициальный [Cline](https://github.com/cline/cline) для Windows x64 / Ivy Bridge AVX1/F16C. Локальные и OpenAI-совместимые LLM, включая Strata; RU/EN, MCP, инструменты, голос, субагенты и управляемый компакт. Модель, сервер и контекст задаются пользователем.

[Установщик](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest/download/Cline-Desktop-AVX1-RU-Setup.exe) · [Релиз / SHA256](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [English](README.md)

- Один NSIS EXE: Desktop + CLI/Hub, UAC, обновление с сохранением данных. Подписанный updater обращается только к этому форку. Authenticode: NotSigned.
- FreeLLM: **Nemotron 3.5 Super VL · 120B** и **Beam 1.0 · 501B**. Размер — общее число параметров; это не рейтинг качества. Без аккаунта/личного ключа; общая квота канала 200 запросов/ч/IP. Провайдеры могут сохранять запросы.
- `/compact` и автокомпакт уменьшают рабочий запрос, сохраняя полную историю. Компакт можно отменить. Субагенты наследуют модель родителя, approvals сохраняются. Поиск MCP работает без ключа.
- Сборка не зависит от личной модели или пути установки; [одна пошаговая инструкция](fork/README.md), закреплённые зависимости и SHA. Без AVX2/FMA/PGO/pinning.

[Патчи / PR](fork/review-ledger.json) · [Состав](fork/components.json) · [Проверки](fork/qualification.json) · [Замеры и ограничения](fork/performance.md). GUI и повторное скачивание EXE исключены пользователем. Новое ускорение LLM не заявляется. Bun/JSC, Python и WebView2 — готовые компоненты.

[Apache-2.0](LICENSE); upstream history, notices и имена тегов сохраняются по [правилам очистки истории](fork/history-policy.md). Личные настройки, ключи, история и веса моделей в пакет не входят.
