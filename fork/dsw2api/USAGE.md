# Personal browser-session use

Use only your own explicitly connected browser session. The per-user lease queues Cline and OWUI until the preceding SSE request fully closes. Local request quotas and response truncation are not added.

A rejected, blocked or rate-limited account is not retried through another account. Managed Cline disables SDK request/stream retries and empty-response resubmission for this provider. An uncertain submission is surfaced for review; cancellation closes the upstream stream. A saved session is not proof that inference is available.

Browser automation can still cause service-side restrictions. There is no ban-proof configuration. Stop requests when the service rejects access; do not rotate accounts, bypass CAPTCHA, or disguise activity to evade a restriction. Use the official API when service-supported automation is required.

References: [DSW2API](https://github.com/snake-aabb-wtf/deepseek-web2api-free), [account restriction report](https://github.com/snake-aabb-wtf/deepseek-web2api-free/issues/18), [Whalegate warning](https://github.com/RuriMeiko/whalegate#readme). The reviewed current transport remains our own-account bundled gateway; no Whalegate or DSH binary was added.

RU: очередь общая для Cline/OWUI; локальных квот и обрезания ответа нет. Пустые/ошибочные запросы автоматически не переотправляются. При блокировке, CAPTCHA и отказе доступа запросы останавливаются. Гарантии отсутствия бана нет; для поддерживаемой сервисом автоматизации используйте официальный API.
