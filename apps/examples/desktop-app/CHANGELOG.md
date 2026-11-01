# Cline Desktop Changelog

## 1.0.15

- Removed client output/thinking caps, penalties and seed from OpenAI-compatible controls; the endpoint supplies these defaults, including for old sessions.
- Максимум ответа/мышления, штрафы и seed задаются сервером; остальные sampling-настройки сохранены, старые переопределения не отправляются.
- Updated compatible security dependencies and backported early collection bounds for legacy Zod; dependency warnings are reported by applicability, not hidden.
- Обновлены совместимые зависимости безопасности и ранняя проверка ограничений коллекций Zod; предупреждения не скрываются.

- Stop manual compaction without saving partial summaries; restore Stop after reattaching.
- Компакт можно остановить без сохранения частичной сводки; остановка доступна после возврата в чат.
- Explicit MCP OAuth checks saved authorization and keeps headers bound to their origin.
- MCP OAuth проверяет сохранённый вход и не передаёт служебные заголовки чужому серверу.
- Upstream artifact previews and UX evidence; Russian labels, portable build instructions and a compact maintenance set.
- Превью файлов и отчётов upstream, русский перевод, переносимая сборка и компактный рабочий набор.
- FreeLLM: Nemotron 3.5 Super VL · 120B; Beam 1.0 · 501B. Shared hourly limits still apply.
- FreeLLM: две модели разных вендоров; сохраняются часовые ограничения сервиса.
