"""Reproducible Windows-only DSW2API resource preparation; no global installs."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'fork/dsw2api'
TARGET = ROOT / 'apps/examples/desktop-app/src-tauri/bin/dsw2api'
CACHE = Path(os.environ.get('CLINE_DSW_DOWNLOAD_CACHE', ROOT / '.build-cache/dsw2api'))
FLAGS = ['--edition=2021', '-C', 'opt-level=3', '-C', 'lto=thin', '-C', 'codegen-units=1',
         '-C', 'target-cpu=x86-64', '-C', 'target-feature=-avx2,-fma,+crt-static',
         '-C', 'debuginfo=0', '-C', 'strip=debuginfo', '-C', 'link-arg=/PDBALTPATH:cline-dsw2api-pow.pdb',
         f'--remap-path-prefix={ROOT.as_posix()}=/src/cline']
PUBLIC_FLAGS = [flag.replace(ROOT.as_posix(), '<checkout>') for flag in FLAGS]


def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()


def source_bytes(path):
    # The vendored source inventory is text-only. Windows checkout line endings
    # must not change the resource identity or packaged gateway sources.
    return path.read_bytes().replace(b'\r\n', b'\n')


def copy_sources(source, destination):
    for path in source.rglob('*'):
        if '__pycache__' in path.parts or path.suffix == '.pyc': continue
        if path.is_symlink() or path.is_junction(): raise RuntimeError('Source link refused')
        if path.is_file():
            target = destination / path.relative_to(source)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source_bytes(path))


def extract(archive, directory, wheel=False):
    with zipfile.ZipFile(archive) as source:
        for entry in source.infolist():
            path = PurePosixPath(entry.filename)
            if stat.S_ISLNK(entry.external_attr >> 16) or path.is_absolute() or '..' in path.parts or any(':' in p or '\\' in p for p in path.parts):
                raise RuntimeError('Unsafe archive member')
            parts = path.parts
            if wheel and parts and parts[0].endswith('.data'):
                if len(parts) < 3 or parts[1] not in ('purelib', 'platlib'):
                    # Retain data-directory notices instead of installing scripts.
                    if any('license' in p.lower() or 'notice' in p.lower() or 'copying' in p.lower() for p in parts):
                        parts = ('bundled-data-notices', *parts)
                    else: continue
                else: parts = parts[2:]
            target = directory.joinpath(*parts)
            if not target.resolve().is_relative_to(directory.resolve()): raise RuntimeError('Archive escapes target')
            if entry.is_dir(): target.mkdir(parents=True, exist_ok=True); continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with source.open(entry) as incoming, target.open('wb') as outgoing: shutil.copyfileobj(incoming, outgoing)


def download(row):
    path = CACHE / row.get('filename', 'python-3.14.10-embed-amd64.zip')
    subprocess.run([sys.executable, str(ROOT / 'fork/download.py'), row['url'], str(path), row['sha256']], check=True, stdout=subprocess.DEVNULL)
    return path


def main():
    if sys.platform != 'win32': raise RuntimeError('Windows x64 build required')
    CACHE.mkdir(parents=True, exist_ok=True)
    lock = json.loads((SOURCE / 'runtime-lock.json').read_text(encoding='utf8'))
    rust = subprocess.check_output(['rustc', '--version'], text=True).strip()
    if not rust.startswith('rustc 1.97.0 '): raise RuntimeError('Pinned Rust 1.97.0 required')
    sources = {p.relative_to(SOURCE).as_posix(): hashlib.sha256(source_bytes(p)).hexdigest() for p in sorted(SOURCE.rglob('*')) if p.is_file() and '__pycache__' not in p.parts}
    fingerprint = hashlib.sha256(json.dumps({'sources': sources, 'recipe': hashlib.sha256(source_bytes(Path(__file__))).hexdigest(), 'flags': PUBLIC_FLAGS, 'rust': rust}, sort_keys=True).encode()).hexdigest()
    if TARGET.exists():
        if TARGET.is_symlink() or TARGET.is_junction() or not (TARGET / '.managed-build').is_file(): raise RuntimeError('Unowned resource directory')
        old = json.loads((TARGET / 'manifest.json').read_text(encoding='utf8'))
        if old.get('build_id') == fingerprint and all((TARGET / name).is_file() and sha(TARGET / name) == digest for name, digest in old['files'].items()):
            print('Verified cached DSW2API resources'); return
    archives = [lock['python_archive'], *lock['wheels']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: paths = list(pool.map(download, archives))
    stage_parent = ROOT / '.build-cache/dsw-stage'
    stage_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=stage_parent) as temporary:
        stage = Path(temporary) / 'dsw2api'; stage.mkdir()
        runtime = stage / 'runtime'; runtime.mkdir()
        extract(paths[0], runtime)
        site = runtime / 'Lib/site-packages'; site.mkdir(parents=True)
        for wheel in paths[1:]: extract(wheel, site, wheel=True)
        (runtime / 'python314._pth').write_text('python314.zip\n.\nLib/site-packages\n../gateway\nimport site\n', encoding='utf8')
        copy_sources(SOURCE / 'gateway', stage / 'gateway')
        (stage / 'components.json').write_bytes(source_bytes(SOURCE / 'runtime-lock.json'))
        (stage / 'SOURCE.json').write_bytes(source_bytes(SOURCE / 'SOURCE.json'))
        copy_sources(SOURCE / 'pow', stage / 'native-source')
        test_executable = Path(temporary) / 'native-tests.exe'
        subprocess.run(['rustc', *FLAGS, '--test', str(SOURCE / 'pow/main.rs'), '-o', str(test_executable)], check=True)
        subprocess.run([str(test_executable)], check=True)
        subprocess.run(['rustc', *FLAGS, str(SOURCE / 'pow/main.rs'), '-o', str(stage / 'cline-dsw2api-pow.exe')], check=True)
        # Debug companion files are build-only, never installer resources.
        debug_symbols = stage / 'cline-dsw2api-pow.pdb'
        if debug_symbols.is_file(): debug_symbols.unlink()
        subprocess.run([str(runtime / 'python.exe'), '-I', '-B', '-X', 'utf8', '-c',
            'import ssl,sqlite3,ctypes,fastapi,uvicorn,curl_cffi,PIL,jsonschema,referencing,cryptography; from cryptography.fernet import Fernet; f=Fernet(Fernet.generate_key()); assert f.decrypt(f.encrypt(b"fixture"))==b"fixture"'], check=True)
        (stage / '.managed-build').write_text('generated-build-resources-v1\n', encoding='utf8')
        files = {p.relative_to(stage).as_posix(): sha(p) for p in sorted(stage.rglob('*')) if p.is_file()}
        (stage / 'manifest.json').write_text(json.dumps({'build_id': fingerprint, 'rust': rust, 'native_flags': PUBLIC_FLAGS,
            'files': files, 'usage_counts': 'character heuristic, not vendor token counts', 'runtime': 'official prebuilt Python and hash-pinned wheels'}, indent=2), encoding='utf8')
        TARGET.parent.mkdir(parents=True, exist_ok=True)
        if TARGET.exists():
            # Only our generated build directory; never installed files or state.
            if TARGET.resolve() != (ROOT / 'apps/examples/desktop-app/src-tauri/bin/dsw2api').absolute(): raise RuntimeError('Resource path redirected')
            if any(p.is_symlink() or p.is_junction() for p in TARGET.rglob('*')): raise RuntimeError('Resource link refused')
            shutil.rmtree(TARGET)
        shutil.copytree(stage, TARGET)
    print('DSW2API resources prepared and verified:', fingerprint)


if __name__ == '__main__': main()
