# Cline Desktop AVX1 RU

Unofficial Windows x64 fork of [Cline](https://github.com/cline/cline), based on
upstream Desktop 0.0.48 and current main. Built for Ivy Bridge with AVX, F16C,
SSE4.2 and POPCNT, without requiring AVX2/FMA. [Русский](README.ru.md).

The Desktop includes its CLI, Hub and backend. Local and OpenAI-compatible
providers and MCP come from Cline. Russian/English UI switching is added;
messages, code, commands and API identifiers retain their original text.

This build focuses on local LLMs, especially **Strata** through its
OpenAI-compatible API. It supports local model selection, reasoning levels,
streaming, tools and MCP. Provider endpoints and personal instructions stay
in the user's local profile.

Voice input supports both live transcription and recorded-file Whisper-compatible
servers. Select a dedicated voice model in Settings → Voice, then record and press
Stop. Recordings are converted locally to 16 kHz mono PCM WAV for compatibility.
Recognition inserts a draft; it does not send an agent message. Voice and
text providers are configured separately. The server must actually support STT.

## Installation

Download the [current release](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) or its
[Windows x64 installer](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/download/avx1-v1.0.3/Cline-Desktop-AVX1-RU-Setup.exe).
Tested target: Windows 10 LTSC 19044 x64, Xeon E5-2697 v2 and Microsoft WebView2.

The fork uses its own application ID, signed Tauri update feed, data directory
and one Startup shortcut. It does not replace another Cline installation.
Tauri signatures do not imply a publicly trusted Authenticode certificate.

## Changes and evidence

- [Next.js security update](https://github.com/cline/cline/pull/15146), adapted to the lockfile and superseded by 16.4.3.
- [undici 7.30.1 security floor](https://github.com/cline/cline/pull/15287).
- [Transcript regression checks](https://github.com/cline/cline/pull/15223); the production fix is already in upstream main.
- Local changes: EN/RU localization, fork update isolation, deterministic SQLite connection closure, safe Windows worktree cleanup and MCP OAuth issuer binding with SDK 1.32.2.

The [synthetic history test](fork/history-benchmark.json) eliminates handle growth
(+300 to 0 over 100 polls), but median wall time rises from 1240.3 to 1378.7 ms.
This is a resource correctness fix; no overall speedup or LLM throughput gain is claimed.
Native file size is lower with fat LTO; overall speedup is not established. See [measurements and limits](fork/performance.md). Interactive GUI checks were waived by the owner. Bun 1.4.2 x64 and
baseline downloads contained the same executable; both ran on this CPU.
Bun/JSC, WebView2 and npm native libraries are prebuilt. Rust flags do not
recompile them. No PGO, affinity/NUMA policy, CUDA or model weights are added.

See [build/release instructions](fork/README.md), [patch ledger](fork/review-ledger.json)
and [qualification status](fork/qualification.json). The installed upgrade, signature/tamper, protocol fixtures and native profile comparison passed.
See the [public history cleanup policy](fork/history-policy.md).

Apache-2.0: see [LICENSE](LICENSE). Bundled dependencies retain their licenses
and notices; corresponding source links are included with the installer.

The bundled CLI retains its English TUI; external error text can remain English.
Interactive GUI and long-history rendering coverage are not claimed. Local provider settings and prompts are private.
