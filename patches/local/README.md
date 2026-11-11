# Патчи / Patches

Четыре патча поверх проверенного main Cline. Манифест фиксирует базу, дерево сборки и SHA256. Проверка `python fork/check-patches.py` воспроизводит исходники в отдельном Git index.

Four patches on the verified Cline main tree. The manifest pins the base, build tree and SHA256 hashes. `python fork/check-patches.py` verifies replay in a disposable Git index.

| Patch | Русский | English |
| --- | --- | --- |
| `01-windows-avx1.patch` | Ivy Bridge, baseline Bun, NSIS, трей и переносимые логи | Ivy Bridge, baseline Bun, NSIS, tray locale and relocatable logging |
| `02-russian-and-stock-reasoning.patch` | Русский интерфейс и штатные уровни reasoning | Russian UI and stock reasoning levels |
| `03-compaction.patch` | Лимит, порог и сохранение истории при автокомпакте | Context budget, threshold and history preservation |
| `04-freellm-and-model-context.patch` | FreeLLM без ключа и лимиты моделей из API | Keyless FreeLLM and model limits from the API |

Bun dependency patches are inherited from upstream. Патчи зависимостей Bun унаследованы от upstream.
