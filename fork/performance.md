# Measurements and limits

Windows 10 LTSC 19044 x64, Xeon E5-2697 v2, 16 logical processors exposed, 256 GiB RAM. No affinity/NUMA pinning or PGO. Bun 1.4.2, Rust 1.97.0, MSVC 14.44.35207, SDK 10.0.26100.0. Prebuilt Bun/JSC, OpenTUI and system WebView2 are not rebuilt by Rust flags.

## Native compiler comparison

[Raw final runs](native-benchmark.json): identical prepared Tauri config, frontend and CLI hash; isolated data, a cold Hub per run, one warmup per profile and five measured repeats. Order alternates. Readiness means the renderer acknowledges its Hub connection, not that every provider/history panel has finished loading. CPU/RSS are sampled through ready + 2 seconds; summed RSS can double-count shared pages and short-lived children can escape sampling.

| Profile | Median ready, ms | Sampled CPU, s | Peak summed RSS, MiB | Native EXE, bytes |
|---|---:|---:|---:|---:|
| default, opt 3, CGU 16, no LTO | 7760.0 | 12.39 | 915.5 | 18567680 |
| ivybridge, opt 3, CGU 1, fat LTO | 7622.6 | 12.66 | 908.0 | 17229824 |

Fat LTO reduces the native file size. Overall speedup is not established: timing ranges overlap and the CPU median is slightly higher. The candidate profile is selected for native size and observed RSS, with this tradeoff explicit. ThinLTO CGU 8/1 were also tested during qualification; no general throughput claim is made.

## History resource correctness

[Raw paired runs](history-benchmark.json): 250 synthetic sessions, three warmups and 100 history polls in each new process, three alternating pairs. The counterfactual disables only the owned store close operation and asserts 103 interceptions. Handle growth is +300 without deterministic closure and 0 with closure. Median wall time is 1240.3 vs 1378.7 ms. Closing stores has a measured cost; this is a resource correctness fix.

## Native C experiment

Ring 0.17.14 SHA-256 probe: 4000 x 262144 bytes, five repeats, known vector checked. MSVC default: 4054.2 ms; Clang Ivy Bridge O3: 4111.6 ms; Clang ThinLTO: 4050.6 ms; Clang full LTO: 4049.1 ms. No meaningful benefit was established, so these C overrides are not applied. MSVC /O3 was ignored by the compiler; /O2 /arch:AVX /GL with /LTCG failed with 45 unresolved symbols and was rejected. The installed native C dependency retains its observed vendor /MD /O2 /Brepro defaults.

Protocol fixtures exercise OpenAI-compatible SSE, MCP echo, file reads, search, terminal output and timeout cancellation without inference. They are correctness checks, not LLM tokens/s measurements. Interactive GUI checks were waived by the owner. Long-history/event/render performance coverage is incomplete; no corresponding speedup is claimed.

Version 1.0.3 adds recorded voice input and local WAV conversion. It has not been benchmarked for CPU or LLM throughput; the measurements above retain their original source/workload scope. / Версия 1.0.3 добавляет голосовой ввод и локальный WAV. Новые замеры CPU/LLM не проводились; прежние результаты относятся к указанным исходникам и нагрузкам.

## DeepSeek PoW helper (historical 2026-10-28 experiment)

Scalar DeepSeekHashV1, 50,000 hashes/sample, one warmup and 5 repeats. Cached original WASM median 77.359 ms; independent native generic O3/ThinLTO helper including process startup 44.843 ms. Ivy-target/helper ratio 1.0121; no Ivy-specific benefit established, so this helper retains the compatible generic x86-64 profile (AVX2/FMA disabled). These are historical PoW-only results, not LLM tokens/s or current UI/startup benchmarks.

The final helper was recompiled and independently checked against the original WASM on five scalar/UTF-8/multiblock cases. No source from the separately reviewed AGPL-traced helper was copied. Python, wheels and Bun remain prebuilt; local Rust flags apply only to source-built components.
