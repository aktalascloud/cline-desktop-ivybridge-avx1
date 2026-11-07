"""Export or verify only the active fork overlay; never mirror upstream PRs."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / "patches"
MANIFEST = DIRECTORY / "manifest.json"
GENERATED = {
    "fork/components.json", "fork/qualification.json", "fork/review-ledger.json",
    "fork/updater/latest.json", "fork/STATUS.md", "fork/security.md", "fork/performance.md",
}

def git(*args, env=None):
    return subprocess.check_output(["git", *args], cwd=ROOT, env=env)

def excluded(path):
    return path.startswith("patches/") or path in GENERATED

def group(path):
    if path.startswith(("apps/examples/desktop-app/", "sdk/packages/ui/")):
        return "002-desktop-ui-native.patch"
    if path.startswith(("sdk/packages/", "sdk/examples/")):
        return "001-sdk.patch"
    return "003-distribution.patch"

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--base", help="Verified sanitized upstream commit for a new snapshot")
parser.add_argument("--raw-upstream", help="Reviewed original upstream SHA, provenance only")
parser.add_argument("--check", action="store_true")
args = parser.parse_args()
previous = json.loads(MANIFEST.read_text("utf8")) if MANIFEST.exists() else {}
base = args.base or previous.get("sanitized_upstream")
if not base or len(base) != 40:
    raise SystemExit("A full verified sanitized upstream SHA is required")
git("cat-file", "-e", base + "^{commit}")
unstaged = git("diff", "--name-only", "-z").decode().split("\0")
untracked = git("ls-files", "--others", "--exclude-standard", "-z").decode().split("\0")
if any(p and not excluded(p) for p in unstaged + untracked):
    raise SystemExit("Stage reviewed source changes before exporting/checking their exact overlay")
changed = [p for p in git("diff", "--cached", "--name-only", "-z", base).decode().split("\0") if p and not excluded(p)]
groups = {}
for path in changed:
    groups.setdefault(group(path), []).append(path)
dependencies = json.loads((ROOT / "package.json").read_text("utf8"))["patchedDependencies"]
dependency_rows = [{"package": name, "file": path, "sha256": digest(ROOT / path)} for name, path in dependencies.items()]
rows = []
for name, paths in sorted(groups.items()):
    patch = git("diff", "--cached", "--binary", "--full-index", "--no-renames", "--unified=0", base, "--", *paths)
    target = DIRECTORY / "local" / name
    if args.check:
        if not target.is_file() or target.read_bytes() != patch:
            raise SystemExit("Active overlay is stale: " + name)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(patch)
    rows.append({"file": "patches/local/" + name, "sha256": digest(target), "source_files": paths})
expected = {r["file"] for r in rows + dependency_rows}
actual = {p.relative_to(ROOT).as_posix() for p in DIRECTORY.rglob("*.patch")}
if actual != expected:
    raise SystemExit("Unapplied/missing patch files: " + repr(sorted(actual ^ expected)))
manifest = {"schema": 1, "sanitized_upstream": base, "raw_upstream": args.raw_upstream or previous.get("raw_upstream"), "overlays": rows, "bun_dependencies": dependency_rows, "generated_receipts_excluded": sorted(GENERATED), "upstream_commits_not_duplicated": True}
if args.check:
    if manifest != previous:
        raise SystemExit("Patch manifest is stale")
else:
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8", newline="\n")

# Replay against a disposable index, preserving the checkout and the real index.
cache = ROOT / ".build-cache"
cache.mkdir(exist_ok=True)
fd, name = tempfile.mkstemp(prefix="patch-check-", suffix=".index", dir=cache)
os.close(fd)
index = Path(name)
assert index.resolve().is_relative_to(cache.resolve())
index.unlink()
env = {**os.environ, "GIT_INDEX_FILE": str(index)}
try:
    git("read-tree", base, env=env)
    for row in rows:
        git("apply", "--cached", "--unidiff-zero", "--whitespace=nowarn", row["file"], env=env)
    replay = {line.split(b"\t", 1)[1]: line.split(b"\t", 1)[0] for line in git("ls-files", "--stage", "-z", env=env).split(b"\0") if line}
    current = {line.split(b"\t", 1)[1]: line.split(b"\t", 1)[0] for line in git("ls-files", "--stage", "-z").split(b"\0") if line}
    for path in set(replay) | set(current):
        if not excluded(path.decode()) and replay.get(path) != current.get(path):
            raise SystemExit("Overlay replay does not reproduce source: " + path.decode())
finally:
    index.unlink(missing_ok=True)
    index.with_name(index.name + ".lock").unlink(missing_ok=True)
print(json.dumps({"passed": True, "overlays": len(rows), "active_bun_patches": len(dependency_rows), "fork_source_files": len(changed), "replay_matches_source": True, "real_index_and_checkout_unchanged": True}))
