"""Sanitize a disposable bare upstream snapshot before public integration.

Requires git-filter-repo==2.47.0 and a verified private bundle of the raw refs.
Replacement patterns are private input and must never be committed.
This command never pushes refs or modifies a checked-out worktree.
"""
import argparse, importlib.metadata, pathlib, re, subprocess, sys

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--repository', required=True, type=pathlib.Path)
p.add_argument('--original-bundle', required=True, type=pathlib.Path)
p.add_argument('--private-replacements', required=True, type=pathlib.Path)
p.add_argument('--raw-base', help='Previously archived upstream main SHA')
p.add_argument('--sanitized-base', help='Its already verified public counterpart')
a = p.parse_args()
repo = a.repository.resolve(strict=True)
bundle = a.original_bundle.resolve(strict=True)
patterns = a.private_replacements.resolve(strict=True)
if importlib.metadata.version('git-filter-repo') != '2.47.0':
    raise SystemExit('git-filter-repo 2.47.0 is required')
if subprocess.check_output(['git', 'rev-parse', '--is-bare-repository'], cwd=repo, text=True).strip() != 'true':
    raise SystemExit('Use a disposable bare snapshot, never the source checkout')
refs = subprocess.check_output(['git', 'for-each-ref', '--format=%(refname)'], cwd=repo, text=True).splitlines()
if any(not r.startswith(('refs/heads/', 'refs/tags/')) for r in refs):
    raise SystemExit('Snapshot must contain only selected branch heads and source tags')
if bundle.is_relative_to(repo) or patterns.is_relative_to(repo):
    raise SystemExit('Original bundle and private patterns must be outside the snapshot')
subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=repo, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
incremental = []
if bool(a.raw_base) != bool(a.sanitized_base):
    raise SystemExit('Both base SHAs are required for anchored incremental import')
if a.raw_base:
    if not all(re.fullmatch(r'[0-9a-f]{40}', value) for value in (a.raw_base, a.sanitized_base)):
        raise SystemExit('Full SHA1 base identifiers are required')
    for ref in (a.raw_base, a.sanitized_base):
        subprocess.run(['git', 'cat-file', '-e', ref+'^{commit}'], cwd=repo, check=True)
    subprocess.run(['git', 'merge-base', '--is-ancestor', a.raw_base, 'refs/heads/main'], cwd=repo, check=True)
    rows = subprocess.check_output(['git', 'rev-list', '--parents', 'refs/heads/main', '^'+a.raw_base], cwd=repo, text=True).splitlines()
    commits = {row.split()[0] for row in rows}
    if not commits:
        raise SystemExit('No new upstream commits')
    # Never import an unverified old side-branch parent. Such merges require
    # additional independently verified anchors, not an automatic raw import.
    if any(parent not in commits and parent != a.raw_base for row in rows for parent in row.split()[1:]):
        raise SystemExit('Unmapped boundary parent: a verified additional anchor is required')
    callback = 'commit.parents = [b"'+a.sanitized_base+'" if parent == b"'+a.raw_base+'" else parent for parent in commit.parents]'
    incremental = ['--refs', a.raw_base+'..refs/heads/main', '--commit-callback', callback]
subprocess.run([sys.executable, '-m', 'git_filter_repo', '--force',
    '--replace-text', str(patterns), '--replace-message', str(patterns),
    '--path-regex', r'(^|/)\.cline/remote-config/cache(/|$)',
    '--path-regex', r'(^|/)data/cache/remote_config_[^/]+\.json$',
    '--invert-paths', *incremental], cwd=repo, check=True)
if a.raw_base:
    subprocess.run(['git', 'merge-base', '--is-ancestor', a.sanitized_base, 'refs/heads/main'], cwd=repo, check=True)
    clean_rows = subprocess.check_output(['git', 'rev-list', '--parents', 'refs/heads/main', '^'+a.sanitized_base], cwd=repo, text=True).splitlines()
    clean_commits = {row.split()[0] for row in clean_rows}
    if any(parent not in clean_commits and parent != a.sanitized_base for row in clean_rows for parent in row.split()[1:]):
        raise SystemExit('Sanitized history contains an unexpected boundary parent')
print('Sanitized snapshot ready. Scan all reachable objects before integration or push.')
