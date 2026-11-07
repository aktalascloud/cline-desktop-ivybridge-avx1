# Действующие патчи / Active patches

Здесь только изменения, реально применяемые в текущей сборке форка: локальный overlay и активные dependency fixes Bun. Основной upstream не дублируется, изученные/отклонённые PR сюда не складываются.

This directory contains only changes actually applied in this fork. It is not a mirror of upstream commits, a research inbox, or a list of proposed/rejected PRs. Mainstream updates are already merged through verified sanitized history and are not exported again as patches.

## Source overlays authored or adapted for this fork

| Patch | Active changes relative to the pinned upstream base |
| --- | --- |
| `local/001-sdk.patch` | Current local/OpenAI-compatible model/context and sampling support; server-owned output/thinking limits, penalties and seed; compaction/history safeguards; MCP/OAuth/header boundaries; subagent inheritance/preset and resource controls. SDK changes already incorporated upstream disappear from this delta. |
| `local/002-desktop-ui-native.patch` | Current RU/EN, voice, model-selection preservation, Native/backend integration, authenticated APIs, installer/data-preservation and desktop UI adaptations. |
| `local/003-distribution.patch` | Current fork-only CLI/updater channel, Windows AVX1 build/CI/defaults, privacy/history tooling, patch inventory verifier and supporting fork documentation. |

The files are generated from the **effective staged delta** against the exact sanitized upstream commit in `manifest.json`; they include relevant local regression tests. Unchanged upstream code is not copied. Generated release receipts/feed/security-review summaries are excluded explicitly because they describe a build rather than apply code changes. Private orchestration and user state are outside this public repository and never exported.

## Dependency patches applied by Bun

These four files are exactly the active `package.json.patchedDependencies` inputs. The first three originate in official Cline and are retained because this build actually applies them; they are not newly authored fork fixes.

| File | Origin / purpose |
| --- | --- |
| `@opentui-ui%2Fdialog@0.1.2.patch` | Inherited active Cline dependency fix for terminal dialog handling. |
| `@shadcn%2Freact@0.3.1.patch` | Inherited active Cline message-scroller/anchor fix. |
| `ollama-ai-provider-v2@4.0.1.patch` | Inherited active Cline native Ollama wire fixes: think omission, stream errors, image-only text and tool names. |
| `zod@3.25.76.patch` | Local security backport: reject oversized bounded arrays/sets before visiting elements. No Bun cache-marker change is included. |

## Reproduce and maintain

A fork checkout already contains the source overlays: **do not apply them a second time**. Frozen Bun installation applies only its declared dependency patches.

After a reviewed mainstream merge or local code change, stage the reviewed source, run:

```powershell
python fork/local-patches.py --base <sanitized-upstream-SHA> --raw-upstream <original-upstream-SHA>
python fork/local-patches.py --check
```

The check rejects stale overlays, unlisted patch files, missing dependency bindings and mismatched hashes. It replays all three source overlays into a disposable Git index and compares the resulting source blobs/modes with the staged fork; the real index and working tree remain unchanged.

For a clean-base reconstruction, check out the recorded sanitized upstream commit, copy this patch directory from the matching fork checkout, apply `local/001-sdk.patch`, `local/002-desktop-ui-native.patch`, `local/003-distribution.patch` in order with `git apply --unidiff-zero`, then install the pinned dependencies. Preserve licenses/notices. Never add raw private refs, profiles, endpoints, credentials, history, rejected candidates or speculative patches.
