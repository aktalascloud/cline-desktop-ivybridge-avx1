# Cline Desktop for Ivy Bridge · AVX1

[Русский](#русский) · [Release / Скачать](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/tag/avx1-v1.0.22) · [Guide / Документация](#build--сборка) · [Evidence / Данные](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/blob/48f7c2386e32a4e40b253de4ba816352149607d3/fork/qualification.json) · [Upstream](https://github.com/cline/cline)

Archived Windows x64 build for Ivy Bridge. Cline Desktop runs with AVX/F16C and baseline Bun and provides a Russian UI, agent compaction fixes and an optional FreeLLM catalog.

**Quick start.** Run the archived setup EXE. The build is based on upstream Cline and uses `pwsh -NoProfile -File fork/build-windows.ps1` with the toolchain below.

**Evidence.** Release 1.0.22 qualification records source patch replay, an installed smoke check and preserved profile/UI across 2,894 installed files. This qualifies the installer path.

## Русский

Архивная сборка Windows x64 для Ivy Bridge. Cline Desktop использует AVX/F16C и baseline Bun, включает русский интерфейс, исправления автокомпакта и опциональный каталог FreeLLM.

**Запуск.** Запустите архивный EXE. Для сборки форка Cline используйте `pwsh -NoProfile -File fork/build-windows.ps1` с инструментами ниже.

**Проверка.** Для версии 1.0.22 зафиксированы повторное применение патчей, смоук-тест после установки и сохранение профиля и интерфейса. Установленный комплект содержит 2 894 файла.

## Build / Сборка

PowerShell x64, Bun 1.4.2 baseline, Node 24.20.0, Python 3.13.14, Rust 1.97.0, MSVC 14.44.35207, Windows SDK 10.0.26100.0. Updater signing uses `TAURI_SIGNING_PRIVATE_KEY`.

```powershell
pwsh -NoProfile -File fork/build-windows.ps1
```

Apache-2.0. [Upstream](https://github.com/cline/cline) · [License](LICENSE)

[All projects / Все проекты](https://github.com/aktalascloud)
