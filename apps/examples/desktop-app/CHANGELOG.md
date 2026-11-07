# Cline Desktop Changelog

## 1.0.17

- Updated to reviewed official Cline main: bounded browser-history transfers, compaction cancellation accounting, Max reasoning, archived-history opening, screenshot downloads and refreshed theme tokens.
- Обновлён официальный Cline: ограниченные передачи истории, учёт отмены компакта, Max reasoning, открытие архивной истории, скачивание снимков и новая тема.
- Kept saved model choices, including Cloud drafts inheriting a local choice, and retained RU/EN, server-owned generation controls and AVX1 packaging.
- Сохранены личный выбор модели, включая наследуемый Cloud draft, RU/EN, серверные лимиты генерации и AVX1-сборка.
- Active fork overlays and Bun dependency fixes now have a documented, replay-checked inventory in patches; upstream main history and rejected research candidates are not duplicated there.
- Действующие патчи форка и зависимостей описаны в patches и проверяются воспроизведением; основной upstream и отклонённые кандидаты не дублируются.

## 1.0.16

- Updated to reviewed official Cline main; file reads retain their bounded content, failed session deletion keeps approval handlers, provider management uses the authenticated Hub, and published images remain visible.
- Обновлён официальный Cline: чтение файлов больше не обрезается повторно до 8k, ошибки удаления сессии сохраняют approvals, настройки провайдеров обслуживает защищённый Hub, опубликованные изображения остаются видимыми.
- Local inference has startup and inactivity deadlines with live cancellation; active heartbeat streams may continue beyond the startup budget. Explicit user timeouts remain authoritative.
- Для локального вывода разделены ожидание начала и простой потока; heartbeat поддерживает долгую генерацию, отмена и пользовательский timeout сохраняются.
- Context-window overrides and live local metadata survive the provider migration. Beam supports assistant history after compaction without inventing prior reasoning.
- Сохранены пользовательские размеры контекста и актуальные метаданные локального движка. Beam получает совместимую историю после компакта без выдумывания прежних размышлений.

## 1.0.15

- Distinct overflows after completed tool steps can recover again; a failed compacted retry still stops.
- Новое переполнение после успешных шагов снова восстанавливается; неудачный повтор после сжатия по-прежнему останавливается.

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
