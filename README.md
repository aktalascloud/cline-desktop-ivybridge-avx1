# Cline Desktop AVX1 RU

## Русский

Минимальный форк официального Cline Desktop для Windows x64 и Ivy Bridge. AVX/F16C, Rust O3 и fat LTO. AVX2 и FMA отключены, CLI использует baseline Bun.

Русский интерфейс и трей, FreeLLM без ключа, исправленный автокомпакт и штатное меню reasoning. FreeLLM включает Nemotron 3.5 Super VL 120B и North Mini Code 30B. Обновление сохраняет профиль `.cline-avx1` и настройки интерфейса.

[Релиз](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [Патчи и SHA256](patches/local/README.md)

## English

Minimal official Cline Desktop fork for Windows x64 and Ivy Bridge. AVX/F16C, Rust O3 and fat LTO. AVX2 and FMA are disabled, and the CLI uses baseline Bun.

Russian and English UI, keyless FreeLLM, automatic compaction fixes and the stock reasoning selector. FreeLLM includes Nemotron 3.5 Super VL 120B and North Mini Code 30B. The installer preserves `.cline-avx1` and interface preferences.

[Release](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [Patches and SHA256](patches/local/README.md)

## Сборка / Build

PowerShell x64, Bun 1.4.2 baseline, Node 24.20.0, Python 3.13.14, Rust 1.97.0, MSVC 14.44.35207, Windows SDK 10.0.26100.0. Updater signing uses `TAURI_SIGNING_PRIVATE_KEY`.

```powershell
pwsh -NoProfile -File fork/build-windows.ps1
```

Apache-2.0. [Upstream](https://github.com/cline/cline) · [License](LICENSE)
