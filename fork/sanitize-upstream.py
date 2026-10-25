"""Sanitize a disposable bare upstream snapshot before public integration.

Requires git-filter-repo==2.47.0 and a verified private bundle of the raw refs.
Replacement patterns are private input and must never be committed.
This command never pushes refs or modifies a checked-out worktree.
"""
import argparse, importlib.metadata, pathlib, subprocess, sys

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--repository', required=True, type=pathlib.Path)
p.add_argument('--original-bundle', required=True, type=pathlib.Path)
p.add_argument('--private-replacements', required=True, type=pathlib.Path)
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
subprocess.run([sys.executable, '-m', 'git_filter_repo', '--force',
    '--replace-text', str(patterns), '--replace-message', str(patterns),
    '--path-regex', r'(^|/)\.cline/remote-config/cache(/|$)',
    '--path-regex', r'(^|/)data/cache/remote_config_[^/]+\.json$',
    '--invert-paths'], cwd=repo, check=True)
print('Sanitized snapshot ready. Scan all reachable objects before integration or push.')
