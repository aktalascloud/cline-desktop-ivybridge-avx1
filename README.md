# Cline Desktop AVX1 RU

Unofficial [Cline](https://github.com/cline/cline) for Windows x64 / Ivy Bridge AVX1/F16C. Local and OpenAI-compatible LLMs, including Strata; RU/EN, MCP, tools, voice, subagents and configurable context compaction. Choose your own model, endpoint and context.

[Installer](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest/download/Cline-Desktop-AVX1-RU-Setup.exe) · [Release / SHA256](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [Русский](README.ru.md)

- One NSIS EXE: Desktop + CLI/Hub, UAC and data-preserving updates. Signed updater uses only this fork. Authenticode: NotSigned.
- FreeLLM: **Nemotron 3.5 Super VL · 120B**, **Beam 1.0 · 501B**. Total parameters, not a quality ranking. No account/personal key; shared channel limit 200 requests/hour/IP. Providers may retain prompts.
- Manual/automatic compaction reduces working requests and retains complete history. Manual compaction is cancellable. Subagents inherit the parent model and preserve approvals. Key-free MCP web search included.
- Relocatable sources with [one build guide](fork/README.md), pinned dependencies and SHA; no personal model/installation path. No AVX2/FMA, PGO or pinning.

[Security](fork/security.md) · [PRs / patches](fork/review-ledger.json) · [Components](fork/components.json) · [Checks](fork/qualification.json) · [Measurements and limits](fork/performance.md). GUI and repeat EXE downloads waived by owner. No new LLM speedup claimed. Bun/JSC, Python and WebView2 are prebuilts.

[Apache-2.0](LICENSE). Preserve upstream history, notices and tag names under the [history policy](fork/history-policy.md). Personal settings, keys, history and model weights are excluded.
