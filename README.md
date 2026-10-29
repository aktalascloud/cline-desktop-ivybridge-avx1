# Cline Desktop AVX1 RU

Unofficial [Cline](https://github.com/cline/cline) for Windows x64: **local LLMs, especially Strata**, tools, MCP and expanded Russian UI with English switching. Ivy Bridge AVX/F16C/SSE4.2/POPCNT; no AVX2/FMA requirement, PGO or pinning. One installer includes Desktop, CLI/Hub and required runtimes.

**[Download EXE](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest/download/Cline-Desktop-AVX1-RU-Setup.exe)** · [Release and SHA256](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [Русский](README.ru.md)

**DeepSeek without local quotas — DSW2API.** Your own web account; no ClinePass, local request quota or response/tool-result truncation. DSW2API appears beside Strata. The existing default-browser session connects through a DeepSeek-only extension (one-time permission), without token copying. Its icon shows live connection status. Python, the browser companion and native PoW are bundled. DeepSeek's own limits and availability remain; unlimited vendor access is not guaranteed. Fixed false busy-503 after streamed tool calls and replacement of the native browser host. Independent Deep thinking and Smart search switches control the web model. Ultra/Adaptive are limited to opted-in DavidAU Qwen3.8 Next / Flash Next. Other models retain ordinary reasoning and sampling, including temperature. No verified full unlimited DSH route is currently offered.

1.0.12 preserves parallel edits, UTF-16 strings and known CLI model metadata; saved local histories resume by ID ([#15419](https://github.com/cline/cline/pull/15419), [#15404](https://github.com/cline/cline/pull/15404), [#15400](https://github.com/cline/cline/pull/15400), [#15414](https://github.com/cline/cline/pull/15414)). Switching providers with huge histories can still reach the transport limit.

The administrator installer closes only this installation's runtime and preserves data. Separate application IDs and a signed updater use this fork exclusively. Authenticode: **NotSigned**; Tauri signatures verify updates. Tested host: Windows 10 LTSC x64, Xeon E5-2697 v2, WebView2.

Patches cover authenticated Hub access, session recovery, reasoning-only completion, Windows runtime replacement, MCP pagination and RU/EN. DSW2API inherits [streamed tool parsing #17](https://github.com/snake-aabb-wtf/deepseek-web2api-free/pull/17) and [parent chaining #10](https://github.com/snake-aabb-wtf/deepseek-web2api-free/pull/10). [Patch ledger](fork/review-ledger.json) · [Components/sources](fork/components.json) · [DSW2API provenance](fork/dsw2api/SOURCE.json).

Checks include production build, types, targeted regressions, installer and offline tool/stream/cancel fixtures. DeepSeek account verification and a synthetic streaming reply passed; interactive GUI is not a gate. No LLM tokens/s improvement is claimed. [Measurements/limits](fork/performance.md). Bun/JSC, WebView2, Python and wheels are prebuilt; local Rust flags do not rebuild them. The CLI TUI and external errors can remain English.

[Build](fork/README.md) · [Apache-2.0](LICENSE) · [History policy](fork/history-policy.md). Dependency licenses, notices and source links are retained. No private keys, configuration, history or model weights are shipped.
