# Fork build and release

One Windows x64 channel, application ID `cloud.aktalas.cline.desktop.avx1.ru`.
Use Bun 1.4.2, Node 24.20.0, Python 3.13.14, Rust 1.97.0, MSVC 14.44.35207 and Windows SDK 10.0.26100.0.
Build a clean, pinned checkout with `fork/build-windows.ps1 -SourceSha <full-sha>`.
The release candidate is `dist/avx1/Cline-Desktop-AVX1-RU-Setup.exe`.

`ivy-thin8`, `ivy-thin1` and `ivy-fat1` are candidates for measured comparison
with `default`. All use Rust opt-level 3; Ivy Bridge candidates explicitly
disable AVX2/FMA. No PGO, fast-math, affinity, NUMA policy or CUDA is added.
MSVC has no `/O3`; its supported speed profile is `/O2`. Native C flags are
not imposed on prebuilt dependencies or libraries with their own dispatch.

Bun/JavaScriptCore, WebView2 and npm native libraries are upstream prebuilts.
Compiling the CLI embeds Bun; it does not rebuild the runtime. Both Bun 1.4.2
x64 download aliases produced the same executable and ran on the target CPU.

The updater public key is committed in Tauri config. The permanent private
key belongs only in a restricted local private directory and the
`AVX1Release` GitHub environment secret `TAURI_SIGNING_PRIVATE_KEY`.
Tauri updater signatures are independent of Authenticode. No publicly trusted
Authenticode signature is claimed.

Before publishing: pass tests/typecheck/production build, inspect licenses and
package/privacy, install and run on Ivy Bridge, exercise providers/history/tools/
MCP/stream/cancel, compare profiles, verify update over the previous fork build,
and verify independent processes and one Startup shortcut. Wait for idle sessions.
The installer refuses to replace files held by running processes.

Create a draft first. Publish only after local gates pass. Keep one current
release with exactly one asset `Cline-Desktop-AVX1-RU-Setup.exe`; put SHA256,
component manifest and the updater signature in release text or repository.
Write `fork/updater/latest.json` only for the verified EXE in this fork.
Delete prior release assets and obsolete CI artifacts only after successful
installation/publication. Retain Git history, tags and licenses.

The only daily trigger is the local Codex chat heartbeat at 09:00 Asia/Bishkek,
UTC+06. No workflow cron or independent Windows build loop is used. The agent
owns research, code adaptation, repairs, qualification and publication.

Every daily cycle reviews upstream PRs/issues and active forks/their PRs even
when main is unchanged. An identical build fingerprint skips rebuilding only.
Interactive GUI checks were waived by the owner; record coverage honestly.
Integrate upstream through the [sanitized-history procedure](history-policy.md).
