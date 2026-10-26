"""Real Git regression: anchored import redacts data and refuses an old unmapped parent."""
import pathlib, subprocess, sys, tempfile, unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'sanitize-upstream.py'

class AnchoredImportTest(unittest.TestCase):
    def test_redaction_anchor_and_unmapped_parent(self):
        with tempfile.TemporaryDirectory(prefix='cline-sanitize-test-') as directory:
            root = pathlib.Path(directory).resolve()
            raw = root/'raw'; raw.mkdir()
            def git(where, *args, check=True):
                return subprocess.run(['git', '-C', str(where), *args], check=check,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.decode('utf-8').strip()
            git(raw, 'init', '-b', 'main')
            git(raw, 'config', 'user.name', 'Fixture')
            git(raw, 'config', 'user.email', 'fixture@example.invalid')
            def commit(message):
                git(raw, 'add', '.')
                git(raw, 'commit', '-m', message)
                return git(raw, 'rev-parse', 'HEAD')
            (raw/'main.txt').write_text('first\n')
            cache=raw/'.cline/remote-config/cache';cache.mkdir(parents=True)
            (cache/'fixture.json').write_text('example_sensitive_value')
            first = commit('first')
            (raw/'main.txt').write_text('baseline\n')
            raw_base = commit('baseline')
            patterns=root/'replacements.txt'
            patterns.write_text('literal:example_sensitive_value==>REMOVED\n')
            bundle=root/'original.bundle';git(raw, 'bundle', 'create', str(bundle), '--all')
            clean=root/'clean.git';git(root, 'clone', '--bare', str(raw), str(clean))
            def sanitize(repo, archive, *extra, check=True):
                return subprocess.run([sys.executable, str(SCRIPT), '--repository', str(repo),
                    '--original-bundle', str(archive), '--private-replacements', str(patterns), *extra],
                    capture_output=True, check=check)
            sanitize(clean, bundle)
            clean_base=git(clean, 'rev-parse', 'main')
            (raw/'main.txt').write_text('example_sensitive_value\n')
            new_cache=raw/'data/cache';new_cache.mkdir(parents=True)
            (new_cache/'remote_config_new.json').write_text('example_sensitive_value')
            commit('example_sensitive_value new change')
            incremental=root/'incremental.bundle'
            git(raw, 'bundle', 'create', str(incremental), 'main', '^'+raw_base)
            candidate=root/'candidate.git';git(root, 'clone', '--bare', str(raw), str(candidate))
            git(candidate, 'fetch', '--no-tags', str(clean), 'main:refs/heads/verified-base')
            sanitize(candidate, incremental, '--raw-base', raw_base, '--sanitized-base', clean_base)
            self.assertEqual(git(candidate, 'merge-base', clean_base, 'main'), clean_base)
            self.assertEqual(git(candidate, 'show', 'main:main.txt'), 'REMOVED')
            self.assertNotIn('example_sensitive_value', git(candidate, 'log', '-1', '--format=%B', 'main'))
            paths=git(candidate, 'ls-tree', '-r', '--name-only', 'main')
            self.assertNotIn('remote-config/cache', paths)
            self.assertNotIn('remote_config_new.json', paths)
            self.assertEqual(git(candidate, 'rev-list', '--count', 'main', '^'+clean_base), '1')
            # A side branch forked before raw_base must not reintroduce old raw ancestry.
            git(raw, 'checkout', '-b', 'side', first)
            (raw/'side.txt').write_text('side\n');commit('side')
            git(raw, 'checkout', 'main');git(raw, 'merge', '--no-ff', 'side', '-m', 'merge side')
            mixed=root/'mixed.bundle';git(raw, 'bundle', 'create', str(mixed), '--all')
            unsafe=root/'unsafe.git';git(root, 'clone', '--bare', str(raw), str(unsafe))
            git(unsafe, 'fetch', '--no-tags', str(clean), 'main:refs/heads/verified-base')
            before=git(unsafe, 'rev-parse', 'main')
            rejected=sanitize(unsafe, mixed, '--raw-base', raw_base, '--sanitized-base', clean_base, check=False)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn(b'Unmapped boundary parent', rejected.stderr)
            self.assertEqual(git(unsafe, 'rev-parse', 'main'), before)

if __name__ == '__main__':
    unittest.main()
