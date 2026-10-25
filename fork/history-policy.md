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

Never merge raw upstream ancestry into `avx1`. Fetch selected upstream heads
and source tags into a private bare snapshot, preserve and verify a protected
original bundle, then run `sanitize-upstream.py` with private replacement input.
Keep the same path filters and tool version so ancestry mapping is reproducible.
Review new findings and scan all reachable objects before merging the sanitized
head. Do not publish replacement files, raw refs, runtime caches or scan excerpts
containing values. Push only reviewed branch/tag refs; never use `push --mirror`.

Rewriting this fork's advertised refs does not erase the official upstream,
other clones, GitHub caches or objects retained by the shared fork network.
Server-side eradication of historical objects is controlled by GitHub and
the upstream owner, beyond this fork's branch/tag cleanup.
