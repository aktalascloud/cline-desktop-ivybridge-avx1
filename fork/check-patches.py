"""Verify exact replay of the active patches against the sanitized upstream base."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
patches = root / 'patches/local'
manifest = json.loads((patches / 'manifest.json').read_text('utf8'))
names = {item['file'] for item in manifest['patches']}
assert names == {path.name for path in patches.glob('*.patch')}

with tempfile.TemporaryDirectory() as temp:
    env = {**os.environ, 'GIT_INDEX_FILE': str(Path(temp) / 'index')}
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=root, env=env)
    git('read-tree', manifest['sanitized_base'])
    for item in manifest['patches']:
        patch = patches / item['file']
        assert hashlib.sha256(patch.read_bytes()).hexdigest() == item['sha256']
        git('apply', '--cached', str(patch))
    tree = git('write-tree').decode().strip()
    assert tree == manifest['build_tree'], tree
    changed = set(git('diff', '--name-only', '-z', tree, 'HEAD').decode().rstrip('\0').split('\0'))
    assert changed <= set(manifest['publication_files']), changed - set(manifest['publication_files'])
print(f'{len(names)} active patches reproduce {tree}')
