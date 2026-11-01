# Build and maintenance

Windows x64; PowerShell 7, Git, Bun 1.4.2 (x64 baseline), Node 24.20.0, Python 3.13.14, Rust 1.97.0, MSVC 14.44.35207, Windows SDK 10.0.26100.0. No fixed drive, user name, model, server or personal profile is required.

1. Install pinned prerequisites. Use the MSVC developer shell, or let the bootstrap discover Visual Studio Build Tools.
2. Check out the exact reviewed commit. Keep the existing updater key outside this repository.
3. Run from the repository root:

```powershell
pwsh -File fork/bootstrap-windows.ps1 -SourceSha <40-character-SHA> -SigningKeyFile <private-key-file>
```

Output: `dist/avx1/Cline-Desktop-AVX1-RU-Setup.exe`, manifest and check receipts. Frozen lockfiles are mandatory. Reuse matching caches; relocation may invalidate native cache entries. Stop on failure, fix the first failed stage and continue. Never suppress errors or publish a repaired payload.

Default profile: O3, Ivy Bridge, fat LTO, one codegen unit, AVX2/FMA disabled. No PGO/pinning. Bun/JSC, Python and system WebView2 are prebuilts. Other compiler profiles are measurement inputs, not release channels. [Measurements](performance.md).

Updates: review upstream and relevant active forks, PRs/issues and complete applicable code. Import upstream through [sanitized history](history-policy.md). Keep licenses and tags. Run targeted tests, typechecks and production build; audit/sign; wait for idle; install; compare profile and payload; run installed protocol checks. GUI is optional. Then publish one release/EXE, update the fork feed, verify server digest/size/tag/feed and copy EXE to Desktop. No repeat EXE download. Delete rollback only after success.

Keep only current receipts and necessary tools. Preserve personal data, keys and original history. Cloud catalogs are provider data, not build requirements. Context/sampling follow the endpoint and user preferences. Never embed private models, URLs or settings in recipes.

Current decisions: `review-ledger.json`. Package: `components.json`, `qualification.json`. One daily Codex chat task at 08:00 Asia/Bishkek; no CI cron.

[Current status, included fixes and remaining validation](STATUS.md). Documentation-only maintenance does not require a new installer.
