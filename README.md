# Cline Desktop AVX1 RU

Unofficial [Cline](https://github.com/cline/cline) for Windows x64 and local LLMs, especially **Strata**. RU/EN interface, tools, MCP, context compaction and background subagents. Ivy Bridge AVX1/F16C; no AVX2/FMA, PGO or affinity pinning.

[Installer](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest/download/Cline-Desktop-AVX1-RU-Setup.exe) · [Release / SHA256](https://github.com/aktalascloud/cline-desktop-ivybridge-avx1/releases/latest) · [Русский](README.ru.md)

- One administrator NSIS installer includes Desktop, CLI/Hub and required runtimes; updates preserve settings and history. Updates use this fork's signed feed. Authenticode: **NotSigned**.
- **FreeLLM** groups three different vendors: Nemotron 3.5 Super VL, Reflection Beam and Dots3-Note Preview. No account or personal API key. The configured anonymous channel shares a **200 requests/hour/IP** quota; availability and service restrictions apply. DSW2API and its browser bridge are removed.
- Configurable automatic compaction and `/compact` preserve full saved history. Overflow recovery can recompact old tool results. The context indicator distinguishes a saved summary from previous-request usage.
- Portable subagents inherit the parent's model. Unknown presets return available choices instead of disabling the plugin. Ultra/Adaptive remain limited to compatible DavidAU Qwen3.8 Next models.
- Bundled Ponytail rules and keyless MCP web search; short token-rate/cache statistics where usage is reported.

Checks: production build, focused regressions, offline tools/MCP/stream/cancel and installed-package checks. Compaction was replayed against a local test API using a private chat copy; this is not a model-quality or LLM-speed benchmark. GUI checks are waived. [Measurements and limits](fork/performance.md).

[Build](fork/README.md) · [Components](fork/components.json) · [Patch ledger](fork/review-ledger.json) · [Apache-2.0](LICENSE). Upstream history, license notices and source tags are retained through the [history policy](fork/history-policy.md). Bun/JSC, WebView2 and Python are prebuilt; native Rust flags do not rebuild them. No credentials, personal settings, chat history or model weights are included.
