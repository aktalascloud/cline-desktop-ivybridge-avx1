# Public history policy

The owner authorized cleaning inherited credential-like records from public
branches and source tags on 2026-10-25. Remote-config runtime cache paths and
the exact inherited credential values were removed with git-filter-repo 2.47.0.
No credential was used or checked against an external service.

All 845 existing source tag names are retained. Redundant raw copies of 2444
upstream feature branches are removed from this fork; `avx1` and sanitized
`main` remain. Their original branch tips are retained in the private bundle.
Commit and tag object hashes
can change; rewritten tag signatures cannot authenticate their original objects.
The complete original history is preserved in an ACL-protected local bundle,
never as a public backup ref. Licenses and notices are retained.

| Source | Original SHA | Sanitized SHA |
|---|---|---|
| upstream main | 40c5d99031fe1128189c5b52e40638d2b7787754 | 8c6e4474bc32cc9a118e74fe158cd5fbbab572aa |
| installed release source | d4cfb426b27d705730f74310784c3a2825a0833b | 1f3c6f9d3f8a640b3087665705cf743deb346ffa |
| successful Windows CI source | 09e652230d98421beb6dc37aebef8588a19a7fb5 | a17c9e2381a756869075a673a19ad08064318826 |

The release-source tree changes only by removing an unused legacy CLI test
cache fixture. Desktop, current SDK, runtime sources and dependency locks are
unchanged. The already audited installer is retained; no performance result
is attributed to history rewriting.

The sanitized public snapshot was scanned in full: 128662 reachable objects,
1961799847 uncompressed bytes, zero matches for the removed credential values
(UTF-8 and UTF-16). The 67 remaining Gitleaks findings are a subset of previously
reviewed upstream examples, test fixtures, unsigned JWTs and public client IDs;
this is not a claim of zero scanner findings.

## Future upstream updates

Never merge raw upstream ancestry into `avx1`. Archive new original commits in a protected incremental bundle in addition to the original archive. Use the same pinned git-filter-repo 2.47.0, private replacements and path filters.

For updates descending from a previously verified pair, use `sanitize-upstream.py --raw-base <original SHA> --sanitized-base <verified public SHA>` on a disposable bare snapshot. It filters only the new range and anchors it to the existing public history. Every excluded parent must be that verified base; an unmapped old side-branch parent is rejected before rewriting. Never guess a mapping or splice raw ancestry into the public branch. Additional merge boundaries require independently verified anchors.

This avoids reprocessing unchanged history and keeps published commit mapping stable. A full replay with a different ref graph/order can change SHA references inside old commit messages. A clean final tree alone does not prove matching ancestry. Historical Windows-invalid paths and case-colliding branch names also make full replay unsuitable for routine Windows updates.

The 2026-10-26 update maps original `dab482348ffd83d1065dfcf8b538076608925a79` to `5e411e5e0111f1adf366475c6bb3fc72c52dfb4c`, anchored at the verified pair above. All 238 new objects (9,457,491 bytes) were checked for removed sensitive values in UTF-8/UTF-16, with zero matches. Its tree matched independent full sanitization. A real-Git regression verifies redaction, base ancestry, excluded paths and rejection of an unmapped old parent.

Scan newly reachable objects and changed source findings before integration or push; reuse the recorded scan of the unchanged verified base. Private replacements, raw refs and sensitive scan excerpts never enter the public tree. Push reviewed refs only, never `push --mirror`.

Rewriting this fork's advertised refs does not erase the official upstream,
other clones, GitHub caches or objects retained by the shared fork network.
Server-side eradication of historical objects is controlled by GitHub and
the upstream owner, beyond this fork's branch/tag cleanup.

The 2026-10-29 import maps raw 51f63e4fd63aeeb74d708b9c3d1f8b800aff9b3e to sanitized 47374eb672987bd2e70b4d2025cedc158fbe5c17, anchored on verified raw 817e59f698f01487920c00ede2dbecad5c0fa50 / sanitized df8cbef585dd5ed1d00fb5e1497f36f8d7052653. All 98 newly reachable objects (883,540 bytes) were scanned against the private UTF-8/UTF-16 removed-value set, with zero matches. The protected original incremental bundle is retained; no raw ancestry was imported.
