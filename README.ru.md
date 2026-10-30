# Cline Desktop AVX1 RU

Неофициальный [Cline](https://github.com/cline/cline) для Windows x64 и локальных LLM, особенно **Strata**. Русский и английский интерфейс, инструменты, MCP, компакт контекста и фоновые субагенты. Ivy Bridge AVX1/F16C; без AVX2/FMA, PGO и привязки ядер.

[Установщик](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest/download/Cline-Desktop-AVX1-RU-Setup.exe) · [Релиз / SHA256](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [English](README.md)

- Один NSIS EXE с запросом прав администратора включает Desktop, CLI/Hub и нужные компоненты. Обновление сохраняет настройки и историю; подписанный updater использует только этот форк. Authenticode: **NotSigned**.
- **FreeLLM**: Nemotron 3.5 Super VL, Reflection Beam и Dots3-Note Preview от трёх разных вендоров. Без аккаунта и личного ключа. Общая квота настроенного анонимного канала — **200 запросов/ч на IP**; доступность и ограничения определяет сервис. DSW2API и его браузерный мост удалены.
- Настраиваемый автокомпакт и `/compact` сохраняют полную историю. При переполнении повторно сжимаются старые результаты инструментов. Индикатор отличает сохранённую сводку от статистики прежнего запроса.
- Субагенты наследуют модель родительского чата. Неверный preset возвращает доступные варианты и не отключает плагин. Ultra/Adaptive доступны только совместимым моделям DavidAU Qwen3.8 Next.
- Включены правила Ponytail, бесплатный веб-поиск MCP без ключа и краткая статистика ток/с и кэша при наличии данных.

Проверки: production build, целевые регрессии, локальные tools/MCP/stream/cancel и установленный пакет. Компакт проверен на копии личного чата через тестовый API; это не замер качества модели или скорости LLM. GUI-проверки сняты пользователем. [Замеры и ограничения](fork/performance.md).

[Сборка](fork/README.md) · [Компоненты](fork/components.json) · [Реестр патчей](fork/review-ledger.json) · [Apache-2.0](LICENSE). История upstream, notices и исходные теги сохраняются по [правилам истории](fork/history-policy.md). Bun/JSC, WebView2 и Python — готовые компоненты; Rust-флаги их не пересобирают. Ключи, личные настройки, история и веса моделей в пакет не входят.
